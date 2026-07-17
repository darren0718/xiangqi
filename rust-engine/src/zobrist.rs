// 64-bit Zobrist Hash（与 JS 版语义等价）
use crate::board::*;

pub struct Zobrist {
    pub piece: [[u64; NSQ]; 14], // 14 = 7 red + 7 black
    pub side: [u64; 2],
}

// 小型确定性 PRNG（splitmix64 变体），保证多平台一致
fn splitmix64(x: &mut u64) -> u64 {
    *x = x.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

pub fn build_zobrist(seed: u64) -> Zobrist {
    let mut s = seed;
    let mut z = Zobrist { piece: [[0u64; NSQ]; 14], side: [0u64; 2] };
    for i in 0..14 { for j in 0..NSQ { z.piece[i][j] = splitmix64(&mut s); } }
    z.side[0] = splitmix64(&mut s);
    z.side[1] = splitmix64(&mut s);
    z
}

// 棋子 → piece 表下标
#[inline(always)]
pub fn piece_index(p: u8) -> usize {
    match p {
        b'K' => 0, b'R' => 1, b'H' => 2, b'C' => 3, b'A' => 4, b'E' => 5, b'P' => 6,
        b'k' => 7, b'r' => 8, b'h' => 9, b'c' => 10, b'a' => 11, b'e' => 12, b'p' => 13,
        _ => 255,
    }
}

pub fn board_hash(z: &Zobrist, board: &Board, red_to_move: bool) -> u64 {
    let mut h: u64 = 0;
    for r in 0..ROWS { for c in 0..COLS {
        let p = board[r*COLS+c]; if p == 0 { continue; }
        let i = piece_index(p); if i != 255 { h ^= z.piece[i][r*COLS+c]; }
    } }
    h ^= z.side[if red_to_move { 1 } else { 0 }];
    h
}
