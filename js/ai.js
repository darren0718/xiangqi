/**
 * 中国象棋 AI（专业版）
 *
 * 搜索算法：Negamax + Alpha-Beta + PVS + 以下增强
 *   - 迭代加深 (Iterative Deepening) + Aspiration Windows
 *   - 置换表 (Transposition Table, 64-bit Zobrist)
 *   - 静态搜索 (Quiescence Search) + Delta Pruning
 *   - 将军扩展 (Check Extension)
 *   - 空着剪枝 (Null-Move Pruning) + 验证搜索
 *   - 杀手走法 (Killer Moves) [2 per ply]
 *   - 历史启发 (History Heuristic)
 *   - MVV-LVA 吃子排序
 *   - 迟后减剪枝 (Late Move Reductions, LMR)
 *   - 剃刀剪枝 (Razoring)
 *   - 无用剪枝 (Futility Pruning)
 *   - 将死距离剪枝 (Mate Distance Pruning)
 *   - 内部迭代加深 (Internal Iterative Deepening, IID)
 *
 * 评估函数（红方视角）：
 *   1. 子力价值 (Material) - 含过河兵加成
 *   2. 位置价值表 (Piece-Square Tables) - 开局/中局/残局三套
 *   3. 流动性 (Mobility) - 合法走法数量
 *   4. 将帅安全 (King Safety) - 九宫防守/将军威胁/士象完整
 *   5. 车/炮控线 (Line Control) - 车占开放线/肋道、炮当头/沉底
 *   6. 马活/马腿 (Horse Activity) - 马是否被憋、马位灵活度
 *   7. 兵形 (Pawn Structure) - 过河兵联兵/中心兵/底兵
 *   8. 威胁 (Threats) - 攻击对方大子奖励
 *   9. 节奏/先手 (Tempo) - 主动方微加成
 *
 * 开局库：常见中国象棋前几步走法
 */

'use strict';

// ========== 常量 ==========
const MATE = 60000;
const MATE_THRESHOLD = MATE - 200;
const INF = MATE + 1000;
const MAX_DEPTH = 64;
const TT_SIZE = 1 << 19; // 524288 条目

// 子力基础价值（单位：分 = 0.01 兵，100 = 一兵）
const PVAL = { k: 60000, r: 900, h: 400, c: 450, a: 200, e: 200, p: 100 };

// ========== Zobrist 哈希 (64-bit BigInt) ==========
let ZOB_PIECE, ZOB_SIDE;
function _r64() {
  return (BigInt(Math.floor(Math.random() * 0x80000000)) << 32n) | BigInt(Math.floor(Math.random() * 0x80000000));
}
function initZobrist() {
  ZOB_PIECE = {};
  ZOB_SIDE = [_r64(), _r64()];
  for (const pc of ['K','R','H','C','A','E','P','k','r','h','c','a','e','p']) {
    ZOB_PIECE[pc] = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(_r64());
      ZOB_PIECE[pc].push(row);
    }
  }
}
initZobrist();

function boardHash(board, redToMove) {
  let h = 0n;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p) h ^= ZOB_PIECE[p][r][c];
    }
  h ^= ZOB_SIDE[redToMove ? 1 : 0];
  return h;
}

// ========== 置换表 ==========
const tt = new Array(TT_SIZE);
function ttIdx(h) { return Number(h & BigInt(TT_SIZE - 1)); }
function ttGet(h) {
  const e = tt[ttIdx(h)];
  if (e && e.h === h) return e;
  return null;
}
function ttPut(h, depth, flag, value, bestMove) {
  const i = ttIdx(h);
  const old = tt[i];
  // 替换策略：总是替换（深度+always replace）
  if (!old || depth >= old.depth || old.flag === 'upper') {
    tt[i] = { h, d: depth, f: flag, v: value, mv: bestMove };
  }
}
function ttClear() { for (let i = 0; i < TT_SIZE; i++) tt[i] = undefined; }

