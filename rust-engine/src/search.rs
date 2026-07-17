// Search engine: Negamax+PVS+TT+Quiescence+NullMove+LMR+IID+Killers+CounterMove+History
// 1:1 移植自 js/engine-worker.js
use crate::board::*;
use crate::rules::*;
// zh 变体在 rules 里，通过 crate::rules::make_move_zh/unmake_move_zh 使用
use crate::eval::evaluate;
use crate::zobrist::*;
use crate::see::see_capture;
use std::collections::HashMap;

pub const MATE: i32 = 60000;
pub const MATE_THRESHOLD: i32 = MATE - 200;
pub const INF: i32 = MATE + 1000;
pub const TT_SIZE: usize = 1 << 19;

#[derive(Clone, Copy, Default)]
pub struct TTEntry { pub h: u64, pub d: i32, pub f: u8, pub v: i32, pub mv: (i32,i32,i32,i32), pub has_mv: bool, pub used: bool, pub age: u8 }
pub const TT_EXACT: u8 = 0; pub const TT_LOWER: u8 = 1; pub const TT_UPPER: u8 = 2;

pub struct SearchCtx {
    pub tt: Vec<TTEntry>,
    pub z: Zobrist,
    pub history: HashMap<u32, i32>,
    pub nodes: u64,
    pub stop: bool,
    pub start_time_ms: f64,
    pub time_limit_ms: f64,
    pub rng_state: u64,
    pub current_hash: u64,  // Step 4: 增量维护当前根+搜索路径的 hash
    pub path_hash: Vec<u64>,  // Step 5: 搜索路径 hash 栈，用于全路径重复检测
    pub path_gives_check: Vec<bool>,  // Step 5: 每 ply 是否将军对方（用于长将判负）
    pub deadline_ms: f64,  // Step 6: 绝对时间戳截止；超过则设置 stop
    pub tt_age: u8,  // Step 9A: TT aging；每次 ai_move 递增，旧 age 条目优先淘汰
    pub eval_stack: Vec<i32>,  // Step 9B: 每 ply 的静态评估（negamax 视角），用于 improving 启发
    // A3: 60 步无吃子判和（半手 clock 栈；每 make push，每 unmake pop）
    // 0 = 上一手是吃子；否则递增。当栈顶 >= 120（60 全手）→ 视为和棋 = 0
    pub halfmove_clock: Vec<i32>,
    // Step 15: Singular Extension —— 当 Some 时，negamax 在本层跳过该走法且不做 TT probe/put/null-move/IID
    pub excluded: Option<(i32,i32,i32,i32)>,
}

impl SearchCtx {
    pub fn new() -> Self {
        Self {
            tt: vec![TTEntry::default(); TT_SIZE],
            z: build_zobrist(0xC0FFEE_1234_5678),
            history: HashMap::new(),
            nodes: 0, stop: false, start_time_ms: 0.0, time_limit_ms: 0.0,
            rng_state: 0xDEADBEEF_CAFEBABE,
            current_hash: 0,
            path_hash: Vec::with_capacity(128),
            path_gives_check: Vec::with_capacity(128),
            deadline_ms: 0.0,
            tt_age: 0,
            eval_stack: vec![0; 256],
            halfmove_clock: Vec::with_capacity(128),
            excluded: None,
        }
    }
    pub fn clear_tt(&mut self) { for e in self.tt.iter_mut() { *e = TTEntry::default(); } }
    pub fn reset_history(&mut self) { self.history.clear(); }
    #[inline] fn rand_next(&mut self) -> u64 {
        // xorshift64
        let mut x = self.rng_state; x ^= x << 13; x ^= x >> 7; x ^= x << 17;
        self.rng_state = x; x
    }
    #[inline] fn rand_f64(&mut self) -> f64 { (self.rand_next() as f64) / (u64::MAX as f64) }
}

#[inline(always)] fn tt_idx(h: u64) -> usize { (h as usize) & (TT_SIZE - 1) }

