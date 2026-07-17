// 算法审计：验证已知搜索路径的正确性
const { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove } = require('./lib/wasm-loader');

(async () => {
  const engine = await loadEngine('current');
  
  // Test 1: 同一局面同深度多次搜索应完全一致（无非确定性）
  console.log('\n[T1] 确定性：同局面同预算 3 次搜索');
  const moves = [[7,7,7,4],[0,1,2,2],[9,7,7,6],[0,7,2,6]];
  const b = cloneBoard(INITIAL_BOARD);
  for (const m of moves) applyMove(b, ...m);
  const flat = boardToFlat(b);
  const mh = new Int32Array(moves.flat());
  const results = [];
  for (let i = 0; i < 3; i++) {
    engine.tt_clear(); engine.h_reset();
    const r = engine.ai_move_wasm(flat, true, 8, mh, 2000);
    results.push({mv:[r.best_from_r,r.best_from_c,r.best_to_r,r.best_to_c].join(','), sc:r.score, d:r.depth, n:r.nodes});
  }
  console.log('  runs:', results);
  const same = results.every(r => r.mv === results[0].mv && r.d === results[0].d);
  console.log('  ', same ? '✓ 确定性一致' : '✗ 非确定！');
  
  // Test 2: 简单 checkmate in 1（AI 必须找到杀棋）
  console.log('\n[T2] Checkmate in 1: 单车照将局面');
  // 构造：红车 (9,4)、红将 (9,4) —— 不行，用另一构造
  // 白方（红）：将 (9,4) 有士象；黑方：将 (0,4) 无士象，红车 (0,0)、红马 (2,3)
  // 简单：红车在 (0,3)，黑将 (0,4) 唯一走法 → 车吃将 (0,3)→(0,4)
  const b2 = Array(10).fill(0).map(_=>Array(9).fill(0));
  b2[9][4] = 'K'; b2[0][4] = 'k';
  b2[0][3] = 'R';  // 红车照将
  b2[1][4] = 'p';  // 黑兵在王前挡住 → 逼黑必走
  // 黑走后红车吃将（照将黑无解）
  // Actually 让 AI 执黑，考察它能否解将
  engine.tt_clear(); engine.h_reset();
  const flat2 = boardToFlat(b2);
  const r2 = engine.ai_move_wasm(flat2, false, 4, new Int32Array(), 500);
  console.log(`  黑方唯一 legal move: ${[r2.best_from_r,r2.best_from_c,r2.best_to_r,r2.best_to_c].join(',')} sc=${r2.score}`);
  
  // Test 3: 完全一致的重复搜索：TT aging 后 best move 不变
  console.log('\n[T3] TT aging 重复搜索一致性');
  engine.tt_clear();
  const b3 = cloneBoard(INITIAL_BOARD);
  const m3 = [[7,7,7,4],[0,1,2,2]];
  for (const m of m3) applyMove(b3, ...m);
  const mh3 = new Int32Array(m3.flat());
  for (let i = 0; i < 5; i++) {
    engine.h_reset();
    const r = engine.ai_move_wasm(boardToFlat(b3), true, 6, mh3, 800);
    console.log(`  round ${i}: mv=${[r.best_from_r,r.best_from_c,r.best_to_r,r.best_to_c].join(',')} sc=${r.score} d=${r.depth}`);
  }
})();
