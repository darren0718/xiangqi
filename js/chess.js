/**
 * 中国象棋规则引擎（优化版 v3）
 *
 * 核心优化：
 * - squareAttacked 定向攻击检测替代全盘 pseudoMoves 扫描
 * - computePinnedBB 计算被牵制棋子，非被将/非牵制子走法直接合法
 * - pseudoMoves 使用扁平数组 [tr,tc,tr,tc,...] 减少GC
 * - legalCaptures 专用吃子走法生成（用于quiescence）
 * - allLegalMoves/legalCaptures 内联isLegal判定，复用pseudoMoves结果
 */

const ROWS = 10, COLS = 9;
const PVAL = { k: 60000, r: 900, h: 400, c: 450, a: 200, e: 200, p: 100 };

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

function isRed(p){return p&&p>='A'&&p<='Z';}
function isBlack(p){return p&&p>='a'&&p<='z';}
function isOwn(p,red){return red?isRed(p):isBlack(p);}
function isEnemy(p,red){return red?isBlack(p):isRed(p);}
function inBoard(r,c){return r>=0&&r<ROWS&&c>=0&&c<COLS;}
function cloneBoard(b){return b.map(row=>row.slice());}
function inPalace(r,c,red){if(c<3||c>5)return false;return red?(r>=7&&r<=9):(r>=0&&r<=2);}
function crossedRiver(r,red){return red?r<=4:r>=5;}

