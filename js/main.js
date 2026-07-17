/**
 * 主程序：游戏状态 + 事件绑定
 * AI 引擎通过 Web Worker 在独立线程运行，不阻塞 UI
 */
let board, currentTurn, selected, legalTargets, history, gameOver, positionHistory;
let playerRed = true;
let aiDepth = 2;
let lastMove = null;
let editMode = false;
let editPiece = null;
let flipped = false;
let aiThinking = false;
let aiSearchPending = false;
let pvArrows = null; // 搜索中实时 PV 箭头：[[fr,fc,tr,tc], ...]


// ========== 后端对局日志（可选：需 node server.js 运行） ==========
let currentGameId = null;
let currentPly = 0;
let pendingAiInfo = null; // 由 worker 'result' 消息填充，被下一次 AI 的 doMove 消费
function _genGameId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return t + '-' + r;
}
function postGameLog(pathname, body) {
  try {
    fetch(pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {}); // 静默失败：无后端时不影响游戏
  } catch (_) { /* 静默 */ }
}

const canvas = document.getElementById('board');
const ctx = (() => {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width, h = canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  return c;
})();
// 显示尺寸响应式：手机上自动缩小到适配屏幕宽度，但保持 9:10 比例
function syncCanvasDisplaySize() {
  const maxW = Math.min(540, window.innerWidth - 24);
  canvas.style.width = maxW + 'px';
  canvas.style.height = (maxW * 600 / 540) + 'px';
}
syncCanvasDisplaySize();
window.addEventListener('resize', () => { syncCanvasDisplaySize(); render(); });
const statusEl = document.getElementById('status');
const moveListEl = document.getElementById('moveList');
const diffSel = document.getElementById('difficulty');
const sideSel = document.getElementById('side');
const searchContentEl = document.getElementById('searchContent');
const evalFillEl = document.getElementById('evalFill');
const evalLabelEl = document.getElementById('evalLabel');
const editPanelEl = document.getElementById('editPanel');
const editModeBtn = document.getElementById('editMode');
const piecePaletteEl = document.getElementById('piecePalette');

const ALL_PIECES = ['K','A','E','H','R','C','P','k','a','e','h','r','c','p'];
const MATE_SCORE = 60000;

// ========== Web Worker ==========
let worker;
let aiWatchdog = null;
let searchToken = 0;
function initWorker() {
  if (worker) worker.terminate();
  worker = new Worker('js/engine-worker.js');
  worker.onmessage = function(e) {
    const msg = e.data;
    if (msg.type === 'progress') {
      showSearchInfo(msg);
      // 实时更新棋盘 PV 箭头
      if (msg.pv && msg.pv.length > 0) {
        pvArrows = msg.pv.slice();  // 拷贝避免 Worker 复用数组导致闪烁
        render();
      }
    } else if (msg.type === 'result') {
      // stale result（悔棋/newgame 后到达）→ 丢弃
      if (msg.token !== undefined && msg.token !== searchToken) {
        console.warn('[main] 丢弃 stale result token=' + msg.token + ' vs ' + searchToken);
        return;
      }
      aiThinking = false;
      pvArrows = null;  // 搜索结束，清箭头
      if (aiWatchdog) { clearTimeout(aiWatchdog); aiWatchdog = null; }
      if (msg.error) {
        searchContentEl.innerHTML += '<br>⚠️ 引擎错误: ' + msg.error;
        console.error('[main] engine error:', msg.error);
      } else {
        searchContentEl.innerHTML += '<br>✓ 完成';
      }
      render();
      // 记录 AI 搜索详情，交给下一次 doMove 打点
      pendingAiInfo = {
        score: (msg.score != null) ? msg.score : null,
        depth: (msg.depth != null) ? msg.depth : null,
        nodes: (msg.nodes != null) ? msg.nodes : null,
        timeMs: (msg.timeMs != null) ? msg.timeMs : (msg.time != null ? msg.time : null),
      };
      if (msg.bestMove && !gameOver) {
        doMove(msg.bestMove[0], msg.bestMove[1], msg.bestMove[2], msg.bestMove[3]);
      } else if (!msg.bestMove && !gameOver) {
        // 引擎没给合法招 → 通常是 wasm 异常或困毙。给用户可见提示，避免 UI 假死
        statusEl.textContent = '⚠️ AI 未返回招法（可能困毙或引擎异常），请悔棋重试';
      }
      updateStatus();
    }
  };
}
initWorker();