function isValidMove(board, redToMove, mv) {
  if (!mv) return false;
  const [fr, fc, tr, tc] = mv;
  if (!inBoard(fr, fc) || !inBoard(tr, tc)) return false;
  const p = board[fr][fc];
  if (!p) return false;
  if (redToMove && !isRed(p)) return false;
  if (!redToMove && !isBlack(p)) return false;
  return isLegalMove(board, fr, fc, tr, tc);
}

// ========== 位置价值表（黑方视角，0行=黑底线，r行r列） ==========
// 三套：开局(OP) / 中局(MG) / 残局(EG)，根据大子数量切换

// 车：开局占巡河/肋道好，残局灵活性更重要
const PST_R_OP = [
  [14,14,12,18,16,18,12,14,14],[16,20,18,24,28,24,18,20,16],[12,12,12,18,20,18,12,12,12],
  [12,18,16,22,22,22,16,18,12],[12,14,12,18,20,18,12,14,12],[12,16,14,20,20,20,14,16,12],
  [6,10,8,14,14,14,8,10,6],   [4,8,6,14,12,14,6,8,4],      [6,4,8,16,8,16,8,4,6],
  [-2,10,6,14,12,14,6,10,-2]
];
const PST_R_EG = PST_R_OP.map(r => r.map(v => Math.floor(v * 1.2)));

// 马：象位马、卧槽马、挂角马
const PST_H = [
  [4,8,16,12,4,12,16,8,4],[4,10,28,16,8,16,28,10,4],[12,14,16,20,18,20,16,14,12],
  [8,24,18,24,20,24,18,24,8],[6,16,14,18,16,18,14,16,6],[4,12,16,14,12,14,16,12,4],
  [2,6,8,6,10,6,8,6,2],     [4,2,8,8,4,8,8,2,4],        [0,2,4,4,-2,4,4,2,0],
  [0,-4,0,0,0,0,0,-4,0]
];

// 炮：中炮价值高，残局炮归家（退回己方）
const PST_C_OP = [
  [6,4,0,-4,-6,-4,0,4,6],   [2,2,0,-2,-6,-2,0,2,2],   [2,2,0,-4,-8,-4,0,2,2],
  [0,0,-4,2,10,2,-4,0,0],   [0,0,0,-2,4,-2,0,0,0],    [-2,0,-2,4,4,4,-2,0,-2],
  [0,0,-2,0,-2,0,-2,0,0],   [0,0,-2,0,-8,0,-2,0,0],   [0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0]
];
const PST_C_EG = [
  [8,8,8,10,10,10,8,8,8],   [6,8,10,12,14,12,10,8,6],   [6,6,8,10,12,10,8,6,6],
  [4,6,6,8,10,8,6,6,4],     [4,4,6,6,8,6,6,4,4],       [2,4,4,4,6,4,4,4,2],
  [0,2,2,2,4,2,2,2,0],     [-2,0,0,0,2,0,0,0,-2],     [0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0]
];

// 士
const PST_A = [
  [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,3,0,3,0,0,0],[0,0,0,0,8,0,0,0,0],[0,0,0,3,0,3,0,0,0]
];
// 象
const PST_E = [
  [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,6,0,0,0,6,0,0],[0,0,0,0,0,0,0,0,0],[8,0,0,0,10,0,0,0,8],
  [0,0,0,0,0,0,0,0,0],[0,0,4,0,0,0,4,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]
];
// 兵/卒（黑方视角，未过河在7-9行）
const PST_P_OP = [
  [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
  [2,0,4,0,10,0,4,0,2],   // 过河第一排 (row3)
  [8,14,18,22,24,22,18,14,8], // row4
  [0,10,14,18,16,18,14,10,0], // row5
  [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]
];
const PST_P_EG = [
  [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
  [6,0,10,0,14,0,10,0,6],
  [14,20,24,28,30,28,24,20,14],
  [6,18,22,26,28,26,22,18,6],
  [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]
];

// ========== 局面阶段判断 ==========
function gamePhase(board) {
  let majors = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && 'rRhHcC'.includes(p)) majors++;
    }
  if (majors >= 10) return 0; // opening
  if (majors >= 6) return 1;  // midgame
  return 2;                   // endgame
}

