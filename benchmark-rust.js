/**
 * Rust/wasm 引擎基准测试。用与 benchmark.js 完全相同的 5 局面 + depth。
 * 运行: node benchmark-rust.js
 */
const fs = require('fs');
const path = require('path');

// 载入 wasm
const wasmSrc = fs.readFileSync(path.join(__dirname,'js/wasm/engine.js'),'utf8')
  .replace('let wasm_bindgen =', 'globalThis.wasm_bindgen =');
eval(wasmSrc);

// 载入 JS 规则（仅用于本地演算走法应用到初始局面，构造测试局面）
let chessCode = fs.readFileSync(path.join(__dirname, 'js/chess.js'), 'utf8');
chessCode = chessCode.replace(/'use strict';?/g, '');
new Function(chessCode + '\nglobalThis.INITIAL_BOARD=INITIAL_BOARD; globalThis.makeMove=makeMove;')();

function applyMoves(moves) {
  const b = INITIAL_BOARD.map(r => r.slice());
  for (const [fr, fc, tr, tc] of moves) makeMove(b, fr, fc, tr, tc);
  return b;
}
function boardToFlat(board) {
  const b = Buffer.alloc(90);
  for (let r=0; r<10; r++) for (let c=0; c<9; c++) {
    const p = board[r][c]; b[r*9+c] = p === 0 ? 0 : p.charCodeAt(0);
  }
  return b;
}

// 与 benchmark.js 完全相同的 5 局面
const TESTS = [
  { name: '中炮对屏风马(4步)', moves: [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6]], redToMove: true, depth: 4 },
  { name: '中局复杂(12步)', moves: [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6],[6,4,5,4],[3,4,4,4],[7,4,6,4],[2,2,4,3],[9,2,8,4],[2,1,2,4],[6,2,5,2],[0,4,0,3]], redToMove: true, depth: 4 },
  { name: '顺炮横车对直车(6步)', moves: [[7,7,7,4],[2,1,2,4],[9,0,8,0],[0,0,1,0],[8,0,8,4],[0,7,2,6]], redToMove: true, depth: 4 },
  { name: '仙人指路对卒底炮(5步)', moves: [[6,4,5,4],[2,1,2,4],[7,1,7,4],[0,6,2,5],[9,1,7,2]], redToMove: false, depth: 4 },
  { name: '中炮屏风马(d5深度)', moves: [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6],[6,4,5,4],[3,4,4,4]], redToMove: true, depth: 5 },
];

const version = process.argv[2] || 'rust-wasm';

(async () => {
  await wasm_bindgen(fs.readFileSync(path.join(__dirname,'js/wasm/engine_bg.wasm')));
  const W = wasm_bindgen;

  console.log('='.repeat(72));
  console.log(`  中国象棋引擎 Benchmark (${version})`);
  console.log('='.repeat(72)); console.log();

  const results = [];
  for (const test of TESTS) {
    const board = applyMoves(test.moves);
    const flat = boardToFlat(board);
    const mhFlat = new Int32Array(test.moves.flat());
    W.tt_clear(); W.h_reset();
    process.stdout.write(`  测试: ${test.name} ... `);
    const t0 = Date.now();
    const r = W.ai_move_wasm(flat, test.redToMove, test.depth, mhFlat, 0);
    const elapsed = Date.now() - t0;

    const nodes = r.nodes;
    const nps = elapsed > 0 ? Math.round(nodes / (elapsed / 1000)) : 0;
    const bm = r.found ? [r.best_from_r, r.best_from_c, r.best_to_r, r.best_to_c] : null;
    results.push({
      name: test.name, depth: test.depth,
      nodes, timeMs: elapsed, nps,
      score: r.score, bestMove: bm, actualDepth: r.depth,
    });
    console.log(`${elapsed}ms | ${nodes.toLocaleString()} nodes | ${nps.toLocaleString()} NPS | d=${r.depth} | score=${r.score} (${bm ? bm.join(',') : ''})`);
  }

  console.log();
  console.log('-'.repeat(72));
  console.log(`  ${'测试'.padEnd(28)} ${'深'.padStart(3)} ${'节点数'.padStart(12)} ${'时间ms'.padStart(8)} ${'NPS'.padStart(12)} ${'评分'.padStart(7)}`);
  console.log('  ' + '-'.repeat(70));
  for (const r of results) {
    console.log(`  ${r.name.padEnd(28)} ${String(r.actualDepth).padStart(3)} ${String(r.nodes).padStart(12)} ${String(r.timeMs).padStart(8)} ${String(r.nps).padStart(12)} ${String(r.score).padStart(7)}`);
  }
  const totalNodes = results.reduce((s,r)=>s+r.nodes,0);
  const totalTime = results.reduce((s,r)=>s+r.timeMs,0);
  const totalNPS = totalTime > 0 ? Math.round(totalNodes / (totalTime/1000)) : 0;
  console.log('  ' + '-'.repeat(70));
  console.log(`  ${"合计".padEnd(28)} ${"".padStart(3)} ${String(totalNodes).padStart(12)} ${String(totalTime).padStart(8)} ${String(totalNPS).padStart(12)}`);

  const outFile = 'benchmark-rust.json';
  fs.writeFileSync(path.join(__dirname, outFile), JSON.stringify({
    timestamp: new Date().toISOString(), version, results,
    totals: { nodes: totalNodes, timeMs: totalTime, nps: totalNPS },
  }, null, 2));
  console.log(`\n  ✅ 结果已保存到 ${outFile}\n`);
})().catch(e => { console.error(e); process.exit(1); });