function aiSearch() {
  if (gameOver || editMode || aiThinking) return;
  aiThinking = true; pvArrows = null;
  const moveHistory = history.map(h => [h.h.fr, h.h.fc, h.h.tr, h.h.tc]);
  const depth = parseInt(diffSel.value);
  aiDepth = depth;
  searchContentEl.innerHTML = '思考中…';
  updateStatus();
  searchToken++;
  worker.postMessage({
    type: 'search',
    token: searchToken,
    board: board,
    redToMove: !playerRed,
    depth: depth,
    moveHistory: moveHistory,
  });
  // 看门狗：30s 内没收到 result → 强制解锁 UI（避免 wasm 卡死导致 aiThinking 永远为 true）
  if (aiWatchdog) clearTimeout(aiWatchdog);
  aiWatchdog = setTimeout(() => {
    console.error('[main] AI 30s 未响应，强制重置 worker');
    aiThinking = false;
    pvArrows = null;
    statusEl.textContent = '⚠️ AI 长时间无响应，已重置';
    try { worker.terminate(); } catch (_) {}
    initWorker();
    aiWatchdog = null;
  }, 30000);
}

// ========== Palette ==========
function buildPalette() {
  piecePaletteEl.innerHTML = '';
  const erase = document.createElement('button');
  erase.className = 'piece-btn erase'; erase.textContent = '擦';
  erase.dataset.piece = 'erase';
  erase.onclick = () => selectEditPiece('erase');
  piecePaletteEl.appendChild(erase);
  for (const p of ALL_PIECES) {
    const btn = document.createElement('button');
    btn.className = 'piece-btn ' + (isRed(p) ? 'red' : 'black');
    btn.textContent = CN_NAME[p];
    btn.dataset.piece = p;
    btn.onclick = () => selectEditPiece(p);
    piecePaletteEl.appendChild(btn);
  }
}
buildPalette();

function selectEditPiece(p) {
  editPiece = p;
  for (const btn of piecePaletteEl.children) btn.classList.toggle('selected', btn.dataset.piece===p);
}

// ========== Game init ==========
function newGame() {
  board = cloneBoard(INITIAL_BOARD);
  currentTurn = true; selected = null; legalTargets = null;
  history = []; gameOver = false; lastMove = null; positionHistory = new Map();
  playerRed = sideSel.value === 'red'; aiDepth = parseInt(diffSel.value);
  if (worker) worker.postMessage({type:'newgame'});
  editMode = false; editPanelEl.style.display = 'none';
  editModeBtn.classList.remove('active');
  moveListEl.innerHTML = '';
  aiThinking = false; pvArrows = null;
  render(); updateStatus();
  updateEvalDisplay(0, 0);
  searchContentEl.innerHTML = '等待走棋…';
  // 后端对局记录：开局
  currentGameId = _genGameId();
  currentPly = 0;
  pendingAiInfo = null;
  postGameLog('/api/games/start', {
    gameId: currentGameId,
    playerRed: playerRed,
    aiDepth: aiDepth,
    initialBoard: board,
  });
  if (!playerRed) setTimeout(aiSearch, 300);
}

function render() { drawBoard(ctx, board, selected, legalTargets, lastMove, flipped, pvArrows); }

function updateStatus(msg) {
  if (msg) { statusEl.textContent = msg; return; }
  if (gameOver) return;
  if (editMode) { statusEl.textContent='摆子模式'; statusEl.className='status'; return; }
  if (aiThinking) {
    statusEl.textContent = 'AI 思考中…';
    statusEl.className = 'status ' + (currentTurn ? 'red' : 'black');
    return;
  }
  // 现在不是 AI 思考中，按走方显示
  const turnName = currentTurn ? '红方' : '黑方';
  if (currentTurn === playerRed) {
    statusEl.textContent = '轮到你走棋（' + turnName + '）';
    statusEl.className = 'status ' + (currentTurn ? 'red' : 'black');
  } else {
    statusEl.textContent = '轮到 AI（' + turnName + '）';
    statusEl.className = 'status ' + (currentTurn ? 'red' : 'black');
  }
}

