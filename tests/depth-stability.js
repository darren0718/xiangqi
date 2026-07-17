// 深度递增：观察每一层的 best move 和 score
const { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove } = require('./lib/wasm-loader');

(async () => {
  const engine = await loadEngine('current');
  const b = cloneBoard(INITIAL_BOARD);
  const moves = [[7,7,7,4],[0,1,2,2],[9,7,7,6],[0,7,2,6],[6,4,5,4],[3,4,4,4],[7,4,4,4],[2,2,4,3]];
  for (const m of moves) applyMove(b, ...m);
  const flat = boardToFlat(b);
  const mh = new Int32Array(moves.flat());
  
  console.log('中局局面（8 手 中炮兑马），逐层观察 AI:');
  for (let d = 1; d <= 12; d++) {
    engine.tt_clear(); engine.h_reset();
    const t0 = Date.now();
    const r = engine.ai_move_wasm(flat, true, d, mh, 15000);
    const dt = Date.now() - t0;
    const mv = [r.best_from_r,r.best_from_c,r.best_to_r,r.best_to_c].join(',');
    console.log(`  d=${d} → ${mv} sc=${r.score} nodes=${r.nodes.toLocaleString()} t=${dt}ms`);
  }
})();
