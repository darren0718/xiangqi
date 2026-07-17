// Static Exchange Evaluation for Chinese Chess.
//
// 语义：假设走法 (from -> to) 发生（无论 to 是否有子），双方在 to 格上按
// "最小价值攻击方先手" 轮流交换，返回净得分（相对走 from->to 的一方）。
// 用途：
//   1) score_moves：将 SEE<0 的吃子降级
//   2) quiesce：过滤 SEE<0 的吃子
use crate::board::*;
use crate::rules::square_attacked;

// 象棋没有"发现攻击"的复杂性像国际象棋 X-ray 那么密集，
// 但车/炮的直线攻击存在"隔子"和"X-ray"关系，需要动态重算。
// 简化实现：每次都用 square_attacked 变体，取该方能攻击到 to 且价值最小的子。
// 复杂度 O(交换深度 × 90)，交换深度通常 <10，可接受。

/// 找到给定方所有能攻击到 (tr,tc) 的子的位置 (r,c) 与价值，按价值升序。
/// 忽略 (ignore_r, ignore_c) 处的子（用于"该子已参与交换"的情形）。
fn attackers_sorted(board: &Board, tr: i32, tc: i32, by_red: bool, ignore: &[(i32,i32)]) -> Vec<(i32, i32, i32)> {
    // 返回 (piece_value, r, c) 列表
    let mut list: Vec<(i32,i32,i32)> = Vec::with_capacity(8);
    // 遍历棋盘找所有该方己子，检查是否能通过一次伪走法到达 (tr,tc)
    // 简化：直接枚举各种走法类型的反向匹配
    let rook = if by_red { b'R' } else { b'r' };
    let cannon = if by_red { b'C' } else { b'c' };
    let horse = if by_red { b'H' } else { b'h' };
    let pawn = if by_red { b'P' } else { b'p' };
    let adv = if by_red { b'A' } else { b'a' };
    let king = if by_red { b'K' } else { b'k' };
    let elephant = if by_red { b'E' } else { b'e' };
    
    // 车/炮同线
    for &(dr,dc) in ROOK_DIRS.iter() {
        let mut nr = tr + dr; let mut nc = tc + dc;
        let mut blocked = false;
        while in_board(nr, nc) {
            if ignore.contains(&(nr,nc)) {
                nr += dr; nc += dc;
                continue;
            }
            let p = board[idx(nr,nc)];
            if p != 0 {
                if !blocked {
                    if p == rook { list.push((pval(b'r'), nr, nc)); }
                    blocked = true;
                } else {
                    if p == cannon { list.push((pval(b'c'), nr, nc)); }
                    break;
                }
            }
            nr += dr; nc += dc;
        }
    }
    // 马（反向）：目标格是马的落点，则马从 (tr - dr, tc - dc) 起，蹩腿在 (tr - br, tc - bc)
    for &(dr,dc,br,bc) in HORSE_MOVES.iter() {
        let hr = tr - dr; let hc = tc - dc;
        if !in_board(hr, hc) { continue; }
        if ignore.contains(&(hr,hc)) { continue; }
        let leg_r = tr - br; let leg_c = tc - bc;
        if !in_board(leg_r, leg_c) { continue; }
        let leg = if ignore.contains(&(leg_r,leg_c)) { 0 } else { board[idx(leg_r, leg_c)] };
        if leg != 0 { continue; }
        if board[idx(hr, hc)] == horse { list.push((pval(b'h'), hr, hc)); }
    }
    // 兵：红兵从下方向上攻击 → 目标 (tr,tc) 的攻击者是 (tr+1,tc)，或过河兵横向
    if by_red {
        if tr + 1 < ROWS as i32 {
            if !ignore.contains(&(tr+1, tc)) && board[idx(tr+1, tc)] == pawn {
                list.push((pval(b'p'), tr+1, tc));
            }
        }
        if tr <= 4 {
            if tc - 1 >= 0 && !ignore.contains(&(tr, tc-1)) && board[idx(tr, tc-1)] == pawn {
                list.push((pval(b'p'), tr, tc-1));
            }
            if tc + 1 < COLS as i32 && !ignore.contains(&(tr, tc+1)) && board[idx(tr, tc+1)] == pawn {
                list.push((pval(b'p'), tr, tc+1));
            }
        }
    } else {
        if tr - 1 >= 0 {
            if !ignore.contains(&(tr-1, tc)) && board[idx(tr-1, tc)] == pawn {
                list.push((pval(b'p'), tr-1, tc));
            }
        }
        if tr >= 5 {
            if tc - 1 >= 0 && !ignore.contains(&(tr, tc-1)) && board[idx(tr, tc-1)] == pawn {
                list.push((pval(b'p'), tr, tc-1));
            }
            if tc + 1 < COLS as i32 && !ignore.contains(&(tr, tc+1)) && board[idx(tr, tc+1)] == pawn {
                list.push((pval(b'p'), tr, tc+1));
            }
        }
    }
    // 士（斜一，只在九宫）
    for &(dr,dc) in ADVISOR_MOVES.iter() {
        let ar = tr + dr; let ac = tc + dc;
        if !in_board(ar, ac) { continue; }
        if ignore.contains(&(ar,ac)) { continue; }
        if board[idx(ar,ac)] == adv {
            // 士的活动范围：需要 (ar,ac) 在自己九宫内
            if in_palace(ar, ac, by_red) { list.push((pval(b'a'), ar, ac)); }
        }
    }
    // 象（田字，不过河，象眼不被塞）
    for &(dr,dc,br,bc) in ELEPHANT_MOVES.iter() {
        let er = tr + dr; let ec = tc + dc;
        if !in_board(er, ec) { continue; }
        if ignore.contains(&(er,ec)) { continue; }
        // 象眼
        let eye_r = tr + br; let eye_c = tc + bc;
        if !in_board(eye_r, eye_c) { continue; }
        let eye = if ignore.contains(&(eye_r, eye_c)) { 0 } else { board[idx(eye_r, eye_c)] };
        if eye != 0 { continue; }
        if board[idx(er,ec)] == elephant {
            // 象不过河：象在自己方半盘
            if by_red && er >= 5 { list.push((pval(b'e'), er, ec)); }
            if !by_red && er <= 4 { list.push((pval(b'e'), er, ec)); }
        }
    }
    // 将（直一，只在九宫；或将对脸）
    for &(dr,dc) in KING_MOVES.iter() {
        let kr = tr + dr; let kc = tc + dc;
        if !in_board(kr, kc) { continue; }
        if ignore.contains(&(kr,kc)) { continue; }
        if board[idx(kr,kc)] == king && in_palace(kr, kc, by_red) {
            list.push((pval(b'k'), kr, kc));
        }
    }
    // 将对脸攻击（同列，仅经过空/已忽略）
    let king_dir_from_target = if by_red { 1 } else { -1 };
    let mut nr = tr + king_dir_from_target;
    while in_board(nr, tc) {
        if ignore.contains(&(nr, tc)) { nr += king_dir_from_target; continue; }
        let p = board[idx(nr, tc)];
        if p != 0 {
            if p == king { list.push((pval(b'k'), nr, tc)); }
            break;
        }
        nr += king_dir_from_target;
    }

    list.sort_by(|a,b| a.0.cmp(&b.0));
    list
}