function pvToChinese(pv) {
  if (!pv || pv.length === 0) return '（无）';
  const tmp = cloneBoard(board);
  let turn = !playerRed; // AI's turn
  const parts = [];
  for (const [fr,fc,tr,tc] of pv) {
    const p = tmp[fr][fc]; if (!p) break;
    // 用中文记谱，沿用 ui.js 的 moveToChinese（每步基于当前临时局面）
    parts.push(moveToChinese(fr, fc, tr, tc, p, tmp));
    makeMove(tmp, fr, fc, tr, tc);
    turn = !turn;
    if (parts.length >= 8) break;
  }
  return parts.length ? parts.join('  ') : '（无）';
}

// 约定：updateEvalDisplay 的 score 入参 = 玩家视角 cp（正=玩家好，centipawn 单位）
// 参照 Pikafish/Stockfish 标准：cp N / mate N + WDL 胜率模型
function evalBarPctFromCp(cp) {
  // 胜率 wr = 1/(1+exp(-k*cp))，中国象棋子力总量低，斜率取 0.004
  const wr = 1 / (1 + Math.exp(-0.004 * cp));
  return Math.max(2, Math.min(98, wr * 100));
}
function wdlFromCp(cp) {
  const wr = 1 / (1 + Math.exp(-0.004 * cp));
  const lr = 1 / (1 + Math.exp(0.004 * cp));
  const dr = Math.max(0, 1 - wr - lr);
  return { w: Math.round(wr*1000), d: Math.round(dr*1000), l: Math.round(lr*1000) };
}
function updateEvalDisplay(cpPlayer, depth) {
  // 评估条窄，只显示紧凑评分；详细 WDL 见搜索面板
  let shortLabel, pct;
  if (cpPlayer > MATE_SCORE - 1000) {
    const mateIn = Math.ceil((MATE_SCORE - cpPlayer) / 2);
    shortLabel = '+#' + mateIn;
    pct = 100;
  } else if (cpPlayer < -MATE_SCORE + 1000) {
    const mateIn = Math.abs(Math.ceil((cpPlayer + MATE_SCORE) / 2));
    shortLabel = '-#' + mateIn;
    pct = 0;
  } else {
    const pawns = cpPlayer / 100;
    const sign = pawns > 0 ? '+' : '';
    shortLabel = sign + pawns.toFixed(2);
    pct = evalBarPctFromCp(cpPlayer);
  }
  if (depth) shortLabel += ' d' + depth;
  evalFillEl.style.height = pct + '%';
  evalLabelEl.textContent = shortLabel;
}

function showSearchInfo(stats) {
  // stats.score 始终是红方视角 cp（正=红好），转成玩家视角
  const cpPlayer = playerRed ? stats.score : -stats.score;
  let scoreText;
  if (cpPlayer > MATE_SCORE - 1000) scoreText = 'mate ' + Math.ceil((MATE_SCORE - cpPlayer) / 2);
  else if (cpPlayer < -MATE_SCORE + 1000) scoreText = 'mate -' + Math.abs(Math.ceil((cpPlayer + MATE_SCORE) / 2));
  else {
    const pawns = cpPlayer / 100;
    const sign = pawns > 0 ? '+' : '';
    scoreText = `cp ${cpPlayer} (${sign}${pawns.toFixed(2)})`;
  }
  const wdl = wdlFromCp(cpPlayer);
  searchContentEl.innerHTML =
    '<div class="si-row">深度: ' + stats.depth + ' 层｜节点: ' + (stats.nodes||0).toLocaleString() + '｜耗时: ' + stats.timeMs + 'ms</div>' +
    '<div class="si-row">评分: ' + scoreText + ' (玩家视角，正=你占优)</div>' +
    '<div class="si-row">WDL: ' + (wdl.w/10).toFixed(1) + '% 胜 / ' + (wdl.d/10).toFixed(1) + '% 平 / ' + (wdl.l/10).toFixed(1) + '% 负</div>' +
    '<div class="si-pv">主变 PV: ' + pvToChinese(stats.pv) + '</div>';
  // 同步更新 eval bar（玩家视角）
  updateEvalDisplay(cpPlayer, stats.depth);
}

