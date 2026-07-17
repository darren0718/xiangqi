// 检验：红架空头炮的经典局面，AI 执黑该如何反应？
const { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove } = require('./lib/wasm-loader');

(async () => {
  const engine = await loadEngine('current');
  // 场景 1：红中炮 vs 黑无中卒 → 空头炮成立
  // 红走 7,7-7,4（中炮），黑走 3,0-4,0（挺 9 卒）—— 中卒不动
  {
    const b = cloneBoard(INITIAL_BOARD);
    const moves = [[7,7,7,4],[3,0,4,0]];
    for (const m of moves) applyMove(b, ...m);
    // 现在轮到红方，红能继续架空头炮：把中兵挺出（6,4-5,4）
    // 让 AI 执红看它会不会打空头
    engine.h_reset();
    const flat = boardToFlat(b);
    const r = engine.ai_move_wasm(flat, true, 6, new Int32Array(moves.flat()), 3000);
    console.log('场景1: 黑放弃中路，红先手，AI 执红');
    console.log(`  → 走 (${r.best_from_r},${r.best_from_c},${r.best_to_r},${r.best_to_c}) d=${r.depth} sc=${r.score}`);
  }
  
  // 场景 2：红已架空头炮 + 中兵挺出（空头炮 dead-on 状态）
  // 序列：7,7-7,4；3,6-4,6；6,4-5,4；3,0-4,0；轮到红
  // 此时红 5,4 有兵，若挺 5,4-4,4 就是空头炮真正打上
  {
    const b = cloneBoard(INITIAL_BOARD);
    const moves = [[7,7,7,4],[3,6,4,6],[6,4,5,4],[3,0,4,0]];
    for (const m of moves) applyMove(b, ...m);
    engine.h_reset();
    const flat = boardToFlat(b);
    const r = engine.ai_move_wasm(flat, true, 6, new Int32Array(moves.flat()), 3000);
    console.log('\n场景2: 红中炮+中兵进 1 步，黑无防御，AI 执红');
    console.log(`  → 走 (${r.best_from_r},${r.best_from_c},${r.best_to_r},${r.best_to_c}) d=${r.depth} sc=${r.score}`);
  }
  
  // 场景 3：反过来，AI 执黑面对红空头炮威胁
  // 序列：7,7-7,4；0,7-2,6（黑马屏风）；6,4-5,4；轮到黑（如果不防守，红会 5,4-4,4 冲兵）
  {
    const b = cloneBoard(INITIAL_BOARD);
    const moves = [[7,7,7,4],[0,7,2,6],[6,4,5,4]];
    for (const m of moves) applyMove(b, ...m);
    engine.h_reset();
    const flat = boardToFlat(b);
    const r = engine.ai_move_wasm(flat, false, 6, new Int32Array(moves.flat()), 3000);
    console.log('\n场景3: 红架中炮 + 中兵进 1，黑防守，AI 执黑');
    console.log(`  → 走 (${r.best_from_r},${r.best_from_c},${r.best_to_r},${r.best_to_c}) d=${r.depth} sc=${r.score}`);
    // 好走法：3,4-4,4（挺中卒对垒）、0,1-2,2（跳左马）、2,7-2,4（黑架炮反击中路）
    const bm = [r.best_from_r,r.best_from_c,r.best_to_r,r.best_to_c].join(',');
    const good = ['3,4,4,4','0,1,2,2','2,7,2,4','2,1,2,4','0,3,1,4'].includes(bm);
    console.log(`  ${good ? '✓' : '✗'} ${good ? '选择了防御性走法' : '未选防御性走法'}`);
  }
})();