fn tt_get<'a>(ctx: &'a SearchCtx, h: u64) -> Option<&'a TTEntry> {
    let e = &ctx.tt[tt_idx(h)]; if e.used && e.h == h { Some(e) } else { None }
}
fn tt_put(ctx: &mut SearchCtx, h: u64, d: i32, f: u8, v: i32, mv: (i32,i32,i32,i32)) {
    let i = tt_idx(h);
    let replace = {
        let o = &ctx.tt[i];
        // Step 9A: TT aging 替换策略（去掉随机数，替换更确定）
        // 1) 空槽 → 直接写
        // 2) 旧 age（跨局） → 直接覆盖
        // 3) 同 age 时 depth >= 老条目 → 覆盖
        // 4) 同 age 老条目是 UPPER（相对不可靠）→ 覆盖
        !o.used || o.age != ctx.tt_age || d >= o.d || o.f == TT_UPPER
    };
    if replace { ctx.tt[i] = TTEntry { h, d, f, v, mv, has_mv: true, used: true, age: ctx.tt_age }; }
}

#[inline(always)] fn h_key(fr: i32, fc: i32, tr: i32, tc: i32) -> u32 { (fr*1000 + fc*100 + tr*10 + tc) as u32 }

/// A3: 更新 halfmove_clock 栈 —— 吃子重置为 0，非吃子在上一层基础上 +1
#[inline]
fn push_halfmove(ctx: &mut SearchCtx, captured: u8) {
    let prev = *ctx.halfmove_clock.last().unwrap_or(&0);
    let new = if captured != 0 { 0 } else { prev + 1 };
    ctx.halfmove_clock.push(new);
}

fn is_valid_move(board: &mut Board, red: bool, mv: (i32,i32,i32,i32)) -> bool {
    let (fr, fc, tr, tc) = mv;
    if !in_board(fr,fc) || !in_board(tr,tc) { return false; }
    let p = board[idx(fr,fc)]; if p == 0 { return false; }
    if red && !is_red(p) { return false; }
    if !red && !is_black(p) { return false; }
    is_legal_move(board, fr, fc, tr, tc)
}

fn score_moves(
    board: &Board, moves: &[(i32,i32,i32,i32)],
    tt_best: Option<(i32,i32,i32,i32)>,
    k1: Option<(i32,i32,i32,i32)>, k2: Option<(i32,i32,i32,i32)>,
    counter_move: Option<(i32,i32,i32,i32)>,
    history: &HashMap<u32,i32>,
) -> Vec<((i32,i32,i32,i32), i32)> {
    let mut scored: Vec<((i32,i32,i32,i32), i32)> = Vec::with_capacity(moves.len());
    for &mv in moves.iter() {
        let (fr, fc, tr, tc) = mv;
        let mut s;
        if Some(mv) == tt_best { s = 10_000_000; }
        else {
            let victim = board[idx(tr,tc)]; let attacker = board[idx(fr,fc)];
            if victim != 0 {
                // SEE 检查：负 SEE 吃子降级到 quiet 之后但仍在 history 之上
                let see_v = see_capture(board, fr, fc, tr, tc);
                if see_v >= 0 {
                    s = 500_000 + pval(piece_type_lower(victim)) * 16 - pval(piece_type_lower(attacker));
                } else {
                    s = 20_000 + see_v;  // 负 SEE：排到 quiet 之后（history 上限约 depth^2*63=63*49<10K）
                }
            } else {
                if Some(mv) == k1 { s = 50_000; }
                else if Some(mv) == k2 { s = 40_000; }
                else if Some(mv) == counter_move { s = 30_000; }
                else { s = *history.get(&h_key(fr,fc,tr,tc)).unwrap_or(&0); }
            }
        }
        scored.push((mv, s));
    }
    scored.sort_by(|a, b| b.1.cmp(&a.1));
    scored
}

