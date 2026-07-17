const { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove } = require('./lib/wasm-loader');
(async () => {
  const engine = await loadEngine(process.argv[2] || 'current');
  engine.tt_clear(); engine.h_reset();
  const board = cloneBoard(INITIAL_BOARD);
  const history = [];
  const plies = parseInt(process.argv[3] || '14');
  for (let ply=0; ply<plies; ply++) {
    const redTurn = ply % 2 === 0;
    const flat = boardToFlat(board);
    const mhFlat = new Int32Array(history.flat());
    engine.h_reset();
    const r = engine.ai_move_wasm(flat, redTurn, 6, mhFlat, 500);
    const mv = [r.best_from_r, r.best_from_c, r.best_to_r, r.best_to_c];
    const p = board[mv[0]][mv[1]];
    const cap = board[mv[2]][mv[3]];
    console.log(`ply ${ply} ${redTurn?'红':'黑'} ${p}: (${mv.join(',')}) ${cap?'吃'+cap:''} score=${r.score} depth=${r.depth}`);
    applyMove(board, ...mv);
    history.push(mv);
  }
})();