/// SEE：假设 from->to 走法执行后（用 attacker 换 victim），后续在 to 格的连续交换净分。
/// 返回相对"发起者"（走 from 的一方）的净分。正 = 赚。
///
/// 标准 SEE 算法（参考 Stockfish/CPW）：
///   gain[0] = value(captured);
///   d=0; ignore={from}; attacker_value = value(attacker); side = enemy;
///   loop:
///     d++;
///     gain[d] = attacker_value - gain[d-1];
///     if max(-gain[d-1], gain[d]) < 0: break  # stand-pat 提前中止
///     next_attacker = least attacker of side, skipping ignored
///     if none: break
///     push next_attacker into ignore; attacker_value = its value; side = flip
///   minimax back:
///     while --d > 0: gain[d-1] = -max(-gain[d-1], gain[d])
///   return gain[0]
pub fn see(board: &Board, fr: i32, fc: i32, tr: i32, tc: i32) -> i32 {
    let attacker_piece = board[idx(fr, fc)];
    if attacker_piece == 0 { return 0; }
    let attacker_side = is_red(attacker_piece);
    let victim_piece = board[idx(tr, tc)];

    let mut gain: [i32; 32] = [0; 32];
    let mut d: usize = 0;
    gain[0] = pval(piece_type_lower(victim_piece));

    let mut ignore: Vec<(i32,i32)> = vec![(fr, fc)];
    let mut cur_attacker_value = pval(piece_type_lower(attacker_piece));
    let mut side = !attacker_side;

    loop {
        d += 1;
        gain[d] = cur_attacker_value - gain[d-1];
        // stand-pat cutoff: 若走 "换" 已经净亏（gain[d]<0）且不换（-gain[d-1]）也净亏，退出
        if std::cmp::max(-gain[d-1], gain[d]) < 0 { break; }
        let atks = attackers_sorted(board, tr, tc, side, &ignore);
        if atks.is_empty() { break; }
        let (av, ar, ac) = atks[0];
        ignore.push((ar, ac));
        cur_attacker_value = av;
        side = !side;
        // 若最小攻击者是将，只有对方没有子时才能"换将"。将参与交换会被吃立即失败，通常不允许
        // 简化：允许"将吃"，因为若能到这一步，说明真的没有更小的攻击者
        if av >= pval(b'k') {
            // 将参与后不能再被交换（将被吃就输了），下一轮找不到攻击者也会退出
        }
    }
    // C 等价 `while(--d)`：d 从当前值预减，非零才执行
    while d > 1 {
        d -= 1;
        gain[d-1] = -std::cmp::max(-gain[d-1], gain[d]);
    }
    gain[0]
}