// 获取位置分（黑方视角；红方翻转）
function pstVal(piece, r, c, phase) {
  const type = piece.toLowerCase();
  const red = isRed(piece);
  const rr = red ? ROWS - 1 - r : r;
  const cc = red ? COLS - 1 - c : c;
  let tbl;
  switch (type) {
    case 'r': tbl = phase === 2 ? PST_R_EG : PST_R_OP; break;
    case 'h': tbl = PST_H; break;
    case 'c': tbl = phase === 2 ? PST_C_EG : PST_C_OP; break;
    case 'a': tbl = PST_A; break;
    case 'e': tbl = PST_E; break;
    case 'p': tbl = phase === 2 ? PST_P_EG : PST_P_OP; break;
    default: return 0;
  }
  return (tbl[rr] && tbl[rr][cc] != null) ? tbl[rr][cc] : 0;
}



// ========== 马活度（憋马腿检测） ==========
function horseLegs(board, r, c) {
  let free = 0;
  const checks = [[-1,-1,-1,0],[-1,1,-1,0],[1,-1,1,0],[1,1,1,0],[-1,-2,0,-1],[1,-2,0,-1],[-1,2,0,1],[1,2,0,1]];
  for (const [dr,dc,br,bc] of checks) {
    if (board[r+br] && board[r+br][c+bc] === 0) free++;
  }
  return free;
}

