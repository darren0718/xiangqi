/**
 * 引擎对弈胜率测试。
 * 用法: node tests/gauntlet.js <engineA> <engineB> [games=20] [timeMsPerMove=1000]
 *   engine 名可以是 'current' 或 versions/ 下的归档版本名
 * 每局强制不同开局（前 2 手从 openings 池选，跳过开局库）
 */
const path = require('path');
const { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove, isGameOver } = require('./lib/wasm-loader');

// 8 种红先开局 + 5 种应对 → 交叉出 40 组，重复取 N 组
const RED_OPENERS = [
  [7,7,7,4], [7,1,7,4], [9,1,7,2], [9,7,7,6],
  [6,2,5,2], [6,6,5,6], [6,4,5,4], [9,2,7,4]
];
const BLACK_RESPONSES = [
  [0,1,2,2], [0,7,2,6], [2,1,2,4], [2,7,2,4], [3,4,4,4]
];

async function playOneGame(engineRed, engineBlack, openingRed, openingBlack, timePerMove, maxMoves=140) {
  const board = cloneBoard(INITIAL_BOARD);
  const history = [];
  // 强制开局：红先第 1 手，黑第 1 手，跳过开局库
  applyMove(board, ...openingRed); history.push(openingRed);
  applyMove(board, ...openingBlack); history.push(openingBlack);

  for (let ply=2; ply<maxMoves; ply++) {
    const redTurn = (ply % 2 === 0);
    const engine = redTurn ? engineRed : engineBlack;
    const flat = boardToFlat(board);
    const mhFlat = new Int32Array(history.flat());
    // 用足够深的名义深度 + 时间预算控制
    engine.h_reset();
    const r = engine.ai_move_wasm(flat, redTurn, 6, mhFlat, timePerMove);
    if (!r.found || r.best_from_r < 0) {
      return { winner: redTurn ? 'black' : 'red', reason: 'no-move', plies: ply };
    }
    const mv = [r.best_from_r, r.best_from_c, r.best_to_r, r.best_to_c];
    applyMove(board, ...mv);
    history.push(mv);
    const over = isGameOver(board);
    if (over) return { winner: over.replace('-wins',''), reason: 'king-captured', plies: ply+1 };
  }
  return { winner: 'draw', reason: 'max-moves', plies: maxMoves };
}

async function main() {
  const argv = process.argv.slice(2);
  const engineA = argv[0] || 'current';
  const engineB = argv[1] || 'p0-baseline';
  const gamesTotal = parseInt(argv[2] || '20');
  const timePerMove = parseInt(argv[3] || '1000');

  console.log(`\n===== Gauntlet: ${engineA} vs ${engineB} =====`);
  console.log(`  games=${gamesTotal}, timePerMove=${timePerMove}ms\n`);

  const A = await loadEngine(engineA);
  const B = await loadEngine(engineB);

  let awins=0, bwins=0, draws=0;
  const gamesPerSide = Math.floor(gamesTotal / 2);

  // A 执红 vs B 执黑
  for (let i=0; i<gamesPerSide; i++) {
    const opRed = RED_OPENERS[i % RED_OPENERS.length];
    const opBlack = BLACK_RESPONSES[i % BLACK_RESPONSES.length];
    const t0 = Date.now();
    const res = await playOneGame(A, B, opRed, opBlack, timePerMove);
    const dt = Date.now() - t0;
    if (res.winner === 'red') awins++;
    else if (res.winner === 'black') bwins++;
    else draws++;
    console.log(`  [${i+1}/${gamesPerSide}] A(red) opening=(${opRed.join(',')})/(${opBlack.join(',')}) → ${res.winner} (${res.reason}, ${res.plies}ply, ${(dt/1000).toFixed(1)}s)`);
  }
  // B 执红 vs A 执黑
  for (let i=0; i<gamesPerSide; i++) {
    const opRed = RED_OPENERS[(i+3) % RED_OPENERS.length];
    const opBlack = BLACK_RESPONSES[(i+2) % BLACK_RESPONSES.length];
    const t0 = Date.now();
    const res = await playOneGame(B, A, opRed, opBlack, timePerMove);
    const dt = Date.now() - t0;
    if (res.winner === 'red') bwins++;
    else if (res.winner === 'black') awins++;
    else draws++;
    console.log(`  [${i+1}/${gamesPerSide}] B(red) opening=(${opRed.join(',')})/(${opBlack.join(',')}) → ${res.winner} (${res.reason}, ${res.plies}ply, ${(dt/1000).toFixed(1)}s)`);
  }

  console.log(`\n===== 结果 =====`);
  console.log(`  ${engineA}: ${awins} 胜 / ${draws} 和 / ${bwins} 负`);
  console.log(`  胜率 A: ${((awins + draws*0.5) / gamesTotal * 100).toFixed(1)}%`);
  const score = (awins + draws*0.5) / gamesTotal;
  // Elo 差近似 = -400 * log10(1/score - 1)
  const eloDiff = score > 0 && score < 1 ? -400 * Math.log10(1/score - 1) : (score >= 1 ? 800 : -800);
  console.log(`  Elo 差估计: ${eloDiff.toFixed(0)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
