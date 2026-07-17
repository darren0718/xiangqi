// 规则引擎：走法生成、将军判定、合法走法过滤。逐条对齐 chess.js。
use crate::board::*;

pub type Move = (i32, i32, i32, i32); // (fr,fc,tr,tc)

#[derive(Clone, Copy)]
pub struct Undo { pub fr: i32, pub fc: i32, pub tr: i32, pub tc: i32, pub piece: u8, pub captured: u8 }

#[inline(always)]
pub fn make_move(b: &mut Board, fr: i32, fc: i32, tr: i32, tc: i32) -> Undo {
    let piece = b[idx(fr,fc)]; let captured = b[idx(tr,tc)];
    b[idx(tr,tc)] = piece; b[idx(fr,fc)] = 0;
    Undo { fr, fc, tr, tc, piece, captured }
}
#[inline(always)]
pub fn unmake_move(b: &mut Board, u: Undo) {
    b[idx(u.fr,u.fc)] = u.piece; b[idx(u.tr,u.tc)] = u.captured;
}

/// 伪走法：以扁平数组 [tr,tc,tr,tc,...] 写入 out。
pub fn pseudo_moves(board: &Board, r: i32, c: i32, out: &mut Vec<i32>) {
    let p = board[idx(r,c)]; if p == 0 { return; }
    let red = is_red(p); let t = piece_type_lower(p);
    macro_rules! push_if { ($nr:expr,$nc:expr) => {{
        if in_board($nr,$nc) { let tt = board[idx($nr,$nc)]; if !is_own(tt, red) { out.push($nr); out.push($nc); if tt == 0 { true } else { false } } else { false } } else { false }
    }};}
    match t {
        b'k' => {
            for &(dr,dc) in KING_MOVES.iter() { let nr=r+dr; let nc=c+dc; if in_palace(nr,nc,red) { let _=push_if!(nr,nc); } }
            // 老将对脸
            let ek = if red { b'k' } else { b'K' }; let dir = if red { -1 } else { 1 };
            let mut nr = r + dir;
            while in_board(nr, c) {
                let x = board[idx(nr,c)];
                if x != 0 { if x == ek { out.push(nr); out.push(c); } break; }
                nr += dir;
            }
        }
        b'a' => { for &(dr,dc) in ADVISOR_MOVES.iter() { let nr=r+dr; let nc=c+dc; if in_palace(nr,nc,red) { let _=push_if!(nr,nc); } } }
        b'e' => {
            for &(dr,dc,br,bc) in ELEPHANT_MOVES.iter() {
                let nr=r+dr; let nc=c+dc; if !in_board(nr,nc) { continue; }
                if red && nr < 5 { continue; } if !red && nr > 4 { continue; }
                if board[idx(r+br, c+bc)] != 0 { continue; }
                let _=push_if!(nr,nc);
            }
        }
        b'h' => {
            for &(dr,dc,br,bc) in HORSE_MOVES.iter() {
                let nr=r+dr; let nc=c+dc; if !in_board(nr,nc) { continue; }
                if board[idx(r+br, c+bc)] != 0 { continue; }
                let _=push_if!(nr,nc);
            }
        }
        b'r' => {
            for &(dr,dc) in ROOK_DIRS.iter() {
                let mut nr=r+dr; let mut nc=c+dc;
                while in_board(nr,nc) {
                    if !push_if!(nr,nc) { break; }
                    nr += dr; nc += dc;
                }
            }
        }
        b'c' => {
            for &(dr,dc) in ROOK_DIRS.iter() {
                let mut nr=r+dr; let mut nc=c+dc;
                while in_board(nr,nc) && board[idx(nr,nc)] == 0 { out.push(nr); out.push(nc); nr+=dr; nc+=dc; }
                if !in_board(nr,nc) { continue; }
                nr += dr; nc += dc;
                while in_board(nr,nc) {
                    let x = board[idx(nr,nc)];
                    if x != 0 { if is_enemy(x, red) { out.push(nr); out.push(nc); } break; }
                    nr+=dr; nc+=dc;
                }
            }
        }
        b'p' => {
            let fwd = if red { -1 } else { 1 };
            if in_board(r+fwd, c) { let tt = board[idx(r+fwd,c)]; if !is_own(tt,red) { out.push(r+fwd); out.push(c); } }
            if crossed_river(r, red) {
                for &dc in &[-1,1] {
                    let nc = c + dc; if in_board(r, nc) { let tt = board[idx(r,nc)]; if !is_own(tt,red) { out.push(r); out.push(nc); } }
                }
            }
        }
        _ => {}
    }
}