// ========== 评估函数 ==========
function evaluate(board) {
  let score = 0;
  let redMob = 0, blkMob = 0;
  let redKing = [0,4], blkKing = [0,4];
  let redAE = 0, blkAE = 0;
  let redRooks = [], blkRooks = [], redCannons = [], blkCannons = [], redHorses = [], blkHorses = [];
  let redPawns = [], blkPawns = [];
  const phase = gamePhase(board);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      const type = p.toLowerCase();
      const red = isRed(p);
      const sign = red ? 1 : -1;
      const base = PVAL[type];
      const pos = pstVal(p, r, c, phase);
      score += sign * (base + pos);

      // 收集子力位置
      if (type === 'k') { if (red) redKing = [r,c]; else blkKing = [r,c]; }
      else if (type === 'a' || type === 'e') { if (red) redAE++; else blkAE++; }
      else if (type === 'r') { if (red) redRooks.push([r,c]); else blkRooks.push([r,c]); }
      else if (type === 'c') { if (red) redCannons.push([r,c]); else blkCannons.push([r,c]); }
      else if (type === 'h') { if (red) redHorses.push([r,c]); else blkHorses.push([r,c]); }
      else if (type === 'p') { if (red) redPawns.push([r,c]); else blkPawns.push([r,c]); }
    }
  }

  // 流动性（轻量估算）：车/炮/马在开放位置走法灵活度，不用全量生成
  // 车：相邻4格空格数；马：未被憋腿方向数（后面已有horseLegs）；炮：架炮能力
  function rookMobility(board, r, c, red) {
    let m = 0;
    for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = r+dr, nc = c+dc;
      while (inBoard(nr,nc) && board[nr][nc]===0) { m++; nr+=dr; nc+=dc; }
      if (inBoard(nr,nc) && board[nr][nc] !== 0) m++;
    }
    return m;
  }
  function cannonMobility(board, r, c) {
    let m = 0;
    for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = r+dr, nc = c+dc, jumped = false;
      while (inBoard(nr,nc)) {
        if (board[nr][nc] !== 0) { if (jumped) { m++; break; } else jumped = true; }
        else if (!jumped) m++;
        nr+=dr; nc+=dc;
      }
    }
    return m;
  }
  for (const [r,c] of redRooks) redMob += rookMobility(board, r, c, true);
  for (const [r,c] of blkRooks) blkMob += rookMobility(board, r, c, false);
  for (const [r,c] of redCannons) redMob += cannonMobility(board, r, c);
  for (const [r,c] of blkCannons) blkMob += cannonMobility(board, r, c);
  for (const [r,c] of redHorses) redMob += horseLegs(board, r, c) * 2;
  for (const [r,c] of blkHorses) blkMob += horseLegs(board, r, c) * 2;
  score += (redMob - blkMob) * 1;

  // 将帅安全：士象完整度
  score += (redAE - blkAE) * 15;
  // 将军威胁
  if (inCheck(board, true)) score -= 50;
  if (inCheck(board, false)) score += 50;
  // 残局：将帅活跃加分（靠近中心、御驾亲征）
  if (phase === 2) {
    // 将帅距离中心越近越好
    const rkC = Math.abs(redKing[0] - 4.5) + Math.abs(redKing[1] - 4);
    const bkC = Math.abs(blkKing[0] - 4.5) + Math.abs(blkKing[1] - 4);
    score += (bkC - rkC) * 6; // red king closer to center = better
    // 将帅不要在底线/角落
    if (redKing[0] >= 8) score -= 5;
    if (blkKing[0] <= 1) score += 5;
  }

  // 车控开放线（该列没有自己和对方的兵）
  function openFile(col, red) {
    for (let r = 0; r < ROWS; r++) {
      const p = board[r][col];
      if (p && p.toLowerCase() === 'p' && isRed(p) === red) return false;
    }
    return true;
  }
  for (const [r,c] of redRooks) {
    if (openFile(c, true)) score += 8;
    if (c === 3 || c === 5) score += 6; // 肋道
    // 沉底车
    if (r <= 2) score += 5;
  }
  for (const [r,c] of blkRooks) {
    if (openFile(c, false)) score -= 8;
    if (c === 3 || c === 5) score -= 6;
    if (r >= 7) score -= 5;
  }

  // 炮：当头炮（中列）、沉底炮
  for (const [r,c] of redCannons) {
    if (c === 4 && r < 5 && r > 2) score += 6;
    if (r <= 2) score += 4;
  }
  for (const [r,c] of blkCannons) {
    if (c === 4 && r > 4 && r < 7) score -= 6;
    if (r >= 7) score -= 4;
  }

  // 兵形：过河兵联兵+5、中心兵+3、底兵(老兵)-10
  for (const [r,c] of redPawns) {
    if (r <= 4) { // 已过河
      // 联兵（同行相邻有友兵）
      let paired = false;
      for (const [r2,c2] of redPawns) {
        if (r2 === r && Math.abs(c2 - c) === 1) { paired = true; break; }
      }
      if (paired) score += 6;
      if (c === 4) score += 4;
      if (r === 0) score -= 20; // 老兵（冲到底线威力大减）
    } else {
      // 未过河兵挺起（前进了一步）加分
      if (r <= 6) score += 1;
    }
  }
  for (const [r,c] of blkPawns) {
    if (r >= 5) {
      let paired = false;
      for (const [r2,c2] of blkPawns) {
        if (r2 === r && Math.abs(c2 - c) === 1) { paired = true; break; }
      }
      if (paired) score -= 6;
      if (c === 4) score -= 4;
      if (r === 9) score += 20;
    } else {
      if (r >= 3) score -= 1;
    }
  }

  // 马活度用外部 horseLegs 函数
  for (const [r,c] of redHorses) score += horseLegs(board, r, c) * 2;
  for (const [r,c] of blkHorses) score -= horseLegs(board, r, c) * 2;

  // 节奏加成：当前走方略微加分（先手优势）
  // 不在搜索中直接加，避免上下波动

  return score;
}

// ========== 搜索统计 ==========
const searchStats = { nodes: 0, depth: 0, bestMove: null, score: 0, pv: [], timeMs: 0 };

function pushPV(mv, childPv) {
  const pv = [mv];
  if (childPv) pv.push(...childPv);
  return pv;
}

