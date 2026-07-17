/**
 * 象棋引擎基准测试
 * 运行: node benchmark.js
 */
const fs = require('fs');
const path = require('path');

let chessCode = fs.readFileSync(path.join(__dirname, 'js/chess.js'), 'utf8');
let evalCode = fs.readFileSync(path.join(__dirname, 'js/evaluate.js'), 'utf8');
let workerCode = fs.readFileSync(path.join(__dirname, 'js/engine-worker.js'), 'utf8');
workerCode = workerCode.replace(/importScripts\([^)]*\);?/g, '');
workerCode = workerCode.replace(/self\.onmessage[\s\S]*$/m, '');
workerCode = workerCode.replace(/'use strict';?/g, '');
chessCode = chessCode.replace(/'use strict';?/g, '');

const code = chessCode + '\n' + evalCode + '\n' + workerCode + `
globalThis.cloneBoard = cloneBoard;
globalThis.makeMove = makeMove;
globalThis.unmakeMove = unmakeMove;
globalThis.INITIAL_BOARD = INITIAL_BOARD;
globalThis.isRed = isRed;
globalThis.isBlack = isBlack;
globalThis.ROWS = ROWS; globalThis.COLS = COLS;
globalThis.findKing = findKing;
globalThis.inCheck = inCheck;
globalThis.allLegalMoves = allLegalMoves;
globalThis.isLegalMove = isLegalMove;
globalThis.pseudoMoves = pseudoMoves;
globalThis.gameStatus = gameStatus;
globalThis.aiMove = aiMove;
globalThis.ttClear = ttClear;
globalThis.hReset = hReset;
globalThis.searchStats = searchStats;
globalThis.boardHash = boardHash;
globalThis.evaluate = evaluate;
globalThis.bookMove = bookMove;
`;

new Function(code)();

function applyMoves(moves) {
  const b = INITIAL_BOARD.map(r => r.slice());
  for (const [fr, fc, tr, tc] of moves) {
    makeMove(b, fr, fc, tr, tc);
  }
  return b;
}

// 测试局面：都有足够长的历史（>=4步）让开局库不触发，真正搜索
const TESTS = [
  {
    name: '中炮对屏风马(4步)',
    moves: [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6]],
    mh: [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6]],
    redToMove: true, depth: 4,
  },
  {
    name: '中局复杂(12步)',
    moves: [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6],[6,4,5,4],[3,4,4,4],[7,4,6,4],[2,2,4,3],[9,2,8,4],[2,1,2,4],[6,2,5,2],[0,4,0,3]],
    mh: [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6],[6,4,5,4],[3,4,4,4],[7,4,6,4],[2,2,4,3],[9,2,8,4],[2,1,2,4],[6,2,5,2],[0,4,0,3]],
    redToMove: true, depth: 4,
  },
  {
    name: '顺炮横车对直车(6步)',
    moves: [[7,7,7,4],[2,1,2,4],[9,0,8,0],[0,0,1,0],[8,0,8,4],[0,7,2,6]],
    mh: [[7,7,7,4],[2,1,2,4],[9,0,8,0],[0,0,1,0],[8,0,8,4],[0,7,2,6]],
    redToMove: true, depth: 4,
  },
  {
    name: '仙人指路对卒底炮(5步)',
    moves: [[6,4,5,4],[2,1,2,4],[7,1,7,4],[0,6,2,5],[9,1,7,2]],
    mh: [[6,4,5,4],[2,1,2,4],[7,1,7,4],[0,6,2,5],[9,1,7,2]],
    redToMove: false, depth: 4,
  },
  {
    name: '中炮屏风马(d5深度)',
    moves: [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6],[6,4,5,4],[3,4,4,4]],
    mh: [[7,7,7,4],[0,1,2,2],[9,1,7,2],[0,7,2,6],[6,4,5,4],[3,4,4,4]],
    redToMove: true, depth: 5,
  },
];

const version = process.argv[2] || 'current';
console.log('='.repeat(72));
console.log(`  中国象棋引擎 Benchmark (${version})`);
console.log('='.repeat(72));
console.log();

const results = [];

for (const test of TESTS) {
  const board = applyMoves(test.moves);
  ttClear();
  hReset();
  searchStats.nodes = 0;

  process.stdout.write(`  测试: ${test.name} ... `);

  const t0 = Date.now();
  const result = aiMove(board, test.redToMove, test.depth, null, test.mh);
  const elapsed = Date.now() - t0;

  const nodes = searchStats.nodes;
  const nps = elapsed > 0 ? Math.round(nodes / (elapsed / 1000)) : 0;

  results.push({
    name: test.name,
    depth: test.depth,
    nodes, timeMs: elapsed, nps,
    score: result ? result.score : null,
    bestMove: result ? result.bestMove : null,
    actualDepth: result ? result.depth : 0,
  });

  const bm = result && result.bestMove ? `(${result.bestMove.join(',')})` : '';
  process.stdout.write(`${elapsed}ms | ${nodes.toLocaleString()} nodes | ${nps.toLocaleString()} NPS | d=${result?result.depth:0} | score=${result?result.score:'null'} ${bm}\n`);
}

console.log();
console.log('-'.repeat(72));
console.log('  汇总');
console.log('-'.repeat(72));
console.log();
console.log(`  ${'测试'.padEnd(28)} ${'深'.padStart(3)} ${'节点数'.padStart(12)} ${'时间ms'.padStart(8)} ${'NPS'.padStart(12)} ${'评分'.padStart(7)}`);
console.log('  ' + '-'.repeat(70));
for (const r of results) {
  console.log(`  ${r.name.padEnd(28)} ${String(r.actualDepth).padStart(3)} ${String(r.nodes).padStart(12)} ${String(r.timeMs).padStart(8)} ${String(r.nps).padStart(12)} ${String(r.score).padStart(7)}`);
}

const totalNodes = results.reduce((s, r) => s + r.nodes, 0);
const totalTime = results.reduce((s, r) => s + r.timeMs, 0);
const totalNPS = totalTime > 0 ? Math.round(totalNodes / (totalTime / 1000)) : 0;
console.log('  ' + '-'.repeat(70));
console.log(`  ${"合计".padEnd(28)} ${"".padStart(3)} ${String(totalNodes).padStart(12)} ${String(totalTime).padStart(8)} ${String(totalNPS).padStart(12)}`);

const outFile = version === 'baseline' ? 'benchmark-baseline.json' : 'benchmark-results.json';
fs.writeFileSync(path.join(__dirname, outFile), JSON.stringify({
  timestamp: new Date().toISOString(),
  version,
  results,
  totals: { nodes: totalNodes, timeMs: totalTime, nps: totalNPS },
}, null, 2));

console.log();
console.log(`  ✅ 结果已保存到 ${outFile}`);
console.log();
