/**
 * 通用 wasm 引擎加载器。
 * 支持加载"当前版本"或"历史归档版本"。
 */
const fs = require('fs');
const path = require('path');

async function loadEngine(engineName) {
  let jsPath, wasmPath;
  if (engineName === 'current') {
    jsPath = path.join(__dirname, '../../js/wasm/engine.js');
    wasmPath = path.join(__dirname, '../../js/wasm/engine_bg.wasm');
  } else {
    jsPath = path.join(__dirname, `../../js/wasm/versions/engine-${engineName}.js`);
    wasmPath = path.join(__dirname, `../../js/wasm/versions/engine-${engineName}_bg.wasm`);
  }
  const src = fs.readFileSync(jsPath, 'utf8');
  const globalKey = `__wasm_${engineName.replace(/[^\w]/g,'_')}`;
  const patched = src.replace('let wasm_bindgen =', `globalThis.${globalKey} =`);
  eval(patched);
  const initFn = globalThis[globalKey];
  await initFn(fs.readFileSync(wasmPath));
  return initFn;
}

function boardToFlat(board) {
  const b = Buffer.alloc(90);
  for (let r=0; r<10; r++) for (let c=0; c<9; c++) {
    const p = board[r][c]; b[r*9+c] = p === 0 ? 0 : p.charCodeAt(0);
  }
  return b;
}

function cloneBoard(b) { return b.map(r => r.slice()); }

const INITIAL_BOARD = [
  ['r','h','e','a','k','a','e','h','r'],
  [ 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 ],
  [ 0 ,'c', 0 , 0 , 0 , 0 , 0 ,'c', 0 ],
  ['p', 0 ,'p', 0 ,'p', 0 ,'p', 0 ,'p'],
  [ 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 ],
  [ 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 ],
  ['P', 0 ,'P', 0 ,'P', 0 ,'P', 0 ,'P'],
  [ 0 ,'C', 0 , 0 , 0 , 0 , 0 ,'C', 0 ],
  [ 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 , 0 ],
  ['R','H','E','A','K','A','E','H','R'],
];

function applyMove(board, fr, fc, tr, tc) {
  board[tr][tc] = board[fr][fc];
  board[fr][fc] = 0;
}

// 简单的正确性检查：捕获对方将 = 游戏结束
function isGameOver(board) {
  let redK=false, blkK=false;
  for (let r=0; r<10; r++) for (let c=0; c<9; c++) {
    if (board[r][c] === 'K') redK = true;
    if (board[r][c] === 'k') blkK = true;
  }
  if (!redK) return 'black-wins';
  if (!blkK) return 'red-wins';
  return null;
}

module.exports = { loadEngine, boardToFlat, cloneBoard, INITIAL_BOARD, applyMove, isGameOver };