const HORSE_MOVES=[[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[1,-2,0,-1],[-1,2,0,1],[1,2,0,1]];
const ADVISOR_MOVES=[[-1,-1],[-1,1],[1,-1],[1,1]];
const KING_MOVES=[[-1,0],[1,0],[0,-1],[0,1]];
const ELEPHANT_MOVES=[[-2,-2,-1,-1],[-2,2,-1,1],[2,-2,1,-1],[2,2,1,1]];
const ROOK_DIRS=[[-1,0],[1,0],[0,-1],[0,1]];

/**
 * 生成伪走法写入out数组（扁平[tr,tc,tr,tc,...]），不传out则返回新数组（嵌套[[tr,tc],...]格式，兼容旧调用）
 */
function pseudoMoves(board, r, c, out) {
  const p=board[r][c];
  if(!p)return out||[];
  const red=isRed(p);
  const type=p.toLowerCase();
  const flat=!!out;
  const moves=out||[];
  function add(nr,nc){if(!inBoard(nr,nc))return false;const t=board[nr][nc];if(isOwn(t,red))return false;if(flat)moves.push(nr,nc);else moves.push([nr,nc]);return!t;}
  switch(type){
    case'k':{
      for(const[dr,dc]of KING_MOVES){const nr=r+dr,nc=c+dc;if(inPalace(nr,nc,red))add(nr,nc);}
      const ek=red?'k':'K',dir=red?-1:1;let nr=r+dir;
      while(inBoard(nr,c)){if(board[nr][c]!==0){if(board[nr][c]===ek){if(flat)moves.push(nr,c);else moves.push([nr,c]);}break;}nr+=dir;}
      break;
    }
    case'a':{for(const[dr,dc]of ADVISOR_MOVES){const nr=r+dr,nc=c+dc;if(inPalace(nr,nc,red))add(nr,nc);}break;}
    case'e':{for(const[dr,dc,br,bc]of ELEPHANT_MOVES){const nr=r+dr,nc=c+dc;if(!inBoard(nr,nc))continue;if(red&&nr<5)continue;if(!red&&nr>4)continue;if(board[r+br][c+bc]!==0)continue;add(nr,nc);}break;}
    case'h':{for(const[dr,dc,br,bc]of HORSE_MOVES){const nr=r+dr,nc=c+dc;if(!inBoard(nr,nc))continue;if(board[r+br][c+bc]!==0)continue;add(nr,nc);}break;}
    case'r':{for(const[dr,dc]of ROOK_DIRS){let nr=r+dr,nc=c+dc;while(inBoard(nr,nc)&&add(nr,nc)){nr+=dr;nc+=dc;}}break;}
    case'c':{
      for(const[dr,dc]of ROOK_DIRS){
        let nr=r+dr,nc=c+dc;
        while(inBoard(nr,nc)&&board[nr][nc]===0){if(flat)moves.push(nr,nc);else moves.push([nr,nc]);nr+=dr;nc+=dc;}
        if(!inBoard(nr,nc))continue;nr+=dr;nc+=dc;
        while(inBoard(nr,nc)){if(board[nr][nc]!==0){if(isEnemy(board[nr][nc],red)){if(flat)moves.push(nr,nc);else moves.push([nr,nc]);}break;}nr+=dr;nc+=dc;}
      }
      break;
    }
    case'p':{
      const fwd=red?-1:1;
      if(inBoard(r+fwd,c)){const t=board[r+fwd][c];if(!isOwn(t,red)){if(flat)moves.push(r+fwd,c);else moves.push([r+fwd,c]);}}
      if(crossedRiver(r,red)){for(const dc of[-1,1]){const nc=c+dc;if(inBoard(r,nc)){const t=board[r][nc];if(!isOwn(t,red)){if(flat)moves.push(r,nc);else moves.push([r,nc]);}}}}
      break;
    }
  }
  return moves;
}

function findKing(board,red){const k=red?'K':'k';for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(board[r][c]===k)return[r,c];return null;}

function squareAttacked(board,tr,tc,byRed){
  const rook=byRed?'R':'r',cannon=byRed?'C':'c',horse=byRed?'H':'h',pawn=byRed?'P':'p',adv=byRed?'A':'a',king=byRed?'K':'k';
  for(const[dr,dc]of ROOK_DIRS){let nr=tr+dr,nc=tc+dc,blocked=false;while(inBoard(nr,nc)){const p=board[nr][nc];if(p!==0){if(!blocked){if(p===rook)return true;blocked=true;}else{if(p===cannon)return true;break;}}nr+=dr;nc+=dc;}}
  for(const[dr,dc,br,bc]of HORSE_MOVES){const hr=tr-dr,hc=tc-dc;if(!inBoard(hr,hc))continue;if(board[hr][hc]===horse&&board[tr-br][tc-bc]===0)return true;}
  if(byRed){if(tr+1<ROWS&&board[tr+1][tc]===pawn)return true;if(tr<=4){if(tc-1>=0&&board[tr][tc-1]===pawn)return true;if(tc+1<COLS&&board[tr][tc+1]===pawn)return true;}}
  else{if(tr-1>=0&&board[tr-1][tc]===pawn)return true;if(tr>=5){if(tc-1>=0&&board[tr][tc-1]===pawn)return true;if(tc+1<COLS&&board[tr][tc+1]===pawn)return true;}}
  for(const[dr,dc]of ADVISOR_MOVES){const ar=tr+dr,ac=tc+dc;if(inBoard(ar,ac)&&board[ar][ac]===adv)return true;}
  for(const[dr,dc]of KING_MOVES){const kr=tr+dr,kc=tc+dc;if(inBoard(kr,kc)&&board[kr][kc]===king)return true;}
  const dir=byRed?1:-1;let nr=tr+dir;while(inBoard(nr,tc)){const p=board[nr][tc];if(p!==0){if(p===king)return true;break;}nr+=dir;}
  return false;
}

function inCheck(board,red){const kp=findKing(board,red);if(!kp)return true;return squareAttacked(board,kp[0],kp[1],!red);}

function makeMove(board,fr,fc,tr,tc){const captured=board[tr][tc],piece=board[fr][fc];board[tr][tc]=piece;board[fr][fc]=0;return{fr,fc,tr,tc,piece,captured};}
function unmakeMove(board,h){board[h.fr][h.fc]=h.piece;board[h.tr][h.tc]=h.captured;}

function computePinnedBB(board,red,kp){
  let pinned=0n;if(!kp)return pinned;const[kr,kc]=kp;
  const eRook=red?'r':'R',eCannon=red?'c':'C',eKing=red?'k':'K';
  for(const[dr,dc]of ROOK_DIRS){let nr=kr+dr,nc=kc+dc,blocker=null,blockers=0;while(inBoard(nr,nc)){const p=board[nr][nc];if(p!==0){if(isOwn(p,red)){blockers++;if(blockers===1)blocker=[nr,nc];else break;}else{if(p===eRook&&blockers===1)pinned|=(1n<<BigInt(blocker[0]*9+blocker[1]));break;}}nr+=dr;nc+=dc;}}
  // A4 炮牵制：king — own_piece — 任意子 — enemy_cannon → own_piece 被牵制
  for(const[dr,dc]of ROOK_DIRS){let nr=kr+dr,nc=kc+dc,firstOwn=null,passedScreen=false;while(inBoard(nr,nc)){const p=board[nr][nc];if(p!==0){if(!firstOwn){if(!isOwn(p,red))break;firstOwn=[nr,nc];}else if(!passedScreen){passedScreen=true;}else{if(p===eCannon)pinned|=(1n<<BigInt(firstOwn[0]*9+firstOwn[1]));break;}}nr+=dr;nc+=dc;}}
  const fdir=red?-1:1;let fnr=kr+fdir,between=null,found=false;
  while(inBoard(fnr,kc)){const p=board[fnr][kc];if(p!==0){if(p===eKing){found=true;break;}if(between){between=null;break;}between=[fnr,kc];}fnr+=fdir;}
  if(found&&between)pinned|=(1n<<BigInt(between[0]*9+between[1]));
  return pinned;
}

function isLegalMove(board,fr,fc,tr,tc){const p=board[fr][fc];if(!p)return false;const red=isRed(p);const h=makeMove(board,fr,fc,tr,tc);const ok=!inCheck(board,red);unmakeMove(board,h);return ok;}

function _genMoves(board,red,capturesOnly){
  const list=[];const kp=findKing(board,red);if(!kp)return list;
  const inChk=squareAttacked(board,kp[0],kp[1],!red);
  let pinnedBB=0n;if(!inChk)pinnedBB=computePinnedBB(board,red,kp);
  const _mv=[];
  for(let r=0;r<ROWS;r++){const row=board[r];for(let c=0;c<COLS;c++){const p=row[c];if(!p||!isOwn(p,red))continue;
      _mv.length=0;pseudoMoves(board,r,c,_mv);
      const pType=p.toLowerCase(),isK=pType==='k',isP=!isK&&!!((pinnedBB>>BigInt(r*9+c))&1n);
      for(let i=0;i<_mv.length;i+=2){const tr=_mv[i],tc=_mv[i+1];
        if(capturesOnly&&board[tr][tc]===0)continue;
        let legal;
        if(!inChk&&!isK&&!isP){legal=true;}
        else{const h=makeMove(board,r,c,tr,tc);const np=isK?findKing(board,red):kp;legal=np?!squareAttacked(board,np[0],np[1],!red):false;unmakeMove(board,h);}
        if(legal)list.push([r,c,tr,tc]);
  }}}return list;
}

function allLegalMoves(board,red){return _genMoves(board,red,false);}
function legalCaptures(board,red){return _genMoves(board,red,true);}

function gameStatus(board,redToMove){const moves=allLegalMoves(board,redToMove);if(moves.length===0)return inCheck(board,redToMove)?'checkmate':'stalemate';return'normal';}

const CN_NAME={'R':'车','H':'马','E':'相','A':'仕','K':'帅','C':'炮','P':'兵','r':'车','h':'马','e':'象','a':'士','k':'将','c':'炮','p':'卒'};