// ========== Moves ==========
function doMove(fr, fc, tr, tc) {
  pvArrows = null;
  const piece = board[fr][fc];
  const redPiece = isRed(piece);
  const moveChinese = moveToChinese(fr,fc,tr,tc,piece,board);
  const captured = board[tr][tc] || null;
  const h = makeMove(board, fr, fc, tr, tc);
  lastMove = {fr,fc,tr,tc};
  history.push({h,piece,captured:h.captured});
  const li = document.createElement('li');
  li.className = redPiece?'red-move':'black-move';
  li.textContent = moveChinese;
  moveListEl.appendChild(li);
  moveListEl.scrollTop = moveListEl.scrollHeight;

  const posKey = JSON.stringify(board) + (!redPiece ? 'r' : 'b');
  currentTurn = !redPiece;
  positionHistory.set(posKey,(positionHistory.get(posKey)||0)+1);

  render();
  // 静态评估同步到 eval bar（玩家视角 cp，evaluate 已是红方 cp 视角）
  const redCp = evaluate(board);
  updateEvalDisplay(playerRed ? redCp : -redCp, 0);

  // 后端对局记录：走子
  currentPly += 1;
  const moverIsHuman = (redPiece === playerRed);
  const ai = (!moverIsHuman && pendingAiInfo) ? pendingAiInfo : null;
  pendingAiInfo = null;
  if (currentGameId) {
    postGameLog('/api/games/move', {
      gameId: currentGameId,
      ply: currentPly,
      side: redPiece ? 'red' : 'black',
      by: moverIsHuman ? 'human' : 'ai',
      move: [fr, fc, tr, tc],
      moveChinese: moveChinese,
      piece: piece,
      captured: captured,
      score: ai ? ai.score : null,
      depth: ai ? ai.depth : null,
      nodes: ai ? ai.nodes : null,
      timeMs: ai ? ai.timeMs : null,
    });
  }

  function _endGame(result, reason, msg) {
    gameOver = true;
    statusEl.textContent = msg;
    statusEl.className = 'status';
    if (currentGameId) {
      postGameLog('/api/games/end', {
        gameId: currentGameId,
        result: result,
        reason: reason,
        plies: currentPly,
      });
    }
  }

  if (positionHistory.get(posKey) >= 10) {
    _endGame('draw_rep', '十次重复', '⚖️ 十次重复局面，判和');
    console.log('[game] 十次重复判和'); return;
  }
  const status = gameStatus(board, currentTurn);
  if (status === 'checkmate') {
    const winRed = !currentTurn; // currentTurn 是被将死方
    _endGame(winRed ? 'red_win' : 'black_win', 'checkmate',
      '将死！' + (winRed ? '红方' : '黑方') + '获胜 🎉');
    return;
  }
  if (status === 'stalemate') {
    _endGame('draw_stalemate', 'stalemate', '困毙！和棋');
    return;
  }
  if (inCheck(board, currentTurn)) {
    updateStatus('将军！'); setTimeout(updateStatus, 1500);
  } else updateStatus();
}

// ========== Click handler ==========
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  let x=(e.clientX-rect.left)*(540/rect.width);
  let y=(e.clientY-rect.top)*(600/rect.height);
  const pos = posFromXY(x, y, flipped);

  if (editMode) {
    if (!pos) return;
    const [r,c]=pos;
    if (editPiece==='erase') board[r][c]=0;
    else if(editPiece) board[r][c]=editPiece;
    render(); return;
  }
  if (gameOver||aiThinking) return;
  if (currentTurn!==playerRed) return;
  if (!pos) { if(selected){selected=null;legalTargets=null;render();} return; }

  if (selected) {
    if (legalTargets.some(([tr,tc])=>tr===pos[0]&&tc===pos[1])) {
      doMove(selected[0],selected[1],pos[0],pos[1]);
      selected=null;legalTargets=null;
      if(!gameOver) setTimeout(aiSearch, 200);
      return;
    }
    if (isOwn(board[pos[0]][pos[1]],playerRed)) {
      selected=pos;
      legalTargets=allLegalMoves(board,playerRed).filter(([fr,fc])=>fr===pos[0]&&fc===pos[1]).map(([,,tr,tc])=>[tr,tc]);
      render(); return;
    }
    selected=null;legalTargets=null;render();return;
  }
  if (isOwn(board[pos[0]][pos[1]],playerRed)) {
    selected=pos;
    legalTargets=allLegalMoves(board,playerRed).filter(([fr,fc])=>fr===pos[0]&&fc===pos[1]).map(([,,tr,tc])=>[tr,tc]);
    render();
  }
});