pub fn find_king(board: &Board, red: bool) -> Option<(i32,i32)> {
    let k = if red { b'K' } else { b'k' };
    for r in 0..ROWS as i32 { for c in 0..COLS as i32 { if board[idx(r,c)] == k { return Some((r,c)); } } }
    None
}

/// 定向攻击检测：byRed 方是否攻击到 (tr,tc)
pub fn square_attacked(board: &Board, tr: i32, tc: i32, by_red: bool) -> bool {
    let rook = if by_red { b'R' } else { b'r' };
    let cannon = if by_red { b'C' } else { b'c' };
    let horse = if by_red { b'H' } else { b'h' };
    let pawn = if by_red { b'P' } else { b'p' };
    let adv = if by_red { b'A' } else { b'a' };
    let king = if by_red { b'K' } else { b'k' };

    // 车/炮同线
    for &(dr,dc) in ROOK_DIRS.iter() {
        let mut nr=tr+dr; let mut nc=tc+dc; let mut blocked = false;
        while in_board(nr,nc) {
            let p = board[idx(nr,nc)];
            if p != 0 {
                if !blocked { if p == rook { return true; } blocked = true; }
                else { if p == cannon { return true; } break; }
            }
            nr+=dr; nc+=dc;
        }
    }
    // 马（反向）
    for &(dr,dc,br,bc) in HORSE_MOVES.iter() {
        let hr = tr - dr; let hc = tc - dc;
        if !in_board(hr,hc) { continue; }
        if board[idx(hr,hc)] == horse && board[idx(tr-br, tc-bc)] == 0 { return true; }
    }
    // 兵
    if by_red {
        if tr+1 < ROWS as i32 && board[idx(tr+1, tc)] == pawn { return true; }
        if tr <= 4 {
            if tc-1 >= 0 && board[idx(tr, tc-1)] == pawn { return true; }
            if tc+1 < COLS as i32 && board[idx(tr, tc+1)] == pawn { return true; }
        }
    } else {
        if tr-1 >= 0 && board[idx(tr-1, tc)] == pawn { return true; }
        if tr >= 5 {
            if tc-1 >= 0 && board[idx(tr, tc-1)] == pawn { return true; }
            if tc+1 < COLS as i32 && board[idx(tr, tc+1)] == pawn { return true; }
        }
    }
    // 士
    for &(dr,dc) in ADVISOR_MOVES.iter() {
        let ar=tr+dr; let ac=tc+dc;
        if in_board(ar,ac) && board[idx(ar,ac)] == adv { return true; }
    }
    // 将（近距离）
    for &(dr,dc) in KING_MOVES.iter() {
        let kr=tr+dr; let kc=tc+dc;
        if in_board(kr,kc) && board[idx(kr,kc)] == king { return true; }
    }
    // 将对脸
    let dir = if by_red { 1 } else { -1 };
    let mut nr = tr + dir;
    while in_board(nr, tc) {
        let p = board[idx(nr, tc)];
        if p != 0 { if p == king { return true; } break; }
        nr += dir;
    }
    false
}

pub fn in_check(board: &Board, red: bool) -> bool {
    match find_king(board, red) { Some((r,c)) => square_attacked(board, r, c, !red), None => true }
}

