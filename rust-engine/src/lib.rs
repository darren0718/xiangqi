// WASM/JS 桥接层
mod board;
mod rules;
mod eval;
mod zobrist;
mod book;
mod search;
mod see;

use wasm_bindgen::prelude::*;
use board::*;
use rules::*;
use eval::evaluate as eval_evaluate;
use zobrist::*;
use search::*;

// ================= 工具：解析棋盘 =================
// JS 传来的 board 是二维 char 数组（长度10行×9列的扁平字符串更方便）
// 我们约定：JS 侧把 board 摊平成 90 字节的 Uint8Array（0=空，其余=ASCII）

fn parse_board(flat: &[u8]) -> Board {
    let mut b = [0u8; NSQ];
    let n = flat.len().min(NSQ);
    b[..n].copy_from_slice(&flat[..n]);
    b
}

fn moves_to_flat(mvs: &[(i32,i32,i32,i32)]) -> Vec<i32> {
    let mut o = Vec::with_capacity(mvs.len()*4);
    for &(a,b,c,d) in mvs { o.push(a); o.push(b); o.push(c); o.push(d); }
    o
}

fn parse_move_history(flat: &[i32]) -> Vec<(i32,i32,i32,i32)> {
    let mut o = Vec::with_capacity(flat.len()/4);
    let mut i = 0;
    while i + 3 < flat.len() { o.push((flat[i], flat[i+1], flat[i+2], flat[i+3])); i += 4; }
    o
}

// ================= 单次评估 / 走法生成（对拍用）=================

#[wasm_bindgen]
pub fn evaluate_board(flat_board: &[u8]) -> i32 {
    let b = parse_board(flat_board);
    eval_evaluate(&b)
}

#[wasm_bindgen]
pub fn all_legal_moves_flat(flat_board: &[u8], red_to_move: bool) -> Vec<i32> {
    let mut b = parse_board(flat_board);
    moves_to_flat(&all_legal_moves(&mut b, red_to_move))
}

#[wasm_bindgen]
pub fn legal_captures_flat(flat_board: &[u8], red_to_move: bool) -> Vec<i32> {
    let mut b = parse_board(flat_board);
    moves_to_flat(&legal_captures(&mut b, red_to_move))
}

#[wasm_bindgen]
pub fn in_check_side(flat_board: &[u8], red: bool) -> bool {
    let b = parse_board(flat_board);
    in_check(&b, red)
}

#[wasm_bindgen]
pub fn is_legal_move_wasm(flat_board: &[u8], fr: i32, fc: i32, tr: i32, tc: i32) -> bool {
    let mut b = parse_board(flat_board);
    is_legal_move(&mut b, fr, fc, tr, tc)
}

#[wasm_bindgen]
pub fn game_status_str(flat_board: &[u8], red_to_move: bool) -> String {
    let mut b = parse_board(flat_board);
    match game_status(&mut b, red_to_move) {
        Status::Normal => "normal".into(),
        Status::Checkmate => "checkmate".into(),
        Status::Stalemate => "stalemate".into(),
    }
}

// ================= Perft（走法生成对拍）=================
fn perft(board: &mut Board, red_to_move: bool, depth: i32) -> u64 {
    if depth == 0 { return 1; }
    let moves = all_legal_moves(board, red_to_move);
    if depth == 1 { return moves.len() as u64; }
    let mut cnt: u64 = 0;
    for (fr,fc,tr,tc) in moves {
        let u = make_move(board, fr, fc, tr, tc);
        cnt += perft(board, !red_to_move, depth-1);
        unmake_move(board, u);
    }
    cnt
}

#[wasm_bindgen]
pub fn perft_wasm(flat_board: &[u8], red_to_move: bool, depth: i32) -> u64 {
    let mut b = parse_board(flat_board);
    perft(&mut b, red_to_move, depth)
}

// ================= 主搜索 =================

// 使用 thread_local 单例（wasm 单线程）
use std::cell::RefCell;
thread_local! {
    static CTX: RefCell<SearchCtx> = RefCell::new(SearchCtx::new());
}

#[wasm_bindgen]
pub fn tt_clear() { CTX.with(|c| c.borrow_mut().clear_tt()); }
#[wasm_bindgen]
pub fn h_reset() { CTX.with(|c| c.borrow_mut().reset_history()); }
#[wasm_bindgen]
pub fn stop() { CTX.with(|c| c.borrow_mut().stop = true); }