fn quiesce(
    ctx: &mut SearchCtx, board: &mut Board,
    mut alpha: i32, beta: i32, red_to_move: bool, depth: i32, ply: i32,
) -> i32 {
    ctx.nodes += 1;
    if (ctx.nodes & 0xFFF) == 0 {
        if ctx.deadline_ms > 0.0 && js_sys::Date::now() > ctx.deadline_ms { ctx.stop = true; }
    }
    if ctx.stop { return alpha; }
    let in_chk = in_check(board, red_to_move);
    let stand_pat = if red_to_move { evaluate(board, red_to_move) } else { -evaluate(board, red_to_move) };
    if in_chk {
        let moves = all_legal_moves(board, red_to_move);
        if moves.is_empty() { return -MATE + ply; }
        let mut best = stand_pat;
        if best < beta {
            for (fr,fc,tr,tc) in moves {
                let u = crate::rules::make_move_zh(board, fr, fc, tr, tc, &mut ctx.current_hash, &ctx.z);
                ctx.path_hash.push(ctx.current_hash);
                ctx.path_gives_check.push(in_check(board, !red_to_move));
                push_halfmove(ctx, u.captured);
                let val = -quiesce(ctx, board, -beta, -alpha, !red_to_move, depth-1, ply+1);
                ctx.path_hash.pop();
                ctx.path_gives_check.pop();
                ctx.halfmove_clock.pop();
                crate::rules::unmake_move_zh(board, u, &mut ctx.current_hash, &ctx.z);
                if val > best { best = val; }
                if best > alpha { alpha = best; }
                if alpha >= beta { break; }
            }
        }
        return best;
    }
    if stand_pat >= beta { return beta; }
    if stand_pat > alpha { alpha = stand_pat; }
    if depth < -4 { return alpha; }
    let delta = 1000;
    let mut cap_moves = legal_captures(board, red_to_move);
    // sort: JS uses raw diff (see engine-worker.js)
    cap_moves.sort_by(|a, b| {
        let va = pval(piece_type_lower(board[idx(a.2,a.3)])) * 16;
        let vb = pval(piece_type_lower(board[idx(b.2,b.3)])) * 16;
        let aa = pval(piece_type_lower(board[idx(a.0,a.1)]));
        let ab = pval(piece_type_lower(board[idx(b.0,b.1)]));
        (vb - ab).cmp(&(va - aa))
    });
    for (fr,fc,tr,tc) in cap_moves {
        let vv = pval(piece_type_lower(board[idx(tr,tc)]));
        if stand_pat + vv + delta < alpha { continue; }
        // SEE 过滤：明显亏损的吃子直接跳过（不影响吃将，将不会出现在 legal captures 里）
        if see_capture(board, fr, fc, tr, tc) < 0 { continue; }
        let u = crate::rules::make_move_zh(board, fr, fc, tr, tc, &mut ctx.current_hash, &ctx.z);
        ctx.path_hash.push(ctx.current_hash);
        ctx.path_gives_check.push(in_check(board, !red_to_move));
        push_halfmove(ctx, u.captured);
        let val = -quiesce(ctx, board, -beta, -alpha, !red_to_move, depth-1, ply+1);
        ctx.path_hash.pop();
        ctx.path_gives_check.pop();
        ctx.halfmove_clock.pop();
        crate::rules::unmake_move_zh(board, u, &mut ctx.current_hash, &ctx.z);
        if val >= beta { return beta; }
        if val > alpha { alpha = val; }
    }
    alpha
}

