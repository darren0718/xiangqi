// 棋盘/棋子基础定义。以 u8 ASCII 编码棋子（0=空）与 JS 侧一致。
pub const ROWS: usize = 10;
pub const COLS: usize = 9;
pub const NSQ: usize = ROWS * COLS;

pub type Board = [u8; NSQ];

// 棋子ASCII
pub const K: u8 = b'K';
pub const R: u8 = b'R';
pub const H: u8 = b'H';
pub const C: u8 = b'C';
pub const A: u8 = b'A';
pub const E: u8 = b'E';
pub const P: u8 = b'P';
pub const K2: u8 = b'k';
pub const R2: u8 = b'r';
pub const H2: u8 = b'h';
pub const C2: u8 = b'c';
pub const A2: u8 = b'a';
pub const E2: u8 = b'e';
pub const P2: u8 = b'p';

#[inline(always)]
pub fn idx(r: i32, c: i32) -> usize { (r as usize) * COLS + (c as usize) }
#[inline(always)]
pub fn in_board(r: i32, c: i32) -> bool { r >= 0 && r < ROWS as i32 && c >= 0 && c < COLS as i32 }
#[inline(always)]
pub fn is_red(p: u8) -> bool { p >= b'A' && p <= b'Z' }
#[inline(always)]
pub fn is_black(p: u8) -> bool { p >= b'a' && p <= b'z' }
#[inline(always)]
pub fn is_own(p: u8, red: bool) -> bool { if red { is_red(p) } else { is_black(p) } }
#[inline(always)]
pub fn is_enemy(p: u8, red: bool) -> bool { if red { is_black(p) } else { is_red(p) } }
#[inline(always)]
pub fn in_palace(r: i32, c: i32, red: bool) -> bool {
    if c < 3 || c > 5 { return false; }
    if red { r >= 7 && r <= 9 } else { r >= 0 && r <= 2 }
}
#[inline(always)]
pub fn crossed_river(r: i32, red: bool) -> bool { if red { r <= 4 } else { r >= 5 } }
#[inline(always)]
pub fn piece_type_lower(p: u8) -> u8 { if p >= b'A' && p <= b'Z' { p + 32 } else { p } }

// 子力价值（下标即ASCII的type_lower）
pub fn pval(t: u8) -> i32 {
    match t { b'k' => 60000, b'r' => 900, b'h' => 400, b'c' => 450, b'a' => 200, b'e' => 200, b'p' => 100, _ => 0 }
}

pub fn initial_board() -> Board {
    let rows: [&[u8; COLS]; ROWS] = [
        b"rheakaehr",
        b"\0\0\0\0\0\0\0\0\0",
        b"\0c\0\0\0\0\0c\0",
        b"p\0p\0p\0p\0p",
        b"\0\0\0\0\0\0\0\0\0",
        b"\0\0\0\0\0\0\0\0\0",
        b"P\0P\0P\0P\0P",
        b"\0C\0\0\0\0\0C\0",
        b"\0\0\0\0\0\0\0\0\0",
        b"RHEAKAEHR",
    ];
    let mut b = [0u8; NSQ];
    for r in 0..ROWS { for c in 0..COLS { b[r*COLS+c] = rows[r][c]; } }
    b
}

// 走法方向常量（复制 chess.js）
pub const HORSE_MOVES: [(i32,i32,i32,i32); 8] = [
    (-2,-1,-1,0),(-2,1,-1,0),(2,-1,1,0),(2,1,1,0),
    (-1,-2,0,-1),(1,-2,0,-1),(-1,2,0,1),(1,2,0,1)
];
pub const ADVISOR_MOVES: [(i32,i32); 4] = [(-1,-1),(-1,1),(1,-1),(1,1)];
pub const KING_MOVES: [(i32,i32); 4] = [(-1,0),(1,0),(0,-1),(0,1)];
pub const ELEPHANT_MOVES: [(i32,i32,i32,i32); 4] = [(-2,-2,-1,-1),(-2,2,-1,1),(2,-2,1,-1),(2,2,1,1)];
pub const ROOK_DIRS: [(i32,i32); 4] = [(-1,0),(1,0),(0,-1),(0,1)];