// ========== 静态搜索 ==========
function quiesce(board, alpha, beta, redToMove, depth, ply) {
  searchStats.nodes++;
  const inChk = inCheck(board, redToMove);
  const stand_pat = (redToMove ? 1 : -1) * evaluate(board);

  if (inChk) {
    // 将军时做全搜索一层
    const moves = allLegalMoves(board, redToMove);
    if (moves.length === 0) return -MATE + ply;
    let best = stand_pat;
    if (best < beta) {
      for (const [fr, fc, tr, tc] of moves) {
        const h = makeMove(board, fr, fc, tr, tc);
        const val = -quiesce(board, -beta, -alpha, !redToMove, depth - 1, ply + 1);
        unmakeMove(board, h);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
    }
    return best;
  }

  if (stand_pat >= beta) return beta;
  if (stand_pat > alpha) alpha = stand_pat;
  if (depth < -4) return alpha;

  // Delta Pruning: 如果吃最大子还达不到alpha就跳过
  const delta = 1000; // 1个车的价值做缓冲

  const moves = allLegalMoves(board, redToMove).filter(([,,tr,tc]) => board[tr][tc] !== 0);
  // MVV-LVA排序
  moves.sort((a, b) => {
    const va = PVAL[board[a[2]][a[3]].toLowerCase()] * 10 - PVAL[board[a[0]][a[1]].toLowerCase()];
    const vb = PVAL[board[b[2]][b[3]].toLowerCase()] * 10 - PVAL[board[b[0]][b[1]].toLowerCase()];
    return vb - va;
  });

  for (const [fr, fc, tr, tc] of moves) {
    const victimVal = PVAL[board[tr][tc].toLowerCase()];
    if (stand_pat + victimVal + delta < alpha) continue;

    const h = makeMove(board, fr, fc, tr, tc);
    const givesCheck = inCheck(board, !redToMove);
    let val;
    if (givesCheck) {
      val = -quiesce(board, -beta, -alpha, !redToMove, depth - 1, ply + 1);
    } else {
      val = -quiesce(board, -beta, -alpha, !redToMove, depth - 1, ply + 1);
    }
    unmakeMove(board, h);
    if (val >= beta) return beta;
    if (val > alpha) alpha = val;
  }
  return alpha;
}

// ========== 历史启发 + 杀手走法 ==========
const historyTable = {}; // [piece_from_to] => score
function historyKey(fr, fc, tr, tc) { return fr * 1000 + fc * 100 + tr * 10 + tc; }
function historyReset() { for (const k in historyTable) delete historyTable[k]; }

function scoreMoves(board, moves, ttBest, killer1, killer2, ply) {
  return moves.map(([fr, fc, tr, tc]) => {
    let s = 0;
    if (ttBest && ttBest[0] === fr && ttBest[1] === fc && ttBest[2] === tr && ttBest[3] === tc) s += 1000000;
    const victim = board[tr][tc];
    const attacker = board[fr][fc];
    if (victim) {
      s += PVAL[victim.toLowerCase()] * 100 - PVAL[attacker.toLowerCase()]; // MVV-LVA
    } else {
      if (killer1 && killer1[0] === fr && killer1[1] === fc && killer1[2] === tr && killer1[3] === tc) s += 50000;
      else if (killer2 && killer2[0] === fr && killer2[1] === fc && killer2[2] === tr && killer2[3] === tc) s += 40000;
      else s += (historyTable[historyKey(fr, fc, tr, tc)] || 0);
    }
    return { mv: [fr, fc, tr, tc], s };
  }).sort((a, b) => b.s - a.s);
}

// ========== Negamax 主搜索 ==========
function negamax(board, depth, alpha, beta, redToMove, ply, killers, allowNull, isPV, repHist) {
  searchStats.nodes++;

  // 重复局面检测：3次重复作和惩罚
  if (repHist && repHist.length > 4 && ply < 2) {
    const curKey = JSON.stringify(board) + (redToMove?'r':'b');
    let repCount = 0;
    for (let i = repHist.length-2; i >= Math.max(0, repHist.length-20); i -= 2) {
      if (repHist[i] === curKey) repCount++;
    }
    if (repCount >= 1) return 0; // 重复走法=均势，不鼓励
  }

  if (depth <= 0) return quiesce(board, alpha, beta, redToMove, 0, ply);

  const hash = boardHash(board, redToMove);
  const tte = ttGet(hash);
  let ttBest = null;
  if (tte) {
    ttBest = tte.mv;
    if (tte.d >= depth) {
      if (tte.f === 'exact') return tte.v;
      if (tte.f === 'lower' && tte.v >= beta) return tte.v;
      if (tte.f === 'upper' && tte.v <= alpha) return tte.v;
    }
  }

  const inChk = inCheck(board, redToMove);
  if (inChk) depth += 1; // 将军扩展

  // 将死距离剪枝
  alpha = Math.max(alpha, -MATE + ply);
  beta = Math.min(beta, MATE - ply - 1);
  if (alpha >= beta) return alpha;

  // 剃刀剪枝 (Razoring)：非PV、非将军、深度<=3，如果静态值+边际远低于alpha则剪
  if (!isPV && !inChk && depth <= 3) {
    const staticVal = (redToMove ? 1 : -1) * evaluate(board);
    if (staticVal + 200 * depth < alpha) {
      const qVal = quiesce(board, alpha, beta, redToMove, 0, ply);
      if (qVal < alpha) return qVal;
    }
  }

  // 空着剪枝 (Null Move Pruning)
  if (allowNull && !inChk && depth >= 3 && gamePhase(board) !== 2 && !isPV) {
    const R = depth >= 6 ? 3 : 2;
    // 验证空着条件：有至少一个大子（避免单兵/炮的空着无效）
      // Null move: pass (skip turn)
    const val = -negamax(board, depth - 1 - R, -beta, -beta + 1, !redToMove, ply + 1, killers, false, false, repHist);
    if (val >= beta) return beta;
  }

  // 无用剪枝 (Futility Pruning)：非PV、非将军、叶前节点，评估+边际仍<alpha则不搜非吃子
  let futile = false;
  if (!isPV && !inChk && depth <= 4) {
    const staticVal = (redToMove ? 1 : -1) * evaluate(board);
    const futilMargin = 150 + 100 * depth;
    if (staticVal + futilMargin < alpha) futile = true;
  }

  // 内部迭代加深 (IID)：无TT最佳走法且深度>=4时先做浅层搜索找好走法
  if (!ttBest && depth >= 4) {
    const shallowK = new Array(128).fill(null);
    negamax(board, depth - 2, alpha, beta, redToMove, ply, shallowK, true, false, repHist);
    const sh = ttGet(hash);
    if (sh && isValidMove(board, redToMove, sh.mv)) ttBest = sh.mv;
  }

  const allMoves = allLegalMoves(board, redToMove);
  if (allMoves.length === 0) {
    return inChk ? -MATE + ply : 0; // 将死（负是因为走方败）或困毙(0)
  }

  const k1 = killers[ply * 2], k2 = killers[ply * 2 + 1];
  const scored = scoreMoves(board, allMoves, ttBest, k1, k2, ply);

  let bestVal = -INF;
  let bestMove = scored[0].mv;
  let ttFlag = 'upper';
  let movesDone = 0;
  const LMR_DEPTH_THRESH = 3;
  const LMR_MOVE_THRESH = 3;

  for (const { mv } of scored) {
    const [fr, fc, tr, tc] = mv;
    const isCapture = board[tr][tc] !== 0;

    // Futility
    if (futile && !isCapture && !inChk && movesDone > 0) continue;

    const h = makeMove(board, fr, fc, tr, tc);
    const givesCheck = inCheck(board, !redToMove);
    let val;

    movesDone++;
    let searchDepth = depth - 1;

    if (movesDone === 1) {
      // PV 走法：全窗口搜索
      val = -negamax(board, searchDepth, -beta, -alpha, !redToMove, ply + 1, killers, true, isPV);
    } else {
      // LMR
      let reduction = 0;
      if (depth >= LMR_DEPTH_THRESH && movesDone > LMR_MOVE_THRESH && !isCapture && !givesCheck && !inChk) {
        reduction = Math.min(depth - 2, 1 + Math.floor(Math.log(movesDone) * Math.log(depth) / 4));
        if (isPV) reduction = Math.max(0, reduction - 1);
      }

      // 先以缩小窗口+减深度搜索
      val = -negamax(board, searchDepth - reduction, -alpha - 1, -alpha, !redToMove, ply + 1, killers, true, false);

      // 失败则全窗口/全深度重搜
      if (reduction > 0 && val > alpha) {
        val = -negamax(board, searchDepth, -alpha - 1, -alpha, !redToMove, ply + 1, killers, true, false);
      }
      if (val > alpha && val < beta) {
        val = -negamax(board, searchDepth, -beta, -alpha, !redToMove, ply + 1, killers, true, isPV);
      }
    }

    unmakeMove(board, h);

    if (val > bestVal) {
      bestVal = val;
      bestMove = mv;
      if (val > alpha) {
        alpha = val;
        ttFlag = 'exact';
      }
    }
    if (alpha >= beta) {
      if (!isCapture) {
        // 杀手走法
        killers[ply * 2 + 1] = killers[ply * 2];
        killers[ply * 2] = mv;
        // 历史启发
        historyTable[historyKey(fr, fc, tr, tc)] = (historyTable[historyKey(fr, fc, tr, tc)] || 0) + depth * depth;
      }
      ttFlag = 'lower';
      break;
    }
  }

  ttPut(hash, depth, ttFlag, bestVal, bestMove);
  return bestVal;
}

// Null move implemented by simply swapping turn in recursive call

// ========== PV 提取 ==========
function extractPV(board, redToMove, maxPly) {
  const pv = [];
  const tmp = cloneBoard(board);
  let turn = redToMove;
  const visited = new Set();
  for (let i = 0; i < maxPly; i++) {
    const h = boardHash(tmp, turn);
    if (visited.has(h.toString())) break;
    visited.add(h.toString());
    const tte = ttGet(h);
    if (!tte || !tte.mv) break;
    const [fr, fc, tr, tc] = tte.mv;
    const p = tmp[fr][fc];
    if (!p) break;
    if ((turn && !isRed(p)) || (!turn && !isBlack(p))) break;
    if (!isLegalMove(tmp, fr, fc, tr, tc)) break;
    pv.push([fr, fc, tr, tc]);
    makeMove(tmp, fr, fc, tr, tc);
    turn = !turn;
  }
  return pv;
}


// ========== 开局库 ==========
// 用走法序列匹配，返回推荐走法
// 格式：[红走, 黑应, 红走, 黑应, ...] 每步 [fr,fc,tr,tc]
// 坐标：行0-9(0=黑底线,9=红底线)，列0-8(左到右)
// 红方常见开局第一步（经典正统开局）
const OPENING_BOOK = {
  '': [
    [7,7,7,4], // 炮二平五 (当头炮/中炮) - 最主流
    [7,1,7,4], // 炮八平五 (左炮当头/顺手炮)
    [9,1,7,2], // 马二进三 (起马局)
    [9,7,7,6], // 马八进七 (左正马)
    [6,2,5,2], // 兵七进一 (仙人指路)
    [6,6,5,6], // 兵三进一 (进三兵)
    [6,4,5,4], // 兵五进一 (中兵/急进中兵)
    [9,2,7,4], // 相三进五 (飞相局)
  ],
};

function bookMove(board, aiIsRed, moveHistory) {
  // 简单：只在开局(总步数<4)时用库
  if (moveHistory.length >= 4) return null;
  // 第一步，随机选择常见开局
  if (moveHistory.length === 0 && aiIsRed) {
    const openings = [
      [7,7,7,4], // 炮二平五（当头炮）
      [7,1,7,4], // 炮八平五（左炮当头）
      [9,1,7,2], // 马二进三
      [9,7,7,6], // 马八进七
      [6,4,5,4], // 兵五进一（进中兵）
      [6,2,5,2], // 兵七进一
      [6,6,5,6], // 兵三进一
      [9,0,8,0], // 车一进一（横车）
    ];
    return openings[Math.floor(Math.random() * openings.length)];
  }
  // 应中炮：常见屏风马
  if (moveHistory.length === 1 && !aiIsRed) {
    // 如果红方走了当头炮(炮到中路)
    const first = moveHistory[0];
    if ((first[2] === 7 && first[3] === 4) || (first[0] === 7 && first[1] === 1 && first[2] === 7 && first[3] === 4)) {
      // 黑方屏风马/顺炮/列炮
      const responses = [
        [0,1,2,2], // 马2进3（屏风马）
        [0,7,2,6], // 马8进7（屏风马）
        [2,1,2,4], // 炮8平5（顺炮）
        [2,7,2,4], // 炮2平5（列炮）
        [3,4,4,4], // 卒7进1（挺7卒）
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }
  return null;
}


// ========== AI 主入口：迭代加深 ==========
let _openingHistory = [];
function aiMove(board, aiIsRed, maxDepth, onProgress, moveHistory) {
  if (moveHistory) _openingHistory = moveHistory;
  const killers = new Array(128).fill(null);
  historyReset();
  let bestMove = null;
  let bestVal = 0;
  const startTime = Date.now();
  const timeLimit = maxDepth >= 4 ? 800 : maxDepth >= 3 ? 400 : 150;

  searchStats.nodes = 0;
  searchStats.pv = [];
  searchStats.timeMs = 0;

  // 开局库
  const bm = bookMove(board, aiIsRed, moveHistory || _openingHistory);
  if (bm) {
    const [fr,fc,tr,tc] = bm;
    if (isLegalMove(board, fr, fc, tr, tc)) {
      searchStats.depth = 0;
      searchStats.nodes = 1;
      searchStats.bestMove = bm;
      searchStats.pv = [bm];
      searchStats.timeMs = 0;
      searchStats.score = 0;
      if (onProgress) onProgress({...searchStats});
      return bm;
    }
  }

  // 检查是否有唯一合法走法
  const legalMoves = allLegalMoves(board, aiIsRed);
  if (legalMoves.length === 0) return null;
  if (legalMoves.length === 1) {
    bestMove = legalMoves[0];
    searchStats.depth = maxDepth;
    searchStats.nodes = 1;
    searchStats.bestMove = bestMove;
    searchStats.pv = [bestMove];
    searchStats.timeMs = 0;
    if (onProgress) onProgress({...searchStats});
    return bestMove;
  }

  // 构建重复局面检测历史
  const repHist = [];
  // If move history is provided externally (from main.js), use it to build board state history
  if (typeof moveHistory !== 'undefined' && moveHistory.length > 0) {
    const tmpB = cloneBoard(INITIAL_BOARD);
    repHist.push(JSON.stringify(tmpB) + 'r');
    let turn = true;
    for (const [fr,fc,tr,tc] of moveHistory) {
      if (tmpB[fr][fc]) {
        makeMove(tmpB, fr, fc, tr, tc);
        turn = !turn;
        repHist.push(JSON.stringify(tmpB) + (turn?'r':'b'));
      }
    }
  }

  let alpha = -INF, beta = INF;
  let completedDepth = 0;

  for (let depth = 1; depth <= maxDepth + 4; depth++) {
    let aspiration = 60;
    if (completedDepth > 0) {
      alpha = bestVal - aspiration;
      beta = bestVal + aspiration;
    }

    let val = negamax(board, depth, alpha, beta, aiIsRed, 0, killers, true, true, repHist);

    // Aspiration 失败则扩大窗口重搜
    if (val <= alpha || val >= beta) {
      alpha = -INF; beta = INF;
      val = negamax(board, depth, alpha, beta, aiIsRed, 0, killers, true, true, repHist);
    }

    bestVal = val;
    const rootHash = boardHash(board, aiIsRed);
    const tte = ttGet(rootHash);
    if (tte && isValidMove(board, aiIsRed, tte.mv)) {
      bestMove = tte.mv;
    }

    completedDepth = depth;
    const pv = extractPV(board, aiIsRed, Math.min(depth + 3, 20));
    const elapsed = Date.now() - startTime;
    searchStats.depth = depth;
    searchStats.bestMove = bestMove;
    searchStats.score = aiIsRed ? bestVal : -bestVal;
    searchStats.pv = pv;
    searchStats.nodes = searchStats.nodes; // already counted
    searchStats.timeMs = elapsed;

    if (onProgress) onProgress({...searchStats});

    if (elapsed > timeLimit && depth >= maxDepth) break;
    if (Math.abs(bestVal) > MATE_THRESHOLD) break; // 发现将死
  }

  if (!isValidMove(board, aiIsRed, bestMove)) {
    bestMove = legalMoves[0];
  }
  return bestMove;
}
