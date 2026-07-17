'use strict';
/**
 * 象棋 AI Worker（Rust/wasm 版）
 *
 * 保留原 Worker 消息 API：
 *   - {type:'search', board, redToMove, depth, moveHistory, timeLimit}
 *   - {type:'stop'}
 *   - {type:'newgame'}
 * 主线程收到：
 *   - {type:'progress', depth, nodes, timeMs, score, pv, bestMove}
 *   - {type:'result',   bestMove, score, depth, nodes, timeMs, pv}
 *
 * 底层调用 Rust 编译的 wasm 引擎（js/wasm/engine.js + engine_bg.wasm）。
 * 规则/评估/搜索/开局库全部在 wasm 中，功能与 JS 版一致（Perft/eval 已对拍）。
 */

importScripts('wasm/engine.js');

let wasmReady = false;
let wasmApi = null;

// Worker 启动时预加载 wasm
async function initWasm() {
  if (wasmReady) return;
  // engine.js 定义了全局 wasm_bindgen 函数
  const url = new URL('wasm/engine_bg.wasm', self.location.href);
  await wasm_bindgen(url);
  wasmApi = wasm_bindgen;
  wasmReady = true;
}

// board 二维数组 → 90 字节 Uint8Array
function boardToFlat(board) {
  const b = new Uint8Array(90);
  for (let r=0; r<10; r++) {
    const row = board[r];
    for (let c=0; c<9; c++) {
      const p = row[c];
      b[r*9+c] = p === 0 ? 0 : p.charCodeAt(0);
    }
  }
  return b;
}

// PV 扁平 Int32Array → [[fr,fc,tr,tc], ...]
function pvFlatToArr(flat) {
  const out = [];
  for (let i=0; i+3<flat.length; i+=4) out.push([flat[i],flat[i+1],flat[i+2],flat[i+3]]);
  return out;
}

let searching = false;

self.onmessage = async function(e) {
  const msg = e.data;
  if (!wasmReady) await initWasm();

  if (msg.type === 'newgame') {
    wasmApi.tt_clear(); wasmApi.h_reset();
    return;
  }
  if (msg.type === 'stop') {
    wasmApi.stop();
    return;
  }
  if (msg.type !== 'search') return;

  searching = true;
  const searchToken = msg.token;
  wasmApi.h_reset();
  const flat = boardToFlat(msg.board);
  const mh = msg.moveHistory || [];
  const mhFlat = new Int32Array(mh.length * 4);
  for (let i=0; i<mh.length; i++) { mhFlat[i*4]=mh[i][0]; mhFlat[i*4+1]=mh[i][1]; mhFlat[i*4+2]=mh[i][2]; mhFlat[i*4+3]=mh[i][3]; }
  const timeLimit = msg.timeLimit || (msg.depth>=5?3000:msg.depth>=4?1500:msg.depth>=3?600:200);

  const onProgress = (p) => {
    postMessage({
      type: 'progress',
      token: searchToken,
      depth: p.depth,
      nodes: p.nodes,
      timeMs: p.timeMs,
      score: p.score,
      pv: pvFlatToArr(p.pv),
      bestMove: [p.bestMove[0], p.bestMove[1], p.bestMove[2], p.bestMove[3]],
    });
  };

  let r;
  try {
    r = wasmApi.ai_move_wasm(flat, !!msg.redToMove, msg.depth|0, mhFlat, timeLimit, onProgress);
  } catch (err) {
    console.error('[worker] ai_move_wasm threw:', err);
    searching = false;
    postMessage({ type: 'result', token: searchToken, bestMove: null, score: 0, depth: 0, nodes: 0, timeMs: 0, pv: [], error: String(err) });
    return;
  }
  searching = false;

  const bestMove = r && r.found ? [r.best_from_r, r.best_from_c, r.best_to_r, r.best_to_c] : null;
  postMessage({
    type: 'result',
    token: searchToken,
    bestMove,
    score: r ? r.score : 0,
    depth: r ? r.depth : 0,
    nodes: r ? r.nodes : 0,
    timeMs: r ? r.time_ms : 0,
    pv: r ? pvFlatToArr(r.pv) : [],
  });
};

// Worker 顶层错误捕获：任何 uncaught panic/exception 都要通知主线程解锁 UI
self.addEventListener('error', (ev) => {
  console.error('[worker] uncaught error:', ev.message || ev);
  if (searching) {
    searching = false;
    postMessage({ type: 'result', bestMove: null, score: 0, depth: 0, nodes: 0, timeMs: 0, pv: [], error: ev.message || 'unknown worker error' });
  }
});
self.addEventListener('unhandledrejection', (ev) => {
  console.error('[worker] unhandled rejection:', ev.reason);
  if (searching) {
    searching = false;
    postMessage({ type: 'result', bestMove: null, score: 0, depth: 0, nodes: 0, timeMs: 0, pv: [], error: String(ev.reason) });
  }
});