fn negamax(
    ctx: &mut SearchCtx, board: &mut Board,
    mut depth: i32, mut alpha: i32, mut beta: i32,
    red_to_move: bool, ply: i32,
    killers: &mut Vec<Option<(i32,i32,i32,i32)>>, // len 256 (2 per ply)
    counter_moves: &mut HashMap<u32, (i32,i32,i32,i32)>,
    ply_stack: &mut Vec<Option<(i32,i32,i32,i32)>>, // 记录每 ply 走的着（作为下一步 counter 的 prev）
    allow_null: bool,
    is_pv: bool,
    rep_count: &HashMap<u64, i32>,
) -> i32 {
    ctx.nodes += 1;
    // Step 6: 每 4096 节点检查一次时间/停止信号
    if (ctx.nodes & 0xFFF) == 0 {
        if ctx.deadline_ms > 0.0 && js_sys::Date::now() > ctx.deadline_ms { ctx.stop = true; }
    }
    if ctx.stop { return alpha; }
    // Step 5: 全路径 + 历史重复检测
    // 1) 搜索路径中出现同一 hash → 立即返回 0（避免虚假 PV）
    // 2) 历史 rep_count 已 ≥1 且再重复 → 也视为循环
    if ply > 0 {
        let ck = ctx.current_hash;
        // 检查搜索路径中是否已存在（跳过路径末尾 = 当前节点自身，由父层 push）
        let plen = ctx.path_hash.len();
        for i in (0..plen.saturating_sub(1)).rev() {
            let h = ctx.path_hash[i];
            if h == ck {
                // 长将判负：若近 N 手所有己方走的都是将军，我方主动重复 = 长将判负
                // 简化实现：若路径末尾 6 个 half-move 中，己方每一手都 gives_check → 判该方负
                let n = ctx.path_gives_check.len();
                if n >= 6 {
                    // 己方走的是偶数 ply（相对当前局面）：反查路径倒数 6 层
                    let mut all_me_check = true;
                    // path_gives_check[i] 表示 push 第 i 层时的 gives_check（也就是当前方"上一步走完后"是否将了对手）
                    // 我方最近走了 3 次，交替间隔 2
                    for j in 0..3 {
                        let idx_from_end = 1 + j*2;
                        if idx_from_end > n { all_me_check = false; break; }
                        if !ctx.path_gives_check[n - idx_from_end] { all_me_check = false; break; }
                    }
                    if all_me_check {
                        return -MATE + ply;  // 我方长将 → 判负
                    }
                }
                return 0;
            }
        }
        // 历史（走过的实际棋谱）重复
        if *rep_count.get(&ck).unwrap_or(&0) >= 1 { return 0; }
        // A3: 60 步无吃子判和（120 半手）
        if *ctx.halfmove_clock.last().unwrap_or(&0) >= 120 { return 0; }
    }
    if alpha < -MATE + ply { alpha = -MATE + ply; }
    if beta > MATE - ply - 1 { beta = MATE - ply - 1; }
    if alpha >= beta { return alpha; }

    if depth <= 0 { return quiesce(ctx, board, alpha, beta, red_to_move, 0, ply); }

    let hash = ctx.current_hash;
    #[cfg(debug_assertions)]
    debug_assert_eq!(hash, board_hash(&ctx.z, board, red_to_move), "incremental hash out of sync");
    // Step 15: 消费 excluded（本层生效一次）；SE 探测节点不做 TT probe/put/null-move/IID
    let excluded = ctx.excluded.take();
    let mut tt_best: Option<(i32,i32,i32,i32)> = None;
    let mut tt_v_for_se: Option<i32> = None;
    let mut tt_flag_for_se: u8 = 0;
    let mut tt_d_for_se: i32 = 0;
    if excluded.is_none() {
        if let Some(tte) = tt_get(ctx, hash) {
            if tte.has_mv { tt_best = Some(tte.mv); }
            tt_v_for_se = Some(tte.v);
            tt_flag_for_se = tte.f;
            tt_d_for_se = tte.d;
            if tte.d >= depth {
                match tte.f {
                    TT_EXACT => return tte.v,
                    TT_LOWER => if tte.v >= beta { return tte.v; },
                    TT_UPPER => if tte.v <= alpha { return tte.v; },
                    _ => {}
                }
            }
        }
    }

    let in_chk = in_check(board, red_to_move);
    if in_chk { depth += 1; }

    // Step 9B: 只在浅层（razoring/futility 可能触发的深度）计算静态评估并维护 eval_stack。
    // 深层节点不做静态评估，避免额外开销。
    let mut static_eval: i32 = 0;
    let mut static_eval_valid = false;
    if !in_chk && depth <= 4 {
        let sv = evaluate(board, red_to_move);
        static_eval = if red_to_move { sv } else { -sv };
        static_eval_valid = true;
        let pi = ply as usize;
        if pi < ctx.eval_stack.len() { ctx.eval_stack[pi] = static_eval; }
    }
    // Step 9B: Improving = 当前静态评估 > 2 ply 前的静态评估（仅在 static_eval_valid 时可用）
    let improving = static_eval_valid && ply >= 2 && {
        let pi2 = (ply - 2) as usize;
        pi2 < ctx.eval_stack.len() && static_eval > ctx.eval_stack[pi2]
    };

    // Razoring（不动 margin）
    if !is_pv && !in_chk && depth <= 3 && static_eval_valid {
        if static_eval + 200 * depth < alpha {
            let qv = quiesce(ctx, board, alpha, beta, red_to_move, 0, ply);
            if qv < alpha { return qv; }
        }
    }

    // Step 9A: Null-move Zugzwang 精化
    // 老逻辑：`game_phase != 2` 拦截残局，粗糙。
    // 新逻辑：要求当前 side **有大子**（车/马/炮）；仅将/士/象 时容易零着，跳过。
    let side_has_major = {
        let mut has = false;
        for &p in board.iter() {
            if p == 0 { continue; }
            if is_own(p, red_to_move) {
                let t = piece_type_lower(p);
                if t == b'r' || t == b'h' || t == b'c' { has = true; break; }
            }
        }
        has
    };
    if excluded.is_none() && allow_null && !in_chk && depth >= 3 && side_has_major && !is_pv {
        let r = if depth >= 5 { 3 } else { 2 };
        // 做空着：仅翻转 side，需要同步 XOR hash
        ctx.current_hash ^= ctx.z.side[0] ^ ctx.z.side[1];
        let val = -negamax(ctx, board, depth - 1 - r, -beta, -beta+1, !red_to_move, ply+1, killers, counter_moves, ply_stack, false, false, rep_count);
        ctx.current_hash ^= ctx.z.side[0] ^ ctx.z.side[1];
        if val >= beta { return beta; }
    }

    // Futility flag（Step 9B：复用 static_eval，improving 时提高 margin）
    let mut futile = false;
    if !is_pv && !in_chk && depth <= 4 && static_eval_valid {
        let fm = 150 + 100 * depth + if improving { 60 } else { 0 };
        if static_eval + fm < alpha { futile = true; }
    }

    // IID
    if excluded.is_none() && tt_best.is_none() && depth >= 4 {
        // JS: 创建局部空 killer 数组做 shallower search，结果通过 TT 拉取
        let mut sk: Vec<Option<(i32,i32,i32,i32)>> = vec![None; 256];
        let _ = negamax(ctx, board, depth-2, alpha, beta, red_to_move, ply, &mut sk, counter_moves, ply_stack, true, false, rep_count);
        if let Some(sh) = tt_get(ctx, hash) {
            if sh.has_mv {
                let mv = sh.mv;
                if is_valid_move(board, red_to_move, mv) { tt_best = Some(mv); }
            }
        }
    }

    let all_moves = all_legal_moves(board, red_to_move);
    if all_moves.is_empty() { return if in_chk { -MATE + ply } else { 0 }; }

    let k1 = killers[(ply*2) as usize];
    let k2 = killers[(ply*2 + 1) as usize];
    let prev = if ply > 0 { ply_stack[(ply-1) as usize] } else { None };
    let cm: Option<(i32,i32,i32,i32)> = match prev {
        Some((pfr,pfc,ptr,ptc)) => counter_moves.get(&h_key(pfr,pfc,ptr,ptc)).cloned(),
        None => None,
    };
    let scored = score_moves(board, &all_moves, tt_best, k1, k2, cm, &ctx.history);

    // Step 15: Singular Extension —— TT move 明显最优时延伸 1 层
    // 触发条件（保守）：非 SE 探测本身、非 root、depth ≥ 8、TT 命中且有 move、
    //   TT flag = EXACT 或 LOWER、TT depth 不比当前浅 3、TT 值非 mate。
    // 做法：在同局面同 ply 用 β = tt_v - margin, 深度 (depth-1)/2, 排除 tt_move 探测。
    //   若结果 < sbeta（即其他所有走法都无法接近 tt_v）→ tt_move 是 singular → 该 move sd+1。
    let mut singular_ext: i32 = 0;
    if excluded.is_none() && ply > 0 && depth >= 10 {
        if let (Some(ttmv), Some(ttv)) = (tt_best, tt_v_for_se) {
            if tt_d_for_se >= depth - 2
                && tt_flag_for_se == TT_EXACT
                && ttv.abs() < MATE_THRESHOLD
            {
                let margin = 3 * depth;
                let sbeta = ttv - margin;
                let sdepth = (depth - 1) / 2;
                if sbeta > -MATE + 100 && sdepth >= 1 {
                    ctx.excluded = Some(ttmv);
                    let v = negamax(ctx, board, sdepth, sbeta - 1, sbeta, red_to_move, ply, killers, counter_moves, ply_stack, false, false, rep_count);
                    // 保险：无论 negamax 是否消费了 excluded，这里都清掉
                    ctx.excluded = None;
                    if !ctx.stop && v < sbeta {
                        singular_ext = 1;
                    }
                }
            }
        }
    }

    let mut best_val = -INF;
    let mut best_move = scored[0].0;
    let mut tt_flag = TT_UPPER;
    let mut moves_done = 0i32;

    for &(mv, _) in scored.iter() {
        // Step 15: 跳过被排除的 move（SE 探测时用）
        if let Some(ex) = excluded { if ex == mv { continue; } }
        let (fr, fc, tr, tc) = mv;
        let is_cap = board[idx(tr,tc)] != 0;
        if futile && !is_cap && !in_chk && moves_done > 0 { continue; }
        // Step 15: 该 move 是被证明 singular 的 TT move → 该子树 +1 层
        let ext = if singular_ext > 0 && Some(mv) == tt_best { singular_ext } else { 0 };
        // Step 9B: LMP 保留占位；反复实验发现象棋分支因子小、quiet move 相对稀
        // 每次触发都会导致 bestMove 变差；暂不启用
        let u = crate::rules::make_move_zh(board, fr, fc, tr, tc, &mut ctx.current_hash, &ctx.z);
        // 记录本 ply 走的着（供子层 counter 使用）
        if (ply as usize) < ply_stack.len() { ply_stack[ply as usize] = Some(mv); } else { ply_stack.push(Some(mv)); }
        let gc = in_check(board, !red_to_move);
        // Step 5: 记录路径信息
        ctx.path_hash.push(ctx.current_hash);
        ctx.path_gives_check.push(gc);
        push_halfmove(ctx, u.captured);
        moves_done += 1;
        let sd = depth - 1 + ext;
        let val;
        if moves_done == 1 {
            val = -negamax(ctx, board, sd, -beta, -alpha, !red_to_move, ply+1, killers, counter_moves, ply_stack, true, is_pv, rep_count);
        } else {
            let mut red_amt = 0i32;
            if depth >= 3 && moves_done > 3 && !is_cap && !gc && !in_chk {
                let base = 1 + (((moves_done as f64).ln() * (depth as f64).ln()) / 4.0).floor() as i32;
                red_amt = std::cmp::min(depth - 2, base);
                if is_pv { red_amt = std::cmp::max(0, red_amt - 1); }
            }
            let mut v = -negamax(ctx, board, sd - red_amt, -alpha - 1, -alpha, !red_to_move, ply+1, killers, counter_moves, ply_stack, true, false, rep_count);
            if red_amt > 0 && v > alpha {
                v = -negamax(ctx, board, sd, -alpha - 1, -alpha, !red_to_move, ply+1, killers, counter_moves, ply_stack, true, false, rep_count);
            }
            if v > alpha && v < beta {
                v = -negamax(ctx, board, sd, -beta, -alpha, !red_to_move, ply+1, killers, counter_moves, ply_stack, true, is_pv, rep_count);
            }
            val = v;
        }
        crate::rules::unmake_move_zh(board, u, &mut ctx.current_hash, &ctx.z);
        ctx.path_hash.pop();
        ctx.path_gives_check.pop();
        ctx.halfmove_clock.pop();
        if (ply as usize) < ply_stack.len() { ply_stack[ply as usize] = None; }
        if val > best_val {
            best_val = val; best_move = mv;
            if val > alpha { alpha = val; tt_flag = TT_EXACT; }
        }
        if alpha >= beta {
            if !is_cap {
                killers[(ply*2 + 1) as usize] = killers[(ply*2) as usize];
                killers[(ply*2) as usize] = Some(mv);
                let k = h_key(fr,fc,tr,tc);
                *ctx.history.entry(k).or_insert(0) += depth * depth;
            }
            if !is_cap {
                if let Some((pfr,pfc,ptr,ptc)) = prev {
                    counter_moves.insert(h_key(pfr,pfc,ptr,ptc), mv);
                }
            }
            tt_flag = TT_LOWER; break;
        }
    }
    if excluded.is_none() { tt_put(ctx, hash, depth, tt_flag, best_val, best_move); }
    best_val
}

