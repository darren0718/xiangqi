// 简化 gauntlet：单一循环，engine A 交替执红/黑
const { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove, isGameOver } = require('./lib/wasm-loader');

const RED_OPENERS = [[7,7,7,4],[7,1,7,4],[9,1,7,2],[9,7,7,6],[6,6,5,6],[9,2,7,4]];
const BLACK_RESPONSES = [[0,1,2,2],[0,7,2,6],[2,1,2,4],[2,7,2,4]];

async function playOneGame(engineRed, engineBlack, openingRed, openingBlack, timePerMove, maxMoves=120) {
  const board = cloneBoard(INITIAL_BOARD);
  const history = [];
  applyMove(board, ...openingRed); history.push(openingRed);
  applyMove(board, ...openingBlack); history.push(openingBlack);
  for (let ply=2; ply<maxMoves; ply++) {
    const redTurn = (ply % 2 === 0);
    const engine = redTurn ? engineRed : engineBlack;
    const flat = boardToFlat(board);
    const mhFlat = new Int32Array(history.flat());
    engine.h_reset();
    const r = engine.ai_move_wasm(flat, redTurn, 6, mhFlat, timePerMove);
    if (!r.found || r.best_from_r < 0) return { winner: redTurn?'black':'red', reason:'no-move', plies: ply };
    const mv = [r.best_from_r, r.best_from_c, r.best_to_r, r.best_to_c];
    applyMove(board, ...mv); history.push(mv);
    const over = isGameOver(board);
    if (over) return { winner: over.replace('-wins',''), reason:'king-cap', plies: ply+1 };
  }
  return { winner: 'draw', reason:'max', plies: maxMoves };
}

(async () => {
  const N = parseInt(process.argv[2] || '10');
  const timePerMove = parseInt(process.argv[3] || '400');
  console.log(`\n===== current vs v4-baseline · ${N} 局 · ${timePerMove}ms/步 =====\n`);
  const A = await loadEngine('current');
  const B = await loadEngine('v4-baseline');
  let awins=0, bwins=0, draws=0;
  for (let i=0; i<N; i++) {
    const opR = RED_OPENERS[i % RED_OPENERS.length];
    const opB = BLACK_RESPONSES[i % BLACK_RESPONSES.length];
    const aIsRed = i % 2 === 0;
    const t0 = Date.now();
    const res = await playOneGame(aIsRed?A:B, aIsRed?B:A, opR, opB, timePerMove);
    const dt = Date.now() - t0;
    let awon;
    if (res.winner === 'draw') { draws++; awon = 'draw'; }
    else if ((res.winner === 'red') === aIsRed) { awins++; awon = 'A胜'; }
    else { bwins++; awon = 'B胜'; }
    console.log(`  [${i+1}/${N}] A(${aIsRed?'红':'黑'}) op=${opR.join(',')}/${opB.join(',')} → ${awon} (${res.reason},${res.plies}p,${(dt/1000).toFixed(1)}s)`);
  }
  console.log(`\n结果: A=${awins}胜 ${draws}和 ${bwins}负`);
  const score = (awins + draws*0.5) / N;
  const elo = score>0&&score<1 ? -400*Math.log10(1/score-1) : (score>=1?800:-800);
  console.log(`胜率: ${(score*100).toFixed(1)}%  Elo 差估计: ${elo.toFixed(0)}`);
})();