#[wasm_bindgen(getter_with_clone)]
pub struct WasmSearchResult {
    pub best_from_r: i32, pub best_from_c: i32, pub best_to_r: i32, pub best_to_c: i32,
    pub score: i32,
    pub depth: i32,
    pub nodes: u32,
    pub time_ms: f64,
    pub pv: Vec<i32>,
    pub found: bool,
}

// JS 侧通过 Date.now 传入起始时间基准；这里用 performance.now 由宿主提供更好，但 wasm-bindgen 简化：由 JS 传时间戳序列不可能，我们采用外部 now 接口。
#[inline]
fn now_ms() -> f64 { js_sys::Date::now() }

#[wasm_bindgen]
pub fn ai_move_wasm(
    flat_board: &[u8],
    ai_is_red: bool,
    max_depth: i32,
    move_history_flat: &[i32],
    time_limit_ms: f64,
    on_progress: Option<js_sys::Function>,
) -> WasmSearchResult {
    let b = parse_board(flat_board);
    let mh = parse_move_history(move_history_flat);
    let time_limit = if time_limit_ms > 0.0 { Some(time_limit_ms) } else { None };
    let res = CTX.with(|c| {
        let mut c = c.borrow_mut();
        c.nodes = 0; c.stop = false;
        let cb = on_progress;
        let mut progress_fn = |depth: i32, nodes: u64, time_ms: f64, score: i32, pv: &[(i32,i32,i32,i32)], bm: (i32,i32,i32,i32)| {
            if let Some(ref f) = cb {
                let this = wasm_bindgen::JsValue::NULL;
                let pv_flat = moves_to_flat(pv);
                let pv_arr = js_sys::Int32Array::from(&pv_flat[..]);
                let bm_arr = js_sys::Int32Array::from(&[bm.0, bm.1, bm.2, bm.3][..]);
                let obj = js_sys::Object::new();
                let _ = js_sys::Reflect::set(&obj, &"depth".into(), &(depth as f64).into());
                let _ = js_sys::Reflect::set(&obj, &"nodes".into(), &(nodes as f64).into());
                let _ = js_sys::Reflect::set(&obj, &"timeMs".into(), &time_ms.into());
                let _ = js_sys::Reflect::set(&obj, &"score".into(), &(score as f64).into());
                let _ = js_sys::Reflect::set(&obj, &"pv".into(), &pv_arr.into());
                let _ = js_sys::Reflect::set(&obj, &"bestMove".into(), &bm_arr.into());
                let _ = f.call1(&this, &obj);
            }
        };
        ai_move(&mut c, &b, ai_is_red, max_depth, Some(&mh), time_limit, || now_ms(), Some(&mut progress_fn))
    });
    match res {
        Some(r) => {
            let (fr,fc,tr,tc) = r.best_move.unwrap_or((-1,-1,-1,-1));
            WasmSearchResult {
                best_from_r: fr, best_from_c: fc, best_to_r: tr, best_to_c: tc,
                score: r.score, depth: r.depth, nodes: r.nodes as u32, time_ms: r.time_ms,
                pv: moves_to_flat(&r.pv), found: r.best_move.is_some(),
            }
        }
        None => WasmSearchResult {
            best_from_r: -1, best_from_c: -1, best_to_r: -1, best_to_c: -1,
            score: 0, depth: 0, nodes: 0, time_ms: 0.0, pv: vec![], found: false,
        }
    }
}

#[wasm_bindgen]
pub fn board_hash_wasm(flat_board: &[u8], red_to_move: bool) -> String {
    let b = parse_board(flat_board);
    CTX.with(|c| {
        let c = c.borrow();
        let h = board_hash(&c.z, &b, red_to_move);
        format!("{}", h)
    })
}

// Provide seeded zobrist init to allow deterministic cross-check
#[wasm_bindgen]
pub fn set_zobrist_seed(seed_hi: u32, seed_lo: u32) {
    CTX.with(|c| {
        let mut c = c.borrow_mut();
        let seed = ((seed_hi as u64) << 32) | (seed_lo as u64);
        c.z = build_zobrist(seed);
    });
}