pub struct SearchResult {
    pub best_move: Option<(i32,i32,i32,i32)>,
    pub score: i32,
    pub depth: i32,
    pub nodes: u64,
    pub time_ms: f64,
    pub pv: Vec<(i32,i32,i32,i32)>,
}

fn extract_pv(ctx: &SearchCtx, board: &Board, red_to_move: bool, max_ply: i32) -> Vec<(i32,i32,i32,i32)> {
    let mut pv: Vec<(i32,i32,i32,i32)> = Vec::new();
    let mut tmp: Board = *board;
    let mut turn = red_to_move;
    let mut visited: std::collections::HashSet<u64> = std::collections::HashSet::new();
    for _ in 0..max_ply {
        let h = board_hash(&ctx.z, &tmp, turn);
        if visited.contains(&h) { break; } visited.insert(h);
        let tte = tt_get(ctx, h);
        let tte = match tte { Some(x) if x.has_mv => x, _ => break };
        let (fr,fc,tr,tc) = tte.mv;
        if !in_board(fr,fc) || !in_board(tr,tc) { break; }
        let p = tmp[idx(fr,fc)]; if p == 0 { break; }
        if (turn && !is_red(p)) || (!turn && !is_black(p)) { break; }
        if !is_legal_move(&mut tmp, fr, fc, tr, tc) { break; }
        pv.push((fr,fc,tr,tc));
        make_move(&mut tmp, fr, fc, tr, tc);
        turn = !turn;
    }
    pv
}