/// 计算被牵制棋子的位棋盘（u128 足够容纳 90 格）
pub fn compute_pinned(board: &Board, red: bool, kp: (i32,i32)) -> u128 {
    let mut pinned: u128 = 0;
    let (kr, kc) = kp;
    let e_rook = if red { b'r' } else { b'R' };
    let e_king = if red { b'k' } else { b'K' };
    // 车牵制
    for &(dr,dc) in ROOK_DIRS.iter() {
        let mut nr=kr+dr; let mut nc=kc+dc;
        let mut blocker: Option<(i32,i32)> = None; let mut blockers = 0;
        while in_board(nr,nc) {
            let p = board[idx(nr,nc)];
            if p != 0 {
                if is_own(p, red) {
                    blockers += 1;
                    if blockers == 1 { blocker = Some((nr,nc)); } else { break; }
                } else {
                    if p == e_rook && blockers == 1 {
                        let (br, bcc) = blocker.unwrap();
                        pinned |= 1u128 << (br*9 + bcc);
                    }
                    break;
                }
            }
            nr+=dr; nc+=dc;
        }
    }
    // 将对脸牵制（本方王在其列上，中间夹本方 1 子）
    let fdir = if red { -1 } else { 1 };
    let mut fnr = kr + fdir;
    let mut between: Option<(i32,i32)> = None; let mut found = false;
    while in_board(fnr, kc) {
        let p = board[idx(fnr, kc)];
        if p != 0 {
            if p == e_king { found = true; break; }
            if between.is_some() { between = None; break; }
            between = Some((fnr, kc));
        }
        fnr += fdir;
    }
    if found { if let Some((br,bcc)) = between { pinned |= 1u128 << (br*9 + bcc); } }
    pinned
}

pub fn is_legal_move(board: &mut Board, fr: i32, fc: i32, tr: i32, tc: i32) -> bool {
    let p = board[idx(fr,fc)]; if p == 0 { return false; }
    let red = is_red(p);
    let u = make_move(board, fr, fc, tr, tc);
    let ok = !in_check(board, red);
    unmake_move(board, u);
    ok
}

fn gen_moves(board: &mut Board, red: bool, captures_only: bool) -> Vec<Move> {
    let mut list: Vec<Move> = Vec::with_capacity(64);
    let kp = match find_king(board, red) { Some(x) => x, None => return list };
    let in_chk = square_attacked(board, kp.0, kp.1, !red);
    let pinned_bb: u128 = if in_chk { 0 } else { compute_pinned(board, red, kp) };
    let mut buf: Vec<i32> = Vec::with_capacity(32);
    for r in 0..ROWS as i32 {
        for c in 0..COLS as i32 {
            let p = board[idx(r,c)];
            if p == 0 || !is_own(p, red) { continue; }
            buf.clear();
            pseudo_moves(board, r, c, &mut buf);
            let p_type = piece_type_lower(p);
            let is_k = p_type == b'k';
            let is_p = !is_k && ((pinned_bb >> (r*9 + c)) & 1) == 1;
            let mut i = 0;
            while i < buf.len() {
                let tr = buf[i]; let tc = buf[i+1]; i += 2;
                if captures_only && board[idx(tr,tc)] == 0 { continue; }
                let legal;
                if !in_chk && !is_k && !is_p {
                    legal = true;
                } else {
                    let u = make_move(board, r, c, tr, tc);
                    let np = if is_k { find_king(board, red) } else { Some(kp) };
                    legal = match np { Some((kr,kc)) => !square_attacked(board, kr, kc, !red), None => false };
                    unmake_move(board, u);
                }
                if legal { list.push((r,c,tr,tc)); }
            }
        }
    }
    list
}

pub fn all_legal_moves(board: &mut Board, red: bool) -> Vec<Move> { gen_moves(board, red, false) }
pub fn legal_captures(board: &mut Board, red: bool) -> Vec<Move> { gen_moves(board, red, true) }

pub enum Status { Normal, Checkmate, Stalemate }
pub fn game_status(board: &mut Board, red_to_move: bool) -> Status {
    if all_legal_moves(board, red_to_move).is_empty() {
        if in_check(board, red_to_move) { Status::Checkmate } else { Status::Stalemate }
    } else { Status::Normal }
}
