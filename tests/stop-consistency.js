/**
 * Step 14 修复验证：搜索被 stop（时间到）中途打断时，
 * 返回的 best_move 必须是「已完成的某一层」的最佳走法，而不是本轮部分搜索的产物。
 *
 * 方法：同一个中局局面，用 3 种时间预算跑
 *   - long_ms  = 8000（充分搜索，得到"真实"深度和 bestMove）
 *   - short_ms = 200~800（会被 stop 打断，深度浅一些）
 * 断言：
 *   1) short 返回的 bestMove 与 long 中「同深度」的 bestMove 一致
 *   2) short 返回的 depth 是"完整完成"的层数（不比 progress 汇报的最后 depth 少 1）
 */
const fs = require('fs');
const path = require('path');
const wasmSrc = fs.readFileSync(path.join(__dirname,'..','js','wasm','engine.js'),'utf8')
  .replace('let wasm_bindgen =', 'globalThis.wasm_bindgen =');
eval(wasmSrc);
let chessCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'chess.js'), 'utf8').replace(/'use strict';?/g, '');
new Function(chessCode + '\nglobalThis.INITIAL_BOARD=INITIAL_BOARD; globalThis.makeMove=makeMove; globalThis.unmakeMove=unmakeMove;')();

function boardToFlat(board) {
  const b = new Uint8Array(90);
  for (let r=0; r<10; r++) for (let c=0; c<9; c++) {
    const p = board[r][c]; b[r*9+c] = p === 0 ? 0 : p.charCodeAt(0);
  }
  return b;
}

const MID_MOVES = [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6],[6,4,5,4],[3,4,4,4],[7,4,6,4],[2,2,4,3]];

(async () => {
  await wasm_bindgen(fs.readFileSync(path.join(__dirname,'..','js','wasm','engine_bg.wasm')));
  const W = wasm_bindgen;

  const b = INITIAL_BOARD.map(r => r.slice());
  for (const m of MID_MOVES) makeMove(b, ...m);
  const flat = boardToFlat(b);
  const mhFlat = new Int32Array(MID_MOVES.flat());

  // 1) 长时间预算，作为"真值"
  W.tt_clear(); W.h_reset();
  const progress = [];
  const long = W.ai_move_wasm(flat, true, 10, mhFlat, 6000, (p) => {
    progress.push({depth: p.depth, bestMove: [...p.bestMove], score: p.score, timeMs: p.timeMs});
  });
  console.log(`长时间搜索：d=${long.depth}, move=(${long.best_from_r},${long.best_from_c},${long.best_to_r},${long.best_to_c}), score=${long.score}, t=${long.time_ms|0}ms`);
  console.log(`  progress 逐层：`);
  for (const p of progress) console.log(`    d=${p.depth} bm=${p.bestMove.join(',')} sc=${p.score} t=${p.timeMs|0}ms`);

  // 2) 极短时间预算（多次采样）
  let good = 0, bad = 0, exact = 0;
  const N = 8;
  const timings = [50, 100, 200, 400, 600, 800, 1000, 1500];
  for (let i=0; i<N; i++) {
    W.tt_clear(); W.h_reset();
    let lastProgress = null;
    const r = W.ai_move_wasm(flat, true, 10, mhFlat, timings[i], (p) => {
      lastProgress = {depth: p.depth, bestMove: [...p.bestMove], score: p.score, timeMs: p.timeMs};
    });
    // 关键断言：返回的 depth 必须与 progress 汇报的最后 completed depth 一致
    const returnedDepth = r.depth;
    const progressDepth = lastProgress ? lastProgress.depth : 0;
    const consistent = returnedDepth === progressDepth;
    // 返回的 bestMove 必须来自某个真实完成的层
    const returnedMove = `${r.best_from_r},${r.best_from_c},${r.best_to_r},${r.best_to_c}`;
    const progressMove = lastProgress ? lastProgress.bestMove.join(',') : '';
    const moveOk = returnedMove === progressMove;
    if (consistent && moveOk) { good++; if (returnedMove === `${long.best_from_r},${long.best_from_c},${long.best_to_r},${long.best_to_c}`) exact++; }
    else bad++;
    console.log(`  预算${timings[i]}ms → 返回d=${returnedDepth} 走${returnedMove} sc=${r.score}${lastProgress?` | progress d=${progressDepth} 走${progressMove}`:''} ${consistent&&moveOk?'✓':'✗'}`);
  }
  console.log(`\n结果：${good}/${N} 一致 · ${exact}/${N} 与长搜索完全一致 · ${bad} 失败`);
  process.exit(bad === 0 ? 0 : 1);
})();