/// 主入口：与 JS aiMove 对齐
pub fn ai_move(
    ctx: &mut SearchCtx,
    board_in: &Board,
    ai_is_red: bool,
    max_depth: i32,
    move_history: Option<&[(i32,i32,i32,i32)]>,
    time_limit_ms: Option<f64>,
    now_ms: impl Fn() -> f64,
    on_progress: Option<&mut dyn FnMut(i32, u64, f64, i32, &[(i32,i32,i32,i32)], (i32,i32,i32,i32))>,
) -> Option<SearchResult> {
    let mut board: Board = *board_in;
    let mut killers: Vec<Option<(i32,i32,i32,i32)>> = vec![None; 256];
    let mut counter_moves: HashMap<u32,(i32,i32,i32,i32)> = HashMap::new();
    let mut ply_stack: Vec<Option<(i32,i32,i32,i32)>> = vec![None; 256];
    let mut best_move: Option<(i32,i32,i32,i32)> = None;
    let mut best_val = 0i32;

    ctx.start_time_ms = now_ms();
    ctx.current_hash = board_hash(&ctx.z, &board, ai_is_red);
    ctx.path_hash.clear();
    ctx.path_gives_check.clear();
    // Step 9A: TT aging，每次 ai_move 递增（wrap 到 u8）
    ctx.tt_age = ctx.tt_age.wrapping_add(1);
    // Step 6: 硬性截止时间戳（3× time_limit 是老的兜底停止条件的上限）
    let time_limit = time_limit_ms.unwrap_or_else(|| {
        if max_depth >= 5 { 8000.0 } else if max_depth >= 4 { 4000.0 } else if max_depth >= 3 { 1500.0 } else { 500.0 }
    });
    ctx.time_limit_ms = time_limit;
    ctx.deadline_ms = ctx.start_time_ms + time_limit * 3.0;  // 硬性截止（正常情况下不到就 break）
    ctx.stop = false; ctx.nodes = 0;

    // 开局库
    if let Some(bm) = super::book::book_move(&board, ai_is_red, move_history.unwrap_or(&[]), &mut ctx.rng_state) {
        if is_legal_move(&mut board, bm.0, bm.1, bm.2, bm.3) {
            return Some(SearchResult { best_move: Some(bm), score: 0, depth: 0, nodes: 1, time_ms: 0.0, pv: vec![bm] });
        }
    }

    let legal = all_legal_moves(&mut board, ai_is_red);
    if legal.is_empty() { return None; }
    if legal.len() == 1 { return Some(SearchResult { best_move: Some(legal[0]), score: 0, depth: max_depth, nodes: 1, time_ms: 0.0, pv: vec![legal[0]] }); }

    // Repetition detection
    let mut rep_count: HashMap<u64, i32> = HashMap::new();
    // A3: 从 move_history 计算初始 halfmove_clock（自上次吃子起累计的半手）
    ctx.halfmove_clock.clear();
    let mut hmc = 0i32;
    if let Some(mh) = move_history {
        if !mh.is_empty() {
            let mut tb = initial_board();
            let mut turn = true;
            *rep_count.entry(board_hash(&ctx.z, &tb, turn)).or_insert(0) += 1;
            for &(fr,fc,tr,tc) in mh.iter() {
                if tb[idx(fr,fc)] != 0 {
                    // 吃子则重置；否则 +1
                    if tb[idx(tr,tc)] != 0 { hmc = 0; } else { hmc += 1; }
                    make_move(&mut tb, fr, fc, tr, tc);
                    turn = !turn;
                    let kh = board_hash(&ctx.z, &tb, turn);
                    *rep_count.entry(kh).or_insert(0) += 1;
                }
            }
        }
    }
    ctx.halfmove_clock.push(hmc);

    let mut alpha; let mut beta;
    let hard_depth_cap = max_depth + 8;
    let mut last_depth_reached = 0i32;
    let mut last_pv: Vec<(i32,i32,i32,i32)> = Vec::new();
    let mut cb = on_progress;
    // Step 11 (v5-p6-tm): 动态时间管理状态
    let mut prev_best_move: Option<(i32,i32,i32,i32)> = None;
    let mut prev_best_val: Option<i32> = None;
    let mut last_iter_ms: f64 = 1.0;
    let mut time_extend: f64 = 1.0;
    let mut extend_used = false;  // best move 变化 ×1.5 只做 1 次

    for depth in 1..=hard_depth_cap {
        if ctx.stop { break; }
        let iter_start_ms = now_ms() - ctx.start_time_ms;
        // Step 9A: 多阶段 Aspiration Window，[60, 200, 800, INF] 渐宽
        // 相比单一 60 → INF 的 2 阶段，命中率更高时窗更窄（剪枝更狠）；
        // 命中率低时逐步放宽，避免直接 fail-hard 到 INF 浪费一次全窗搜索。
        let mut val;
        if depth > 1 && best_move.is_some() {
            let asp_deltas: [i32; 4] = [60, 200, 800, INF];
            let mut i = 0;
            loop {
                let d = asp_deltas[i];
                if d >= INF { alpha = -INF; beta = INF; } else { alpha = best_val - d; beta = best_val + d; }
                val = negamax(ctx, &mut board, depth, alpha, beta, ai_is_red, 0, &mut killers, &mut counter_moves, &mut ply_stack, true, true, &rep_count);
                if ctx.stop { break; }
                if val > alpha && val < beta { break; }
                if i + 1 >= asp_deltas.len() { break; }
                i += 1;
            }
        } else {
            alpha = -INF; beta = INF;
            val = negamax(ctx, &mut board, depth, alpha, beta, ai_is_red, 0, &mut killers, &mut counter_moves, &mut ply_stack, true, true, &rep_count);
        }
        // ✅ 关键修复：本轮若被 stop 中途打断，`val` 是部分搜索的下界（negamax 内 `if ctx.stop { return alpha; }`），
        //             不代表"完成一整层的最优评估"。丢弃本轮结果，退出迭代，保留上一层的 best_val / best_move / PV。
        if ctx.stop { break; }
        // 本轮完整完成，才刷新 best_val / best_move / PV
        best_val = val;
        let root_hash = ctx.current_hash;
        if let Some(tte) = tt_get(ctx, root_hash) {
            if tte.has_mv && is_valid_move(&mut board, ai_is_red, tte.mv) { best_move = Some(tte.mv); }
        }
        let elapsed = now_ms() - ctx.start_time_ms;
        let pv = extract_pv(ctx, &board, ai_is_red, std::cmp::min(depth + 3, 20));
        last_depth_reached = depth; last_pv = pv.clone();
        if let Some(f) = cb.as_deref_mut() {
            let bm = best_move.unwrap_or(legal[0]);
            let sc = if ai_is_red { best_val } else { -best_val };
            f(depth, ctx.nodes, elapsed, sc, &pv, bm);
        }
        if best_val.abs() > MATE_THRESHOLD { break; }

        // Step 11 (v5-p6-tm): 动态时间管理
        // 1) 明显局面（|score| > 500 且已达 max_depth）→ 预算 × 0.7 提前退出
        // 2) bestMove 变了（不稳定）→ 剩余预算 × 1.5（最多一次）
        // 3) bestVal 下降超过 30（局势下滑）→ 剩余预算 × 1.3
        // 4) 若下一层预计耗时 > 剩余预算 → 提前结束
        let cur_iter_ms = elapsed - iter_start_ms;
        if cur_iter_ms > 1.0 { last_iter_ms = cur_iter_ms; }
        let cur_best = best_move;
        // (2) best move 不稳定 → 延长
        if !extend_used && depth >= 3 && prev_best_move.is_some() && cur_best != prev_best_move {
            time_extend *= 1.5; extend_used = true;
        }
        // (3) 评分下滑
        if let Some(pv) = prev_best_val {
            if best_val - pv < -30 { time_extend *= 1.3; }
        }
        // (1) 明显局面提前收
        let obvious = best_val.abs() > 500 && depth >= max_depth;
        let budget = time_limit * time_extend * if obvious { 0.7 } else { 1.0 };

        prev_best_move = cur_best;
        prev_best_val = Some(best_val);

        if elapsed > budget && depth >= max_depth { break; }
        // 预测下一层耗时：象棋分支 EBF 约 3~5，取 3 保守
        if depth >= max_depth && elapsed + last_iter_ms * 3.0 > budget { break; }
        if elapsed > time_limit * 3.0 { break; }
    }

    let mut bm = best_move;
    if let Some(m) = bm { if !is_valid_move(&mut board, ai_is_red, m) { bm = Some(legal[0]); } } else { bm = Some(legal[0]); }
    Some(SearchResult {
        best_move: bm, score: best_val, depth: last_depth_reached, nodes: ctx.nodes,
        time_ms: now_ms() - ctx.start_time_ms, pv: last_pv,
    })
}
