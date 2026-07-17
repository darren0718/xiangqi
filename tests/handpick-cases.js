/**
 * Regression 局面：抓 3 个用户报告的具体症状
 *   S1: "开局兵五进一" → 初始局面首着不能是 (6,4,5,4)
 *   S2: "开局各种吃兵" → 自对弈前 10 手，我方吃对方兵/卒的次数 ≤ 2
 *   S3: "不出大子" → 自对弈前 10 手，我方大子(R/H/C)累计动子数 ≥ 4
 * 
 * 用法: node tests/handpick-cases.js [engineName=current] [--verbose]
 */
const { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove } = require('./lib/wasm-loader');

function mvStr(mv) { return `(${mv.join(',')})`; }
function mvEq(a, b) { return a && b && a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]&&a[3]===b[3]; }

// 自对弈 N 手，返回历史与终局
async function selfPlay(engine, plies, timeMs, forceOpening) {
  const board = cloneBoard(INITIAL_BOARD);
  const history = [];
  const captures = []; // [ply, redSide, capturedPiece, mv]
  const startPly = forceOpening ? forceOpening.length : 0;
  if (forceOpening) {
    for (const mv of forceOpening) { applyMove(board, ...mv); history.push(mv); }
  }
  for (let ply=startPly; ply<plies; ply++) {
    const redTurn = ply % 2 === 0;
    const flat = boardToFlat(board);
    const mhFlat = new Int32Array(history.flat());
    engine.h_reset();
    const r = engine.ai_move_wasm(flat, redTurn, 6, mhFlat, timeMs);
    if (!r.found) break;
    const mv = [r.best_from_r, r.best_from_c, r.best_to_r, r.best_to_c];
    const captured = board[mv[2]][mv[3]];
    if (captured !== 0) captures.push({ ply, redSide: redTurn, cap: captured, mv });
    applyMove(board, ...mv);
    history.push(mv);
  }
  return { history, board, captures };
}

const CASES = [
  {
    name: 'S1: 初始局面首着不能兵五进一',
    async run(engine, verbose) {
      // 多次采样看是否曾选到 (6,4,5,4)
      const N = 6;
      const moves = [];
      for (let i=0; i<N; i++) {
        engine.tt_clear(); engine.h_reset();
        const flat = boardToFlat(INITIAL_BOARD);
        const r = engine.ai_move_wasm(flat, true, 8, new Int32Array(), 3000);
        moves.push([r.best_from_r, r.best_from_c, r.best_to_r, r.best_to_c]);
      }
      const badCount = moves.filter(m => mvEq(m, [6,4,5,4])).length;
      if (verbose) console.log(`     采样 6 次: ${moves.map(mvStr).join(' ')}`);
      return {
        pass: badCount === 0,
        reason: badCount === 0 ? `无兵五进一` : `${badCount}/${N} 次选择兵五进一`
      };
    }
  },
  {
    name: 'S2: 前 6 手不能出现"炮跨河直吃底卒/兵"',
    async run(engine, verbose) {
      engine.tt_clear(); engine.h_reset();
      const { history } = await selfPlay(engine, 12, 500, null);
      const board = cloneBoard(INITIAL_BOARD);
      let violations = 0; let details = [];
      for (let i=0; i<history.length; i++) {
        const mv = history[i];
        const p = board[mv[0]][mv[1]];
        const captured = board[mv[2]][mv[3]];
        // 判"炮吃底兵/卒"：走的子是炮，被吃的是兵/卒，且吃的目标是对方河底附近底行
        if ((p==='C'||p==='c') && (captured==='p'||captured==='P')) {
          const isCrossRiverCap = (p==='C' && mv[2] <= 3) || (p==='c' && mv[2] >= 6);
          if (isCrossRiverCap) { violations++; details.push(`ply${i} ${p}${mvStr(mv)} ate ${captured}`); }
        }
        applyMove(board, ...mv);
      }
      if (verbose) console.log(`     violations: ${JSON.stringify(details)}`);
      return {
        pass: violations === 0,
        reason: violations === 0 ? '无跨河吃底卒' : `${violations} 次跨河吃底卒: ${details.join('; ')}`
      };
    }
  },
  {
    name: 'S3: 前 12 手每方至少动 3 个不同的大子',
    async run(engine, verbose) {
      engine.tt_clear(); engine.h_reset();
      const { history } = await selfPlay(engine, 12, 500, null);
      const board = cloneBoard(INITIAL_BOARD);
      const redMoved = new Set(), blkMoved = new Set();  // 用 piece 类型+起始位置作 id
      const redPieceOrigin = new Map(), blkPieceOrigin = new Map();
      // 初始化：记录每个大子的起始位置
      for (let r=0;r<10;r++) for (let c=0;c<9;c++) {
        const p = board[r][c];
        if ('RHC'.includes(p)) redPieceOrigin.set(`${r},${c}`, p);
        if ('rhc'.includes(p)) blkPieceOrigin.set(`${r},${c}`, p);
      }
      // 用一个"位置追踪"map：当前位置 → 起始位置
      const trackR = new Map(); for (const k of redPieceOrigin.keys()) trackR.set(k, k);
      const trackB = new Map(); for (const k of blkPieceOrigin.keys()) trackB.set(k, k);
      for (const mv of history) {
        const fk = `${mv[0]},${mv[1]}`;
        const tk = `${mv[2]},${mv[3]}`;
        if (trackR.has(fk)) {
          const origin = trackR.get(fk);
          redMoved.add(origin);
          trackR.delete(fk); trackR.set(tk, origin);
        }
        if (trackB.has(fk)) {
          const origin = trackB.get(fk);
          blkMoved.add(origin);
          trackB.delete(fk); trackB.set(tk, origin);
        }
        // 处理吃子：目标位置的对方子被移走
        if (trackR.has(tk) && !trackR.has(fk)) trackR.delete(tk);
        if (trackB.has(tk) && !trackB.has(fk)) trackB.delete(tk);
        applyMove(board, ...mv);
      }
      if (verbose) console.log(`     红动过大子: [${[...redMoved].join('|')}]  黑动过大子: [${[...blkMoved].join('|')}]`);
      return {
        pass: redMoved.size >= 3 && blkMoved.size >= 3,
        reason: `红方动过 ${redMoved.size} 个不同大子, 黑方动过 ${blkMoved.size} 个不同大子`
      };
    }
  },
];

async function main() {
  const argv = process.argv.slice(2);
  const engineName = argv.find(a => !a.startsWith('--')) || 'current';
  const verbose = argv.includes('--verbose');
  const engine = await loadEngine(engineName);
  console.log(`\n===== Regression Cases: ${engineName} =====\n`);
  let pass=0, fail=0;
  for (const cs of CASES) {
    const res = await cs.run(engine, verbose);
    console.log(`  ${res.pass?'✓':'✗'} ${cs.name}`);
    console.log(`      → ${res.reason}`);
    if (res.pass) pass++; else fail++;
  }
  console.log(`\n===== 结果: ${pass}/${pass+fail} 通过 =====\n`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
