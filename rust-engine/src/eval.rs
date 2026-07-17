// 评估函数（与 js/evaluate.js 一一对应）
use crate::board::*;
use crate::rules::*;

// PST_R_OP
pub const PST_R_OP: [[i32; COLS]; ROWS] = [
    [14,14,12,18,16,18,12,14,14],
    [16,20,18,18,20,18,18,20,16],
    [12,12,12,18,20,18,12,12,12],
    [12,18,16,22,22,22,16,18,12],
    [12,14,12,18,20,18,12,14,12],
    [12,16,14,20,20,20,14,16,12],
    [ 6,10, 8,14,14,14, 8,10, 6],
    [ 4, 8, 6,14,12,14, 6, 8, 4],
    [ 6, 4, 8,16, 8,16, 8, 4, 6],
    [-2,10, 6,14,12,14, 6,10,-2],
];

// PST_R_EG = floor(PST_R_OP * 1.2) —— 与 JS Math.floor 语义一致（负数向 -∞ 取整）
pub const fn floor_mul_12(v: i32) -> i32 {
    // v*1.2 = v*6/5，JS Math.floor 对负数向下取整
    let n = v * 6;
    let q = n / 5; let r = n % 5;
    if r != 0 && (n < 0) { q - 1 } else { q }
}
pub const PST_R_EG: [[i32; COLS]; ROWS] = {
    let mut o = [[0i32; COLS]; ROWS];
    let mut r = 0; while r < ROWS { let mut c = 0; while c < COLS { o[r][c] = floor_mul_12(PST_R_OP[r][c]); c += 1; } r += 1; }
    o
};

pub const PST_H: [[i32; COLS]; ROWS] = [
    [ 4, 2,16,12, 4,12,16, 2, 4],
    [ 4,10,28,16, 8,16,28,10, 4],
    [12,14,22,20,18,20,22,14,12],
    [ 8,24,18,24,20,24,18,24, 8],
    [ 6,16,14,18,16,18,14,16, 6],
    [ 4,12,16,14,12,14,16,12, 4],
    [ 2, 6, 8, 6,10, 6, 8, 6, 2],
    [ 4, 2, 8, 8, 4, 8, 8, 2, 4],
    [ 0, 2, 4, 4,-2, 4, 4, 2, 0],
    [ 0,-4, 0, 0, 0, 0, 0,-4, 0],
];

