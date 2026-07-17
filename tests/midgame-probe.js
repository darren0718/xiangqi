// 中局多局面探测：AI 在真实中局能否找到明显好手
const { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove } = require('./lib/wasm-loader');

const CASES = [
  {
    name: '中局1 · 已有炮马进攻位',
    setup: 'p',
    moves: [[7,7,7,4],[0,1,2,2],[9,7,7,6],[0,7,2,6],[6,4,5,4],[3,4,4,4],[7,4,4,4],[2,2,4,3],[9,1,7,2],[3,6,4,6]],
    aiRed: true,
    hint: '红有中炮 + 双马已跳出，好手可能是 9,0-9,1 车出动或 4,4-4,3 炮吃卒'
  },
  {
    name: '中局2 · AI 应该出动被卡的马',
    moves: [[7,7,7,4],[0,1,2,2],[9,7,7,6],[0,7,2,6],[9,0,9,1],[3,6,4,6],[9,1,4,1],[2,7,2,4]],
    aiRed: true,
    hint: '红右马未动（9,1 已挪成车了），应看后续马炮配合'
  },
  {
    name: '中局3 · 车马配合杀势',
    // 需构造：黑残缺，红车已到底线，红马挂角
    // 手动构造局面比走法更清楚，用 FEN 类似的方式
    fen: 'special',
    aiRed: true,
  }
];

(async () => {
  const engine = await loadEngine('current');
  for (const c of CASES) {
    if (c.fen) continue;
    const b = cloneBoard(INITIAL_BOARD);
    for (const m of c.moves) applyMove(b, ...m);
    // 打印当前棋盘
    console.log('\n=== ' + c.name + ' ===');
    console.log('AI: ' + (c.aiRed?'红':'黑') + '  hist='+c.moves.length+' 手');
    console.log('提示: ' + c.hint);
    // 展示棋盘
    const s = b.map(row => row.map(p => p === 0 ? '·' : p).join(' ')).join('\n');
    console.log(s);
    
    engine.h_reset();
    const flat = boardToFlat(b);
    const mh = new Int32Array(c.moves.flat());
    const t0 = Date.now();
    const r = engine.ai_move_wasm(flat, c.aiRed, 8, mh, 5000);
    const dt = Date.now() - t0;
    const mv = [r.best_from_r,r.best_from_c,r.best_to_r,r.best_to_c];
    const piece = b[mv[0]][mv[1]];
    console.log(`  AI 走: ${piece} (${mv.join(',')}) sc=${r.score} d=${r.depth} nodes=${r.nodes} t=${dt}ms`);
    // 也看下 PV
    if (r.pv && r.pv.length > 0) {
      const pv = [];
      for (let i = 0; i+3 < r.pv.length; i+=4) pv.push(`(${r.pv[i]},${r.pv[i+1]},${r.pv[i+2]},${r.pv[i+3]})`);
      console.log(`  PV: ${pv.slice(0,6).join(' → ')}`);
    }
  }
})();
