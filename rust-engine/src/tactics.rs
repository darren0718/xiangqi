// 象棋战术模式与将帅安全评估
// 单趟扫描 + 无堆分配版本，避免评估热路径变慢
use crate::board::*;

/// 综合战术评估（返回 red 视角的红-黑净分）
///
/// 单次线性扫描棋盘，收集：
///   - 双方将位置
///   - 双方车/炮/马位置（≤2 车 / 2 炮 / 2 马，最多各 8 项）
/// 然后计算 9 种战术模式 + 双方王安全分。
pub fn tactics_score(board: &Board) -> i32 {
    // 双方将位
    let mut rkr = -1i32; let mut rkc = -1i32;
    let mut bkr = -1i32; let mut bkc = -1i32;
    // 车/炮/马坐标缓存（最多 2 个，用固定数组免分配）
    let mut r_rooks: [(i32,i32); 2] = [(-1,-1); 2]; let mut r_rooks_n = 0usize;
    let mut b_rooks: [(i32,i32); 2] = [(-1,-1); 2]; let mut b_rooks_n = 0usize;
    let mut r_cans:  [(i32,i32); 2] = [(-1,-1); 2]; let mut r_cans_n  = 0usize;
    let mut b_cans:  [(i32,i32); 2] = [(-1,-1); 2]; let mut b_cans_n  = 0usize;
    let mut r_hors:  [(i32,i32); 2] = [(-1,-1); 2]; let mut r_hors_n  = 0usize;
    let mut b_hors:  [(i32,i32); 2] = [(-1,-1); 2]; let mut b_hors_n  = 0usize;
    // 士象计数
    let mut r_ae = 0i32; let mut b_ae = 0i32;

    for r in 0..ROWS as i32 {
        for c in 0..COLS as i32 {
            let p = board[idx(r,c)];
            match p {
                0 => continue,
                b'K' => { rkr = r; rkc = c; }
                b'k' => { bkr = r; bkc = c; }
                b'R' => { if r_rooks_n < 2 { r_rooks[r_rooks_n] = (r,c); r_rooks_n += 1; } }
                b'r' => { if b_rooks_n < 2 { b_rooks[b_rooks_n] = (r,c); b_rooks_n += 1; } }
                b'C' => { if r_cans_n  < 2 { r_cans[r_cans_n]   = (r,c); r_cans_n  += 1; } }
                b'c' => { if b_cans_n  < 2 { b_cans[b_cans_n]   = (r,c); b_cans_n  += 1; } }
                b'H' => { if r_hors_n  < 2 { r_hors[r_hors_n]   = (r,c); r_hors_n  += 1; } }
                b'h' => { if b_hors_n  < 2 { b_hors[b_hors_n]   = (r,c); b_hors_n  += 1; } }
                b'A' | b'E' => r_ae += 1,
                b'a' | b'e' => b_ae += 1,
                _ => {}
            }
        }
    }
    if rkr < 0 || bkr < 0 { return 0; }

    let mut s = 0i32;

    // ========== 炮模式 ==========
    // empty_head_cannon: 己方炮与对方将同列，中间全空 +30
    // bottom_cannon: 己方炮进底 1-2 行 +12
    // central_cannon_over_river: 中路（c=4）过河炮 +14
    // double_cannon: 两炮同列且对方将在此列 +25
    s += cannons_score(board, &r_cans[..r_cans_n], bkr, bkc, true);
    s -= cannons_score(board, &b_cans[..b_cans_n], rkr, rkc, false);

    // ========== 马模式 ==========
    // crouching (2,3)/(2,5) +22, corner (2,4) +18, river r=4 c∈[3,5] +10
    for i in 0..r_hors_n {
        let (r,c) = r_hors[i];
        if r == 2 && (c == 3 || c == 5) { s += 22; }
        if r == 2 && c == 4 { s += 18; }
        if r == 4 && c >= 3 && c <= 5 { s += 10; }
    }
    for i in 0..b_hors_n {
        let (r,c) = b_hors[i];
        if r == 7 && (c == 3 || c == 5) { s -= 22; }
        if r == 7 && c == 4 { s -= 18; }
        if r == 5 && c >= 3 && c <= 5 { s -= 10; }
    }

    // ========== 车模式 ==========
    s += rooks_score(board, &r_rooks[..r_rooks_n], bkr, bkc);
    s -= rooks_score(board, &b_rooks[..b_rooks_n], rkr, rkc);

    // ========== 王安全 ==========
    s += king_safety(board, rkr, rkc, true,  r_ae);
    s -= king_safety(board, bkr, bkc, false, b_ae);

    s
}

/// 己方炮列表 + 对方将坐标 → 空头炮/沉底炮/中路过河炮/重炮
#[inline]
fn cannons_score(board: &Board, cans: &[(i32,i32)], ekr: i32, ekc: i32, red: bool) -> i32 {
    let mut s = 0i32;
    let mut same_col: [i32; 9] = [0; 9];
    for &(r,c) in cans.iter() {
        // 沉底炮
        if red && r <= 1 { s += 12; }
        if !red && r >= 8 { s += 12; }
        // 中路过河炮 (c==4)
        if c == 4 {
            if red && r <= 4 { s += 14; }
            if !red && r >= 5 { s += 14; }
        }
        // 空头炮（同列 + 无子）
        if c == ekc {
            let (lo, hi) = if r < ekr { (r+1, ekr) } else { (ekr+1, r) };
            let mut empty = true;
            for mid in lo..hi {
                if board[idx(mid, ekc)] != 0 { empty = false; break; }
            }
            if empty { s += 30; }
        }
        same_col[c as usize] += 1;
    }
    // 重炮：两炮同列且此列即对方王列 +25
    if ekc >= 0 && same_col[ekc as usize] >= 2 { s += 25; }
    s
}