pub const PST_C_OP: [[i32; COLS]; ROWS] = [
    [ 6, 4, 0,-4,-6,-4, 0, 4, 6],
    [ 2, 2, 0,-2,-6,-2, 0, 2, 2],
    [ 2, 2, 0,-4,-8,-4, 0, 2, 2],
    [ 0, 0,-4, 2,10, 2,-4, 0, 0],
    [ 0, 0, 0,-2, 4,-2, 0, 0, 0],
    [-2, 0,-2, 4, 4, 4,-2, 0,-2],
    [ 0, 0,-2, 0,-2, 0,-2, 0, 0],
    [ 0, 0,-2, 0,-8, 0,-2, 0, 0],
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0],
];
pub const PST_C_EG: [[i32; COLS]; ROWS] = [
    [ 8, 8, 8,10,10,10, 8, 8, 8],
    [ 6, 8,10,12,14,12,10, 8, 6],
    [ 6, 6, 8,10,12,10, 8, 6, 6],
    [ 4, 6, 6, 8,10, 8, 6, 6, 4],
    [ 4, 4, 6, 6, 8, 6, 6, 4, 4],
    [ 2, 4, 4, 4, 6, 4, 4, 4, 2],
    [ 0, 2, 2, 2, 4, 2, 2, 2, 0],
    [-2, 0, 0, 0, 2, 0, 0, 0,-2],
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0],
];
pub const PST_A: [[i32; COLS]; ROWS] = [
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,3,0,3,0,0,0],
    [0,0,0,0,8,0,0,0,0],
    [0,0,0,3,0,3,0,0,0],
];
pub const PST_E: [[i32; COLS]; ROWS] = [
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,6,0,0,0,6,0,0],
    [0,0,0,0,0,0,0,0,0],
    [8,0,0,0,10,0,0,0,8],
    [0,0,0,0,0,0,0,0,0],
    [0,0,4,0,0,0,4,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
];
pub const PST_P_OP: [[i32; COLS]; ROWS] = [
    // Step 3 (v5): 削弱开局中兵推进甜头，让 AI 不再单纯为 PST 分推兵五进一
    //   原 [3][4]=10 → 4    (兵五进一后到第 4 行)
    //   原 [4][4]=24 → 10   (兵五进二)
    //   原 [5][4]=16 → 6    (兵五进一初次)
    // 边兵/侧翼兵推进分数保留（配合马炮出击才需要）
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [2,0,4,0, 4,0,4,0,2],
    [8,14,18,22,10,22,18,14,8],
    [0,10,14,18, 6,18,14,10,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
];
pub const PST_P_EG: [[i32; COLS]; ROWS] = [
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [6,0,10,0,14,0,10,0,6],
    [14,20,24,28,30,28,24,20,14],
    [6,18,22,26,28,26,22,18,6],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
];

pub fn game_phase(board: &Board) -> i32 {
    let mut majors = 0;
    for &p in board.iter() {
        if p == 0 { continue; }
        if matches!(p, b'r'|b'R'|b'h'|b'H'|b'c'|b'C') { majors += 1; }
    }
    if majors >= 10 { 0 } else if majors >= 6 { 1 } else { 2 }
}

fn pst_val(piece: u8, r: i32, c: i32, phase: i32) -> i32 {
    let t = piece_type_lower(piece);
    let red = is_red(piece);
    let rr = if red { ROWS as i32 - 1 - r } else { r } as usize;
    let cc = if red { COLS as i32 - 1 - c } else { c } as usize;
    let tbl: &[[i32; COLS]; ROWS] = match t {
        b'r' => if phase == 2 { &PST_R_EG } else { &PST_R_OP },
        b'h' => &PST_H,
        b'c' => if phase == 2 { &PST_C_EG } else { &PST_C_OP },
        b'a' => &PST_A,
        b'e' => &PST_E,
        b'p' => if phase == 2 { &PST_P_EG } else { &PST_P_OP },
        _ => return 0,
    };
    tbl[rr][cc]
}

/// 马腿数（Step 22b: 修正原实现）
/// 遍历马的 8 个日字走法：
///   - 目标格必须在棋盘内
///   - 目标格不能是己方子
///   - 马腿（中间格）必须为空（关键）
/// 返回可用走法数
fn horse_legs(board: &Board, r: i32, c: i32) -> i32 {
    let horse = board[idx(r,c)];
    if horse == 0 { return 0; }
    let red = is_red(horse);
    let mut free = 0;
    for &(dr,dc,br,bc) in HORSE_MOVES.iter() {
        let tr = r + dr; let tc = c + dc;
        if !in_board(tr, tc) { continue; }
        // 马腿检查
        let lr = r + br; let lc = c + bc;
        if !in_board(lr, lc) { continue; }
        if board[idx(lr, lc)] != 0 { continue; }  // 马腿被塞
        // 目标格不能是己方子
        let tp = board[idx(tr, tc)];
        if tp != 0 && ((red && is_red(tp)) || (!red && is_black(tp))) { continue; }
        free += 1;
    }
    free
}
fn rook_mobility(board: &Board, r: i32, c: i32) -> i32 {
    let mut m = 0;
    for &(dr,dc) in ROOK_DIRS.iter() {
        let mut nr=r+dr; let mut nc=c+dc;
        while in_board(nr,nc) && board[idx(nr,nc)] == 0 { m += 1; nr+=dr; nc+=dc; }
        if in_board(nr,nc) && board[idx(nr,nc)] != 0 { m += 1; }
    }
    m
}
fn cannon_mobility(board: &Board, r: i32, c: i32) -> i32 {
    let mut m = 0;
    for &(dr,dc) in ROOK_DIRS.iter() {
        let mut nr=r+dr; let mut nc=c+dc; let mut j = false;
        while in_board(nr,nc) {
            if board[idx(nr,nc)] != 0 { if j { m += 1; break; } else { j = true; } }
            else if !j { m += 1; }
            nr+=dr; nc+=dc;
        }
    }
    m
}

fn open_file(board: &Board, col: i32, red: bool) -> bool {
    for r in 0..ROWS as i32 {
        let p = board[idx(r, col)];
        if p != 0 && piece_type_lower(p) == b'p' && is_red(p) == red { return false; }
    }
    true
}

pub fn evaluate(board: &Board, red_to_move: bool) -> i32 {
    // Step 10.1 (v5-p5-perf): 单遍历 evaluate
    // 老实现分配 8 个 Vec 记录棋子位置，再多次遍历。这里改为定长栈数组 + 单次遍历累积。
    let mut score = 0i32;
    let mut red_ae = 0i32; let mut blk_ae = 0i32;
    // 每种大子最多 2 个，兵最多 5 个；用 [(r,c); N] 定长数组 + 计数
    let mut red_rooks: [(i32,i32); 2] = [(0,0); 2]; let mut n_rr = 0usize;
    let mut blk_rooks: [(i32,i32); 2] = [(0,0); 2]; let mut n_br = 0usize;
    let mut red_cannons: [(i32,i32); 2] = [(0,0); 2]; let mut n_rc = 0usize;
    let mut blk_cannons: [(i32,i32); 2] = [(0,0); 2]; let mut n_bc = 0usize;
    let mut red_horses: [(i32,i32); 2] = [(0,0); 2]; let mut n_rh = 0usize;
    let mut blk_horses: [(i32,i32); 2] = [(0,0); 2]; let mut n_bh = 0usize;
    let mut red_pawns: [(i32,i32); 5] = [(0,0); 5]; let mut n_rp = 0usize;
    let mut blk_pawns: [(i32,i32); 5] = [(0,0); 5]; let mut n_bp = 0usize;
    let mut red_king = (9,4); let mut blk_king = (0,4);
    // 增量维护 majors 计数（车/马/炮）
    let mut majors = 0i32;
    for r in 0..ROWS as i32 {
        for c in 0..COLS as i32 {
            let p = board[idx(r,c)]; if p == 0 { continue; }
            let t = piece_type_lower(p); let red = is_red(p);
            match t {
                b'k' => { if red { red_king = (r,c); } else { blk_king = (r,c); } }
                b'a' | b'e' => { if red { red_ae += 1; } else { blk_ae += 1; } }
                b'r' => { majors += 1; if red { red_rooks[n_rr]=(r,c); n_rr+=1; } else { blk_rooks[n_br]=(r,c); n_br+=1; } }
                b'c' => { majors += 1; if red { red_cannons[n_rc]=(r,c); n_rc+=1; } else { blk_cannons[n_bc]=(r,c); n_bc+=1; } }
                b'h' => { majors += 1; if red { red_horses[n_rh]=(r,c); n_rh+=1; } else { blk_horses[n_bh]=(r,c); n_bh+=1; } }
                b'p' => { if red { red_pawns[n_rp]=(r,c); n_rp+=1; } else { blk_pawns[n_bp]=(r,c); n_bp+=1; } }
                _ => {}
            }
        }
    }
    // phase 由 majors 计数直接得出（与 game_phase() 严格一致）
    let phase = if majors >= 10 { 0 } else if majors >= 6 { 1 } else { 2 };
    // 第二遍遍历累积 PST + pval（拆开是为了让 phase 先算出来，避免在第一遍遍历里传入 phase 造成分支加倍）
    for r in 0..ROWS as i32 {
        for c in 0..COLS as i32 {
            let p = board[idx(r,c)]; if p == 0 { continue; }
            let t = piece_type_lower(p); let red = is_red(p);
            let sign = if red { 1 } else { -1 };
            score += sign * (pval(t) + pst_val(p, r, c, phase));
        }
    }
    // 大子活动性 + 士象
    let mut red_mob = 0; let mut blk_mob = 0;
    for i in 0..n_rr { let (r,c) = red_rooks[i]; red_mob += rook_mobility(board, r, c); }
    for i in 0..n_br { let (r,c) = blk_rooks[i]; blk_mob += rook_mobility(board, r, c); }
    for i in 0..n_rc { let (r,c) = red_cannons[i]; red_mob += cannon_mobility(board, r, c); }
    for i in 0..n_bc { let (r,c) = blk_cannons[i]; blk_mob += cannon_mobility(board, r, c); }
    for i in 0..n_rh { let (r,c) = red_horses[i]; red_mob += horse_legs(board, r, c) * 2; }
    for i in 0..n_bh { let (r,c) = blk_horses[i]; blk_mob += horse_legs(board, r, c) * 2; }
    score += red_mob - blk_mob;
    score += (red_ae - blk_ae) * 15;
    // 车（Step 21: 沉底车奖励改成"有配合子力"才生效；无配合的孤军车反罚）
    // 己方"配合子力"= 己方另一车/马/炮 也在敌方半场
    let red_support_across = {
        // 红方视角"敌方半场" = r <= 4
        let mut cnt = 0;
        for i in 0..n_rr { if red_rooks[i].0 <= 4 { cnt += 1; } }
        for i in 0..n_rh { if red_horses[i].0 <= 4 { cnt += 1; } }
        for i in 0..n_rc { if red_cannons[i].0 <= 4 { cnt += 1; } }
        cnt
    };
    let blk_support_across = {
        let mut cnt = 0;
        for i in 0..n_br { if blk_rooks[i].0 >= 5 { cnt += 1; } }
        for i in 0..n_bh { if blk_horses[i].0 >= 5 { cnt += 1; } }
        for i in 0..n_bc { if blk_cannons[i].0 >= 5 { cnt += 1; } }
        cnt
    };
    for i in 0..n_rr { let (r,c) = red_rooks[i];
        if open_file(board, c, true) { score += 8; }
        // Step 23: 车肋道加分 gate —— 只在有过河配合时鼓励车压肋线，
        // 否则单独冲肋线 = 无配合的花拳绣腿
        if (c == 3 || c == 5) && red_support_across >= 1 { score += 6; }
        // 沉底车：需要至少 2 个己方大子过河支援（含此车）才有价值
        if r <= 2 {
            if red_support_across >= 2 { score += 5; }
        }
        // 孤军深入车：车进敌方 3 行内（r ≤ 3）但过河友军 ≤ 1（只有本车） → 大负分
        if r <= 3 && red_support_across <= 1 && phase != 2 {
            score -= 25;
        }
    }
    for i in 0..n_br { let (r,c) = blk_rooks[i];
        if open_file(board, c, false) { score -= 8; }
        if (c == 3 || c == 5) && blk_support_across >= 1 { score -= 6; }
        if r >= 7 {
            if blk_support_across >= 2 { score -= 5; }
        }
        if r >= 6 && blk_support_across <= 1 && phase != 2 {
            score += 25;
        }
    }
    // 炮
    for i in 0..n_rc { let (r,c) = red_cannons[i];
        if c == 4 && r < 5 && r > 2 { score += 6; }
        if r <= 2 { score += 4; }
    }
    for i in 0..n_bc { let (r,c) = blk_cannons[i];
        if c == 4 && r > 4 && r < 7 { score -= 6; }
        if r >= 7 { score -= 4; }
    }
    // 兵（Step 22: 无谓进兵抑制 —— 兵推进加分需要"有大子过河"作为 gate）
    // 未过河兵（r>=5 红 / r<=4 黑）本身占位；过河后才有战术价值，但只有当己方有过河大子时才鼓励。
    let red_pawn_gate = red_support_across >= 2;  // 己方至少 2 门车/马/炮过河 → 兵推进有意义
    let blk_pawn_gate = blk_support_across >= 2;
    for i in 0..n_rp {
        let (r,c) = red_pawns[i];
        if r <= 4 {
            let mut paired = false;
            for j in 0..n_rp { let (r2,c2) = red_pawns[j]; if r2==r && (c2-c).abs()==1 { paired = true; break; } }
            if paired { score += if red_pawn_gate { 6 } else { 2 }; }
            if c == 4 { score += if red_pawn_gate { 4 } else { 1 }; }
            if r == 0 { score -= 20; }
        } else if r <= 6 { score += if red_pawn_gate { 1 } else { 0 }; }
    }
    for i in 0..n_bp {
        let (r,c) = blk_pawns[i];
        if r >= 5 {
            let mut paired = false;
            for j in 0..n_bp { let (r2,c2) = blk_pawns[j]; if r2==r && (c2-c).abs()==1 { paired = true; break; } }
            if paired { score -= if blk_pawn_gate { 6 } else { 2 }; }
            if c == 4 { score -= if blk_pawn_gate { 4 } else { 1 }; }
            if r == 9 { score += 20; }
        } else if r >= 3 { score -= if blk_pawn_gate { 1 } else { 0 }; }
    }
    // 马活度 + 开局马路活通额外奖励
    for i in 0..n_rh {
        let (r,c) = red_horses[i];
        let legs = horse_legs(board, r, c);
        score += legs;
        // Step 22b: 开局马路活通：马有 ≥3 个合法走法 +8；≤1 憋马 -12
        if phase == 0 {
            if legs >= 3 { score += 8; }
            else if legs <= 1 { score -= 12; }
        }
    }
    for i in 0..n_bh {
        let (r,c) = blk_horses[i];
        let legs = horse_legs(board, r, c);
        score -= legs;
        if phase == 0 {
            if legs >= 3 { score -= 8; }
            else if legs <= 1 { score += 12; }
        }
    }
    if phase == 2 {
        // 使用 2x 缩放绕过 4.5 分数：|k-4.5|*2 = |2k-9|
        let r2 = (2*red_king.0 - 9).abs() + 2*(red_king.1 - 4).abs();
        let b2 = (2*blk_king.0 - 9).abs() + 2*(blk_king.1 - 4).abs();
        score += (b2 - r2) * 3;
        if red_king.0 >= 8 { score -= 5; }
        if blk_king.0 <= 1 { score += 5; }
    }
    if phase == 0 {
        score += undeveloped_penalty(board);
        score += early_cannon_solo_penalty(board);
    } else if phase == 1 {
        // Step 23: 开局→中局过渡不应突然失效，半衰
        score += undeveloped_penalty(board) / 2;
        score += early_cannon_solo_penalty(board) / 2;
    }

    // Step 7 (p1-tactics): 王安全 + 9 个战术模式（红-黑净分）
    score += crate::tactics::tactics_score(board);

    // Step 22: 牵制评估
    // Step 23: 由"仅开局"放宽到 phase!=2，中局最需要考虑牵制
    if phase != 2 {
        score += pinned_penalty(board, true, (red_king.0, red_king.1));
        score -= pinned_penalty(board, false, (blk_king.0, blk_king.1));
    }

    // Step 24 (R1): 无根子惩罚
    score += hanging_penalty(board, true, &red_rooks[..n_rr], n_rr);
    score += hanging_penalty(board, true, &red_cannons[..n_rc], n_rc);
    score += hanging_penalty(board, true, &red_horses[..n_rh], n_rh);
    score += hanging_penalty(board, true, &red_pawns[..n_rp], n_rp);
    score -= hanging_penalty(board, false, &blk_rooks[..n_br], n_br);
    score -= hanging_penalty(board, false, &blk_cannons[..n_bc], n_bc);
    score -= hanging_penalty(board, false, &blk_horses[..n_bh], n_bh);
    score -= hanging_penalty(board, false, &blk_pawns[..n_bp], n_bp);


    // Step 3 (v5): Tempo 微幅奖励，避免过度被动 (相对 side-to-move)
    score += if red_to_move { 6 } else { -6 };

    score
}

/// 大子未出动惩罚：车-15、马-12、炮-8（每个仍在原位的大子扣分）。
/// 只在开局阶段（majors>=10）生效。
/// 车原位：红 (9,0)/(9,8)，黑 (0,0)/(0,8)
/// 马原位：红 (9,1)/(9,7)，黑 (0,1)/(0,7)
/// 炮原位：红 (7,1)/(7,7)，黑 (2,1)/(2,7)
fn undeveloped_penalty(board: &Board) -> i32 {
    // Step 22: 反转权重，参考 Pikafish/Stockfish：马 > 炮 > 车
    // 象棋开局马是主力（跳到 (2,2)/(2,6) 才能出击），车相对灵活可后出
    let mut score = 0;
    // 马（-22 每门未出）—— 最重要
    if board[idx(9,1)] == b'H' { score -= 22; }
    if board[idx(9,7)] == b'H' { score -= 22; }
    if board[idx(0,1)] == b'h' { score += 22; }
    if board[idx(0,7)] == b'h' { score += 22; }
    // 炮（-10 每门未出）
    if board[idx(7,1)] == b'C' { score -= 10; }
    if board[idx(7,7)] == b'C' { score -= 10; }
    if board[idx(2,1)] == b'c' { score += 10; }
    if board[idx(2,7)] == b'c' { score += 10; }
    // 车（-6 每门未出）—— 权重降低，让 AI 先出马
    if board[idx(9,0)] == b'R' { score -= 6; }
    if board[idx(9,8)] == b'R' { score -= 6; }
    if board[idx(0,0)] == b'r' { score += 6; }
    if board[idx(0,8)] == b'r' { score += 6; }
    score
}

/// Step 22: 牵制评估 —— 己方被牵子力越贵重 → 越负分
/// 参考 Stockfish：pinned pieces 是关键弱点，特别是大子被牵
fn pinned_penalty(board: &Board, red: bool, kp: (i32,i32)) -> i32 {
    if kp.0 < 0 { return 0; }
    let bb = crate::rules::compute_pinned(board, red, kp);
    if bb == 0 { return 0; }
    let mut penalty = 0i32;
    for r in 0..ROWS as i32 {
        for c in 0..COLS as i32 {
            if ((bb >> (r*9 + c)) & 1) == 0 { continue; }
            let p = board[idx(r,c)];
            if p == 0 { continue; }
            let t = piece_type_lower(p);
            penalty -= match t {
                b'r' => 20,
                b'h' => 16,
                b'c' => 12,
                b'p' => 6,
                b'a' | b'e' => 4,
                _ => 0,
            };
        }
    }
    penalty  // 返回负值（红方视角：己方被牵制越多越负）
}

/// Step 20b: 开局炮孤军惩罚
/// 己方炮已经跨河（红 r<=4，黑 r>=5），但己方所有车都还没动
/// → 每门跨河炮 -18（让 AI 不会在马车都没出的时候就冲炮吃兵）
fn early_cannon_solo_penalty(board: &Board) -> i32 {
    let mut score = 0;
    // 红方
    let r_rooks_home = board[idx(9,0)] == b'R' && board[idx(9,8)] == b'R';
    let r_horses_home = board[idx(9,1)] == b'H' && board[idx(9,7)] == b'H';
    if r_rooks_home && r_horses_home {
        for r in 0..=4 as i32 {
            for c in 0..COLS as i32 {
                if board[idx(r,c)] == b'C' { score -= 18; }
            }
        }
    }
    // 黑方（对称）
    let b_rooks_home = board[idx(0,0)] == b'r' && board[idx(0,8)] == b'r';
    let b_horses_home = board[idx(0,1)] == b'h' && board[idx(0,7)] == b'h';
    if b_rooks_home && b_horses_home {
        for r in 5..ROWS as i32 {
            for c in 0..COLS as i32 {
                if board[idx(r,c)] == b'c' { score += 18; }
            }
        }
    }
    score
}

/// Step 24 (R1): 无根子惩罚
/// 遍历己方大子，检查是否被保护。无保护 + 对方能攻击 → 扣分。
/// 保护判定：临时移除该子 + 王，用 square_attacked 检查剩余子力是否攻击该格。
/// 排除王是因为 square_attacked 的 飞将（king face2face）会误判所有同列格。
fn hanging_penalty(board: &Board, red: bool, pieces: &[(i32,i32)], n: usize) -> i32 {
    if n == 0 { return 0; }
    let mut penalty = 0i32;
    let king = if red { b'K' } else { b'k' };

    for i in 0..n {
        let (r, c) = pieces[i];
        let p = board[idx(r, c)];
        if p == 0 { continue; }

        // 临时移除该子，检查保护
        let mut tmp = *board;
        tmp[idx(r, c)] = 0;
        let defended = square_attacked(&tmp, r, c, red);
        let real_defended = if defended {
            // 排除飞将误判：找到王，移除王，再查
            let mut king_pos = None;
            for rr in 0..ROWS as i32 {
                for cc in 0..COLS as i32 {
                    if tmp[idx(rr, cc)] == king { king_pos = Some((rr, cc)); break; }
                }
                if king_pos.is_some() { break; }
            }
            if let Some((kr, kc)) = king_pos {
                tmp[idx(kr, kc)] = 0;
                square_attacked(&tmp, r, c, red)
            } else {
                true
            }
        } else {
            false
        };

        if real_defended { continue; }

        if !square_attacked(board, r, c, !red) { continue; }

        let t = piece_type_lower(p);
        penalty -= match t {
            b'r' => 30,
            b'c' => 22,
            b'h' => 18,
            b'p' => {
                if red && r <= 4 { 8 } else if !red && r >= 5 { 8 } else { 0 }
            }
            _ => 0,
        };
    }
    penalty
}


// squareAttacked wrapper for search hot path
pub use crate::rules::square_attacked;


#[cfg(test)]
mod eval_tests {
    use super::*;
    use crate::board::*;

    fn empty() -> Board { [0u8; NSQ] }
    fn place(b: &mut Board, r: i32, c: i32, p: u8) { b[idx(r,c)] = p; }

    #[test]
    fn hanging_rook_penalized() {
        let mut b = empty();
        place(&mut b, 9, 4, b'K');
        place(&mut b, 1, 4, b'k');
        place(&mut b, 0, 0, b'R');
        place(&mut b, 0, 8, b'r');  // 黑车同线攻击，路径通畅
        let rooks = [(0i32,0i32); 2];
        let p = hanging_penalty(&b, true, &rooks[..1], 1);
        assert_eq!(p, -30, "无根红车应扣 30，实际 {}", p);
    }

    #[test]
    fn protected_rook_not_penalized() {
        let mut b = empty();
        place(&mut b, 8, 4, b'K');
        place(&mut b, 0, 4, b'k');
        place(&mut b, 9, 0, b'R');
        place(&mut b, 9, 4, b'R');  // 同线车保护
        let rooks = [(9i32,0i32), (9i32,4i32)];
        let p = hanging_penalty(&b, true, &rooks[..1], 1);
        assert_eq!(p, 0, "有保护的 rook 不应扣分，实际 {}", p);
    }

    #[test]
    fn hanging_horse_penalized() {
        let mut b = empty();
        place(&mut b, 9, 4, b'K');
        place(&mut b, 0, 3, b'k');
        place(&mut b, 4, 4, b'H');
        place(&mut b, 4, 0, b'r');  // 黑车同线攻击
        let horses = [(4i32,4i32); 2];
        let p = hanging_penalty(&b, true, &horses[..1], 1);
        assert_eq!(p, -18, "无根红马应扣 18，实际 {}", p);
    }
}