// ========== Buttons ==========
document.getElementById('newGame').addEventListener('click', newGame);
document.getElementById('undo').addEventListener('click', () => {
  if (history.length===0||aiThinking) return;
  if (gameOver) gameOver=false;
  let steps = 0;
  if (history.length>0 && isRed(history[history.length-1].piece)!==playerRed) steps=2;
  else steps=1;
  // If AI is thinking, stop it
  if (aiThinking) { worker.postMessage({type:'stop'}); aiThinking=false; searchToken++; if (aiWatchdog) { clearTimeout(aiWatchdog); aiWatchdog = null; } }
  pvArrows = null;
  for(let i=0;i<steps&&history.length>0;i++){
    const last=history.pop();
    unmakeMove(board,last.h);
    const lis=moveListEl.children;
    if(lis.length) moveListEl.removeChild(lis[lis.length-1]);
  }
  currentTurn=playerRed; selected=null;legalTargets=null;
  lastMove=history.length>0?history[history.length-1].h:null;
  positionHistory=new Map();
  const tmp=cloneBoard(INITIAL_BOARD); let tmpTurn=true;
  for(const h of history){
    makeMove(tmp,h.h.fr,h.h.fc,h.h.tr,h.h.tc); tmpTurn=!tmpTurn;
    const pk=JSON.stringify(tmp)+(tmpTurn?'r':'b');
    positionHistory.set(pk,(positionHistory.get(pk)||0)+1);
  }
  render(); updateStatus();
  const redCp = evaluate(board);
  updateEvalDisplay(playerRed ? redCp : -redCp, 0);
});

editModeBtn.addEventListener('click',()=>{
  editMode=!editMode;
  editPanelEl.style.display=editMode?'block':'none';
  editModeBtn.classList.toggle('active',editMode);
  selected=null;legalTargets=null;gameOver=false;
  render(); updateStatus();
});
document.getElementById('clearBoard').addEventListener('click',()=>{
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) board[r][c]=0;
  selected=null;legalTargets=null;render();
});
document.getElementById('resetBoard').addEventListener('click',()=>{
  board=cloneBoard(INITIAL_BOARD);selected=null;legalTargets=null;lastMove=null;render();
});
document.getElementById('switchTurn').addEventListener('click',()=>{
  currentTurn=!currentTurn;
  updateStatus('走方切换为：'+(currentTurn?'红方':'黑方'));
});
document.getElementById('startFromEdit').addEventListener('click',()=>{
  if(!findKing(board,true)){alert('红方缺少帅！');return;}
  if(!findKing(board,false)){alert('黑方缺少将！');return;}
  if(inCheck(board,currentTurn)&&allLegalMoves(board,currentTurn).length===0){alert('当前走方已被将死');return;}
  editMode=false; editPanelEl.style.display='none'; editModeBtn.classList.remove('active');
  history=[]; moveListEl.innerHTML=''; lastMove=null; positionHistory=new Map(); gameOver=false;
  aiDepth=parseInt(diffSel.value); playerRed=sideSel.value==='red';
  render(); updateStatus();
  if(currentTurn!==playerRed) setTimeout(aiSearch, 300);
});
document.getElementById('flipBoard').addEventListener('click',()=>{flipped=!flipped;render();});
diffSel.addEventListener('change',()=>{aiDepth=parseInt(diffSel.value);});
// 解耦：切换执手 ≠ 新开局。只动态交接人类/AI 责任，棋局保留。
sideSel.addEventListener('change',()=>{
  if (editMode) return; // 摆子模式下 sideSel 仅改变 playerRed 标记，由 startFromEdit 重置
  const newPlayerRed = sideSel.value === 'red';
  if (newPlayerRed === playerRed) return;
  playerRed = newPlayerRed;
  aiDepth = parseInt(diffSel.value);
  // 取消当前选择
  selected = null; legalTargets = null;
  render();
  // 如果当前正在 AI 思考，且现在该走方变成了人类 → 停 AI
  if (aiThinking && currentTurn === playerRed) {
    worker.postMessage({type:'stop'});
    aiThinking = false;
  }
  // 如果现在轮到 AI（新执手把人类换到对方）→ 启动 AI
  else if (!aiThinking && !gameOver && currentTurn !== playerRed) {
    setTimeout(aiSearch, 100);
  }
  updateStatus();
  // 评分条按新视角刷新
  const redCp = evaluate(board);
  updateEvalDisplay(playerRed ? redCp : -redCp, 0);
});

newGame();
