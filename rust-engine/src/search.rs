// Search engine: Negamax+PVS+TT+Quiescence+NullMove+LMR+IID+Killers+CounterMove+History
// 1:1 移植自 js/engine-worker.js
use crate::board::*;
use crate::rules::*;
use crate::eval::{evaluate, game_phase};
use crate::zobrist::*;
use crate::see::see_capture;
use std::collections::HashMap;

pub const MATE: i32 = 60000;
pub const MATE_THRESHOLD: i32 = MATE - 200;
pub const INF: i32 = MATE + 1000;
pub const TT_SIZE: usize = 1 << 19;

#[derive(Clone, Copy, Default)]
pub struct TTEntry { pub h: u64, pub d: i32, pub f: u8, pub v: i32, pub mv: (i32,i32,i32,i32), pub has_mv: bool, pub used: bool }
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
}

impl SearchCtx {
    pub fn new() -> Self {
        Self {
            tt: vec![TTEntry::default(); TT_SIZE],
            z: build_zobrist(0xC0FFEE_1234_5678),
            history: HashMap::new(),
            nodes: 0, stop: false, start_time_ms: 0.0, time_limit_ms: 0.0,
            rng_state: 0xDEADBEEF_CAFEBABE,
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
        !o.used || d >= o.d || o.f == TT_UPPER || ctx.rand_f64() < 0.2
    };
    if replace { ctx.tt[i] = TTEntry { h, d, f, v, mv, has_mv: true, used: true }; }
}

#[inline(always)] fn h_key(fr: i32, fc: i32, tr: i32, tc: i32) -> u32 { (fr*1000 + fc*100 + tr*10 + tc) as u32 }

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
    let in_chk = in_check(board, red_to_move);
    let stand_pat = if red_to_move { evaluate(board) } else { -evaluate(board) };
    if in_chk {
        let moves = all_legal_moves(board, red_to_move);
        if moves.is_empty() { return -MATE + ply; }
        let mut best = stand_pat;
        if best < beta {
            for (fr,fc,tr,tc) in moves {
                let u = make_move(board, fr, fc, tr, tc);
                let val = -quiesce(ctx, board, -beta, -alpha, !red_to_move, depth-1, ply+1);
                unmake_move(board, u);
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
        let u = make_move(board, fr, fc, tr, tc);
        let val = -quiesce(ctx, board, -beta, -alpha, !red_to_move, depth-1, ply+1);
        unmake_move(board, u);
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
    // 重复局面惩罚（对齐 JS：ply>0 && ply<2）
    if ply > 0 && ply < 2 {
        let ck = board_hash(&ctx.z, board, red_to_move);
        if *rep_count.get(&ck).unwrap_or(&0) >= 1 { return 0; }
    }
    if alpha < -MATE + ply { alpha = -MATE + ply; }
    if beta > MATE - ply - 1 { beta = MATE - ply - 1; }
    if alpha >= beta { return alpha; }

    if depth <= 0 { return quiesce(ctx, board, alpha, beta, red_to_move, 0, ply); }

    let hash = board_hash(&ctx.z, board, red_to_move);
    let mut tt_best: Option<(i32,i32,i32,i32)> = None;
    if let Some(tte) = tt_get(ctx, hash) {
        if tte.has_mv { tt_best = Some(tte.mv); }
        if tte.d >= depth {
            match tte.f {
                TT_EXACT => return tte.v,
                TT_LOWER => if tte.v >= beta { return tte.v; },
                TT_UPPER => if tte.v <= alpha { return tte.v; },
                _ => {}
            }
        }
    }

    let in_chk = in_check(board, red_to_move);
    if in_chk { depth += 1; }

    // Razoring
    if !is_pv && !in_chk && depth <= 3 {
        let sv = if red_to_move { evaluate(board) } else { -evaluate(board) };
        if sv + 200 * depth < alpha {
            let qv = quiesce(ctx, board, alpha, beta, red_to_move, 0, ply);
            if qv < alpha { return qv; }
        }
    }

    // Null-move
    if allow_null && !in_chk && depth >= 3 && game_phase(board) != 2 && !is_pv {
        let r = if depth >= 5 { 3 } else { 2 };
        // 做空着（切换 side）：直接递归时切换 red_to_move
        let val = -negamax(ctx, board, depth - 1 - r, -beta, -beta+1, !red_to_move, ply+1, killers, counter_moves, ply_stack, false, false, rep_count);
        if val >= beta { return beta; }
    }

    // Futility flag
    let mut futile = false;
    if !is_pv && !in_chk && depth <= 4 {
        let sv = if red_to_move { evaluate(board) } else { -evaluate(board) };
        let fm = 150 + 100 * depth;
        if sv + fm < alpha { futile = true; }
    }

    // IID
    if tt_best.is_none() && depth >= 4 {
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

    let mut best_val = -INF;
    let mut best_move = scored[0].0;
    let mut tt_flag = TT_UPPER;
    let mut moves_done = 0i32;

    for &(mv, _) in scored.iter() {
        let (fr, fc, tr, tc) = mv;
        let is_cap = board[idx(tr,tc)] != 0;
        if futile && !is_cap && !in_chk && moves_done > 0 { continue; }
        let u = make_move(board, fr, fc, tr, tc);
        // 记录本 ply 走的着（供子层 counter 使用）
        if (ply as usize) < ply_stack.len() { ply_stack[ply as usize] = Some(mv); } else { ply_stack.push(Some(mv)); }
        let gc = in_check(board, !red_to_move);
        moves_done += 1;
        let sd = depth - 1;
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
        unmake_move(board, u);
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
    tt_put(ctx, hash, depth, tt_flag, best_val, best_move);
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
    let time_limit = time_limit_ms.unwrap_or_else(|| {
        if max_depth >= 5 { 8000.0 } else if max_depth >= 4 { 4000.0 } else if max_depth >= 3 { 1500.0 } else { 500.0 }
    });
    ctx.time_limit_ms = time_limit;
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
    if let Some(mh) = move_history {
        if !mh.is_empty() {
            let mut tb = initial_board();
            let mut turn = true;
            *rep_count.entry(board_hash(&ctx.z, &tb, turn)).or_insert(0) += 1;
            for &(fr,fc,tr,tc) in mh.iter() {
                if tb[idx(fr,fc)] != 0 {
                    make_move(&mut tb, fr, fc, tr, tc);
                    turn = !turn;
                    let kh = board_hash(&ctx.z, &tb, turn);
                    *rep_count.entry(kh).or_insert(0) += 1;
                }
            }
        }
    }

    let mut alpha; let mut beta;
    let hard_depth_cap = max_depth + 8;
    let mut last_depth_reached = 0i32;
    let mut last_pv: Vec<(i32,i32,i32,i32)> = Vec::new();
    let mut cb = on_progress;

    for depth in 1..=hard_depth_cap {
        if ctx.stop { break; }
        if depth > 1 && best_move.is_some() {
            let asp = 60; alpha = best_val - asp; beta = best_val + asp;
        } else { alpha = -INF; beta = INF; }
        let mut val = negamax(ctx, &mut board, depth, alpha, beta, ai_is_red, 0, &mut killers, &mut counter_moves, &mut ply_stack, true, true, &rep_count);
        if val <= alpha || val >= beta {
            alpha = -INF; beta = INF;
            val = negamax(ctx, &mut board, depth, alpha, beta, ai_is_red, 0, &mut killers, &mut counter_moves, &mut ply_stack, true, true, &rep_count);
        }
        best_val = val;
        let root_hash = board_hash(&ctx.z, &board, ai_is_red);
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
        if elapsed > time_limit && depth >= max_depth { break; }
        if elapsed > time_limit * 3.0 { break; }
    }

    let mut bm = best_move;
    if let Some(m) = bm { if !is_valid_move(&mut board, ai_is_red, m) { bm = Some(legal[0]); } } else { bm = Some(legal[0]); }
    Some(SearchResult {
        best_move: bm, score: best_val, depth: last_depth_reached, nodes: ctx.nodes,
        time_ms: now_ms() - ctx.start_time_ms, pv: last_pv,
    })
}