/// 己方车列表 + 对方将坐标 → 铁门栓、连车
#[inline]
fn rooks_score(board: &Board, rooks: &[(i32,i32)], ekr: i32, ekc: i32) -> i32 {
    let mut s = 0i32;
    for &(r,c) in rooks.iter() {
        if c == ekc && r != ekr {
            let (lo, hi) = if r < ekr { (r+1, ekr) } else { (ekr+1, r) };
            let mut cnt = 0i32;
            for m in lo..hi { if board[idx(m, ekc)] != 0 { cnt += 1; } }
            if cnt <= 1 { s += 12; }
        }
    }
    if rooks.len() == 2 {
        let (r1,c1) = rooks[0]; let (r2,c2) = rooks[1];
        if r1 == r2 {
            let (lo,hi) = if c1<c2 { (c1+1,c2) } else { (c2+1,c1) };
            let mut clear = true;
            for c in lo..hi { if board[idx(r1,c)] != 0 { clear = false; break; } }
            if clear { s += 12; }
        } else if c1 == c2 {
            let (lo,hi) = if r1<r2 { (r1+1,r2) } else { (r2+1,r1) };
            let mut clear = true;
            for r in lo..hi { if board[idx(r,c1)] != 0 { clear = false; break; } }
            if clear { s += 12; }
        }
    }
    s
}

/// 己方王 (kr,kc) 危险区被敌方大子威胁的攻击-单位映射（Stockfish 手法）
/// 返回负分（我方越危险，越负）
#[inline]
fn king_safety(board: &Board, kr: i32, kc: i32, red: bool, own_ae: i32) -> i32 {
    // 危险区：王 3x3 + 王前方 2 行的 3 列，共最多 15 格
    let mut units = 0i32;
    let fwd = if red { -1i32 } else { 1i32 };

    // 3x3 邻域
    for dr in -1..=1i32 {
        for dc in -1..=1i32 {
            let nr = kr + dr; let nc = kc + dc;
            if !in_board(nr, nc) { continue; }
            units += zone_unit(board[idx(nr,nc)], nr, red);
        }
    }
    // 王前方 2 行 3 列
    for step in 1..=2i32 {
        for dc in -1..=1i32 {
            let nr = kr + fwd*step; let nc = kc + dc;
            if !in_board(nr, nc) { continue; }
            units += zone_unit(board[idx(nr,nc)], nr, red);
        }
    }

    // 士象少时放大威胁
    if own_ae <= 1 { units = units * 130 / 100; }
    else if own_ae <= 2 { units = units * 115 / 100; }

    const TABLE: [i32; 21] = [0, 0, 6, 14, 24, 38, 55, 76, 100, 130, 165, 200, 240, 285, 340, 400, 460, 520, 580, 640, 700];
    let capped = if units < 0 { 0 } else if units >= TABLE.len() as i32 { TABLE.len() - 1 } else { units as usize };
    -TABLE[capped]
}

/// piece 在危险区中贡献多少 attack-units
/// (red == true 表示我方是红，此处判 p 是否是黑子)
#[inline]
fn zone_unit(p: u8, r: i32, red: bool) -> i32 {
    if p == 0 { return 0; }
    let is_enemy = if red {
        matches!(p, b'r'|b'c'|b'h'|b'p')
    } else {
        matches!(p, b'R'|b'C'|b'H'|b'P')
    };
    if !is_enemy { return 0; }
    match p {
        b'r' | b'R' => 40,
        b'c' | b'C' => 22,
        b'h' | b'H' => 20,
        b'p' => if red && r <= 4 { 8 } else { 0 },
        b'P' => if !red && r >= 5 { 8 } else { 0 },
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn empty() -> Board { [0u8; NSQ] }
    fn place(b: &mut Board, r: i32, c: i32, p: u8) { b[idx(r,c)] = p; }

    #[test]
    fn empty_head_cannon_scored() {
        let mut b = empty();
        place(&mut b, 9, 4, b'K');
        place(&mut b, 0, 4, b'k');
        place(&mut b, 4, 4, b'C');
        let s = tactics_score(&b);
        assert!(s >= 40, "expected red positive tactic, got {}", s);
    }

    #[test]
    fn crouching_horse_scored() {
        let mut b = empty();
        place(&mut b, 9, 4, b'K');
        place(&mut b, 0, 4, b'k');
        place(&mut b, 2, 3, b'H');
        let s = tactics_score(&b);
        assert!(s >= 22, "expected +22 from crouching horse, got {}", s);
    }

    #[test]
    fn king_safety_symmetric() {
        let mut b = empty();
        place(&mut b, 9, 4, b'K');
        place(&mut b, 0, 4, b'k');
        let s = tactics_score(&b);
        assert_eq!(s, 0);
    }

    #[test]
    fn king_safety_penalizes_enemy_car_nearby() {
        let mut b = empty();
        place(&mut b, 9, 4, b'K');
        place(&mut b, 0, 4, b'k');
        place(&mut b, 8, 4, b'r');  // 黑车压红将
        let s = tactics_score(&b);
        assert!(s < 0, "expected negative (red in danger), got {}", s);
    }
}