/// 便捷入口：走一个走法后的 SEE。若 to 格无子（非吃子），返回 0。
pub fn see_capture(board: &Board, fr: i32, fc: i32, tr: i32, tc: i32) -> i32 {
    if board[idx(tr, tc)] == 0 { return 0; }
    see(board, fr, fc, tr, tc)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn empty_board() -> Board { [0u8; NSQ] }
    fn place(b: &mut Board, r: i32, c: i32, p: u8) { b[idx(r,c)] = p; }

    #[test]
    fn car_kaws_pawn_no_defender() {
        // 红车吃黑无护小卒
        let mut b = empty_board();
        place(&mut b, 5, 0, b'R');
        place(&mut b, 3, 0, b'p');
        // 红双方将不能省（不然攻击方计算含将对脸）
        place(&mut b, 9, 4, b'K');
        place(&mut b, 0, 4, b'k');
        let v = see(&b, 5, 0, 3, 0);
        assert_eq!(v, pval(b'p'), "SEE 应该等于卒的价值，got {}", v);
    }

    #[test]
    fn car_takes_pawn_with_car_defender() {
        // 红车吃卒，但有黑车保护 → 净分 = 卒价 - 车价
        let mut b = empty_board();
        place(&mut b, 5, 0, b'R');
        place(&mut b, 3, 0, b'p');
        place(&mut b, 0, 0, b'r'); // 黑车同列护
        place(&mut b, 9, 4, b'K');
        place(&mut b, 0, 4, b'k');
        let v = see(&b, 5, 0, 3, 0);
        assert_eq!(v, pval(b'p') - pval(b'r'), "SEE 应为卒-车，got {}", v);
    }

    #[test]
    fn cannon_takes_pawn_needs_carriage() {
        // 炮吃卒需要炮架：直接放炮和卒之间无子，则炮不能"直接吃"
        // 但 SEE 假设走法已发生，所以我们测试的是"合法走法后的连续换"
        // 这里 setup：红炮通过跳炮架吃卒
        let mut b = empty_board();
        place(&mut b, 5, 0, b'C');
        place(&mut b, 4, 0, b'H'); // 炮架
        place(&mut b, 3, 0, b'p');
        place(&mut b, 9, 4, b'K');
        place(&mut b, 0, 4, b'k');
        let v = see(&b, 5, 0, 3, 0);
        assert_eq!(v, pval(b'p'), "SEE = 卒价，got {}", v);
    }
}
