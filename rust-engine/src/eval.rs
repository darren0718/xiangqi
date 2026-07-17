// 评估函数（与 js/evaluate.js 一一对应）
use crate::board::*;
use crate::rules::*;

// PST_R_OP
pub const PST_R_OP: [[i32; COLS]; ROWS] = [
    [14,14,12,18,16,18,12,14,14],
    [16,20,18,24,28,24,18,20,16],
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
    [ 4, 8,16,12, 4,12,16, 8, 4],
    [ 4,10,28,16, 8,16,28,10, 4],
    [12,14,16,20,18,20,16,14,12],
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
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [2,0,4,0,10,0,4,0,2],
    [8,14,18,22,24,22,18,14,8],
    [0,10,14,18,16,18,14,10,0],
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

fn horse_legs(board: &Board, r: i32, c: i32) -> i32 {
    let mut free = 0;
    for &(_dr,_dc,br,bc) in HORSE_MOVES.iter() {
        if in_board(r+br, c+bc) && board[idx(r+br, c+bc)] == 0 { free += 1; }
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

pub fn evaluate(board: &Board) -> i32 {
    let mut score = 0i32;
    let mut red_ae = 0; let mut blk_ae = 0;
    let mut red_rooks: Vec<(i32,i32)> = Vec::with_capacity(2);
    let mut blk_rooks: Vec<(i32,i32)> = Vec::with_capacity(2);
    let mut red_cannons: Vec<(i32,i32)> = Vec::with_capacity(2);
    let mut blk_cannons: Vec<(i32,i32)> = Vec::with_capacity(2);
    let mut red_horses: Vec<(i32,i32)> = Vec::with_capacity(2);
    let mut blk_horses: Vec<(i32,i32)> = Vec::with_capacity(2);
    let mut red_pawns: Vec<(i32,i32)> = Vec::with_capacity(5);
    let mut blk_pawns: Vec<(i32,i32)> = Vec::with_capacity(5);
    let mut red_king = (9,4); let mut blk_king = (0,4);
    let phase = game_phase(board);
    for r in 0..ROWS as i32 {
        for c in 0..COLS as i32 {
            let p = board[idx(r,c)]; if p == 0 { continue; }
            let t = piece_type_lower(p); let red = is_red(p);
            let sign = if red { 1 } else { -1 };
            score += sign * (pval(t) + pst_val(p, r, c, phase));
            match t {
                b'k' => { if red { red_king = (r,c); } else { blk_king = (r,c); } }
                b'a' | b'e' => { if red { red_ae += 1; } else { blk_ae += 1; } }
                b'r' => { if red { red_rooks.push((r,c)); } else { blk_rooks.push((r,c)); } }
                b'c' => { if red { red_cannons.push((r,c)); } else { blk_cannons.push((r,c)); } }
                b'h' => { if red { red_horses.push((r,c)); } else { blk_horses.push((r,c)); } }
                b'p' => { if red { red_pawns.push((r,c)); } else { blk_pawns.push((r,c)); } }
                _ => {}
            }
        }
    }
    let mut red_mob = 0; let mut blk_mob = 0;
    for &(r,c) in red_rooks.iter() { red_mob += rook_mobility(board, r, c); }
    for &(r,c) in blk_rooks.iter() { blk_mob += rook_mobility(board, r, c); }
    for &(r,c) in red_cannons.iter() { red_mob += cannon_mobility(board, r, c); }
    for &(r,c) in blk_cannons.iter() { blk_mob += cannon_mobility(board, r, c); }
    for &(r,c) in red_horses.iter() { red_mob += horse_legs(board, r, c) * 2; }
    for &(r,c) in blk_horses.iter() { blk_mob += horse_legs(board, r, c) * 2; }
    score += red_mob - blk_mob;
    score += (red_ae - blk_ae) * 15;
    for &(r,c) in red_rooks.iter() {
        if open_file(board, c, true) { score += 8; }
        if c == 3 || c == 5 { score += 6; }
        if r <= 2 { score += 5; }
    }
    for &(r,c) in blk_rooks.iter() {
        if open_file(board, c, false) { score -= 8; }
        if c == 3 || c == 5 { score -= 6; }
        if r >= 7 { score -= 5; }
    }
    for &(r,c) in red_cannons.iter() {
        if c == 4 && r < 5 && r > 2 { score += 6; }
        if r <= 2 { score += 4; }
    }
    for &(r,c) in blk_cannons.iter() {
        if c == 4 && r > 4 && r < 7 { score -= 6; }
        if r >= 7 { score -= 4; }
    }
    for i in 0..red_pawns.len() {
        let (r,c) = red_pawns[i];
        if r <= 4 {
            let mut paired = false;
            for j in 0..red_pawns.len() { let (r2,c2) = red_pawns[j]; if r2==r && (c2-c).abs()==1 { paired = true; break; } }
            if paired { score += 6; }
            if c == 4 { score += 4; }
            if r == 0 { score -= 20; }
        } else if r <= 6 { score += 1; }
    }
    for i in 0..blk_pawns.len() {
        let (r,c) = blk_pawns[i];
        if r >= 5 {
            let mut paired = false;
            for j in 0..blk_pawns.len() { let (r2,c2) = blk_pawns[j]; if r2==r && (c2-c).abs()==1 { paired = true; break; } }
            if paired { score -= 6; }
            if c == 4 { score -= 4; }
            if r == 9 { score += 20; }
        } else if r >= 3 { score -= 1; }
    }
    for &(r,c) in red_horses.iter() { score += horse_legs(board, r, c); }
    for &(r,c) in blk_horses.iter() { score -= horse_legs(board, r, c); }
    if phase == 2 {
        // 使用 2x 缩放绕过 4.5 分数：|k-4.5|*2 = |2k-9|
        let r2 = (2*red_king.0 - 9).abs() + 2*(red_king.1 - 4).abs();
        let b2 = (2*blk_king.0 - 9).abs() + 2*(blk_king.1 - 4).abs();
        // (bkd - rkd) * 6 = (b2 - r2) * 3
        score += (b2 - r2) * 3;
        if red_king.0 >= 8 { score -= 5; }
        if blk_king.0 <= 1 { score += 5; }
    }
    score
}

// squareAttacked wrapper for search hot path
pub use crate::rules::square_attacked;
