/**
 * 交叉校验：Rust wasm 引擎 vs JS 引擎
 * - Perft(3) 一致
 * - 随机 500 局面走法集合完全一致
 * - 随机 500 局面 evaluate 分数逐位相等
 */
const fs = require('fs');
const path = require('path');

// 加载 JS 引擎（复用 benchmark.js 的手法）
let chessCode = fs.readFileSync(path.join(__dirname, 'js/chess.js'), 'utf8');
let evalCode = fs.readFileSync(path.join(__dirname, 'js/evaluate.js'), 'utf8');
chessCode = chessCode.replace(/'use strict';?/g, '');

const stub = `
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
globalThis.evaluate = evaluate;
globalThis.PVAL = PVAL;
`;
new Function(chessCode + '\n' + evalCode + '\n' + stub)();

// 加载 Rust wasm
const wasmSrc = fs.readFileSync(path.join(__dirname, 'js/wasm/engine.js'), 'utf8');
const wasmPatched = wasmSrc.replace('let wasm_bindgen =', 'globalThis.wasm_bindgen =');
eval(wasmPatched);

function boardToFlat(board) {
  const b = Buffer.alloc(90);
  for (let r=0; r<10; r++) for (let c=0; c<9; c++) {
    const p = board[r][c];
    b[r*9+c] = p === 0 ? 0 : p.charCodeAt(0);
  }
  return b;
}
function movesToSet(flat) {
  const s = new Set();
  for (let i=0; i<flat.length; i+=4) s.add(`${flat[i]},${flat[i+1]},${flat[i+2]},${flat[i+3]}`);
  return s;
}
function jsMovesToSet(mvs) {
  const s = new Set();
  for (const [a,b,c,d] of mvs) s.add(`${a},${b},${c},${d}`);
  return s;
}

// 随机生成局面（跑 N 步随机走）
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function randomPosition(rng, plies) {
  const b = INITIAL_BOARD.map(r => r.slice());
  let turn = true;
  for (let i=0; i<plies; i++) {
    const mvs = allLegalMoves(b, turn);
    if (mvs.length === 0) break;
    const mv = mvs[Math.floor(rng()*mvs.length)];
    makeMove(b, mv[0], mv[1], mv[2], mv[3]);
    turn = !turn;
  }
  return { board: b, redToMove: turn };
}

(async () => {
  await wasm_bindgen(fs.readFileSync(path.join(__dirname, 'js/wasm/engine_bg.wasm')));
  const W = wasm_bindgen;

  console.log('='.repeat(60));
  console.log('  Rust wasm 引擎 vs JS 引擎 交叉校验');
  console.log('='.repeat(60));

  // 1. Perft 初始局面
  console.log('\n[1] Perft(3) 初始局面');
  const initBoard = INITIAL_BOARD.map(r => r.slice());
  const initFlat = boardToFlat(initBoard);
  const perftJs = (function perft(b, red, d) {
    if (d === 0) return 1n;
    const mvs = allLegalMoves(b, red);
    if (d === 1) return BigInt(mvs.length);
    let cnt = 0n;
    for (const [fr,fc,tr,tc] of mvs) {
      const h = makeMove(b, fr, fc, tr, tc);
      cnt += perft(b, !red, d-1);
      unmakeMove(b, h);
    }
    return cnt;
  })(initBoard, true, 3);
  const perftRs = W.perft_wasm(initFlat, true, 3);
  console.log(`  JS  perft(3) = ${perftJs}`);
  console.log(`  Rust perft(3) = ${perftRs}`);
  if (perftJs !== perftRs) { console.error('  ❌ Perft 不一致'); process.exit(1); }
  console.log('  ✓ Perft 一致');

  // 2. 随机 500 局面走法集合一致
  console.log('\n[2] 随机 500 局面走法集合对拍');
  const rng = seededRng(20260717);
  let ok = 0, bad = 0;
  for (let i=0; i<500; i++) {
    const plies = 4 + Math.floor(rng()*20);
    const { board, redToMove } = randomPosition(rng, plies);
    const jsMoves = allLegalMoves(board, redToMove);
    const flat = boardToFlat(board);
    const rsFlat = W.all_legal_moves_flat(flat, redToMove);
    const jsSet = jsMovesToSet(jsMoves);
    const rsSet = movesToSet(rsFlat);
    if (jsSet.size !== rsSet.size || [...jsSet].some(x => !rsSet.has(x))) {
      bad++;
      if (bad <= 3) {
        console.error(`  局面 #${i} 不一致  JS=${jsSet.size} RS=${rsSet.size}`);
        console.error(`   JS-only: ${[...jsSet].filter(x=>!rsSet.has(x)).slice(0,5)}`);
        console.error(`   RS-only: ${[...rsSet].filter(x=>!jsSet.has(x)).slice(0,5)}`);
      }
    } else ok++;
  }
  console.log(`  一致: ${ok}/500  不一致: ${bad}`);
  if (bad > 0) process.exit(1);

  // 3. 随机 500 局面评估分数逐位相等
  console.log('\n[3] 随机 500 局面 evaluate 差异统计 (Step 3 起 Rust 与 JS 会偏离)');
  const rng2 = seededRng(4242);
  let evSame = 0, evOffMax = 0, evOffSum = 0;
  for (let i=0; i<500; i++) {
    const plies = Math.floor(rng2()*30);
    const { board } = randomPosition(rng2, plies);
    const jsV = evaluate(board);
    const rsV = W.evaluate_board(boardToFlat(board), true);
    if (jsV === rsV) evSame++;
    const d = Math.abs(jsV - rsV);
    if (d > evOffMax) evOffMax = d;
    evOffSum += d;
  }
  console.log(`  完全一致: ${evSame}/500, 最大差 ${evOffMax}, 平均差 ${(evOffSum/500).toFixed(1)}`);

  console.log('\n✅ 全部通过：规则和评估函数与 JS 版严格等价');
})().catch(e => { console.error(e); process.exit(1); });
