const { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove } = require('./lib/wasm-loader');

(async () => {
  const engine = await loadEngine('current');
  
  // 场景：现有一个中盘中 AI 有机会冲车吃底象或卡象眼
  // 走法：中炮 + 屏风马 + 一些交换 → 红有过河车机会
  const moves = [[7,7,7,4],[0,1,2,2],[9,7,7,6],[0,7,2,6],[9,0,9,1],[3,6,4,6],[9,1,4,1]];
  const b = cloneBoard(INITIAL_BOARD);
  for (const m of moves) applyMove(b, ...m);
  console.log('局面：中炮+屏风马，红车已巡河到 (4,1)。轮到黑走。');
  engine.tt_clear(); engine.h_reset();
  const flat = boardToFlat(b);
  const mh = new Int32Array(moves.flat());
  const r = engine.ai_move_wasm(flat, false, 8, mh, 4000);
  const mv = [r.best_from_r,r.best_from_c,r.best_to_r,r.best_to_c];
  console.log(`  AI 执黑 → ${b[mv[0]][mv[1]]} (${mv.join(',')}) sc=${r.score} d=${r.depth}`);
  
  // 现在让 AI 执红看会不会继续把车冲过河
  const moves2 = [...moves,[2,7,2,4]]; // 假设黑架炮
  const b2 = cloneBoard(INITIAL_BOARD);
  for (const m of moves2) applyMove(b2, ...m);
  engine.tt_clear(); engine.h_reset();
  const r2 = engine.ai_move_wasm(boardToFlat(b2), true, 8, new Int32Array(moves2.flat()), 4000);
  const mv2 = [r2.best_from_r,r2.best_from_c,r2.best_to_r,r2.best_to_c];
  console.log(`\n黑架炮后，AI 执红 → ${b2[mv2[0]][mv2[1]]} (${mv2.join(',')}) sc=${r2.score} d=${r2.depth}`);
  // 看 PV
  if (r2.pv && r2.pv.length > 0) {
    const pv = [];
    for (let i = 0; i+3 < r2.pv.length; i+=4) pv.push(`${r2.pv[i]},${r2.pv[i+1]},${r2.pv[i+2]},${r2.pv[i+3]}`);
    console.log(`  PV: ${pv.slice(0,5).join(' → ')}`);
  }
})();
