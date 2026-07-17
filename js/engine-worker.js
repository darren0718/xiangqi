'use strict';
/**
 * 象棋 AI Worker（v3 优化版）
 *
 * 关键优化（累积）：
 * v1: squareAttacked 定向检测、Zobrist set 替 JSON.stringify、TT 不全清
 * v2: computePinnedBB 牵制检测、fastLegal 快速路径、legalCaptures 专用函数
 * v3: 扁平pseudoMoves数组减少GC、_genMoves 统一生成器
 */

importScripts('chess.js');
importScripts('evaluate.js');

const MATE = 60000;
const MATE_THRESHOLD = MATE - 200;
const INF = MATE + 1000;
const TT_SIZE = 1 << 19;

// ========== Zobrist ==========
let ZOB_PIECE, ZOB_SIDE;
function _r64(){return(BigInt(Math.floor(Math.random()*0x80000000))<<32n)|BigInt(Math.floor(Math.random()*0x80000000));}
function initZobrist(){
  ZOB_PIECE={};ZOB_SIDE=[_r64(),_r64()];
  for(const pc of['K','R','H','C','A','E','P','k','r','h','c','a','e','p']){
    ZOB_PIECE[pc]=[];
    for(let r=0;r<ROWS;r++){const row=new Array(COLS);for(let c=0;c<COLS;c++)row[c]=_r64();ZOB_PIECE[pc].push(row);}
  }
}
initZobrist();

function boardHash(board,redToMove){let h=0n;for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const p=board[r][c];if(p)h^=ZOB_PIECE[p][r][c];}h^=ZOB_SIDE[redToMove?1:0];return h;}

// ========== TT ==========
const tt=new Array(TT_SIZE);
function ttIdx(h){return Number(h&BigInt(TT_SIZE-1));}
function ttGet(h){const e=tt[ttIdx(h)];if(e&&e.h===h)return e;return null;}
function ttPut(h,d,f,v,mv){const i=ttIdx(h);const o=tt[i];if(!o||d>=o.d||o.f==='upper'||Math.random()<0.2)tt[i]={h,d,f,v,mv};}
function ttClear(){for(let i=0;i<TT_SIZE;i++)tt[i]=undefined;}

function isValidMove(board,red,mv){if(!mv)return false;const[fr,fc,tr,tc]=mv;if(!inBoard(fr,fc)||!inBoard(tr,tc))return false;const p=board[fr][fc];if(!p)return false;if(red&&!isRed(p))return false;if(!red&&!isBlack(p))return false;return isLegalMove(board,fr,fc,tr,tc);}

const searchStats={nodes:0,depth:0,bestMove:null,score:0,pv:[],timeMs:0};
let stopSearch=false,startTime=0;
const historyTable={};
function hKey(fr,fc,tr,tc){return fr*1000+fc*100+tr*10+tc;}
function hReset(){for(const k in historyTable)delete historyTable[k];}

function scoreMoves(board,moves,ttBest,k1,k2,counterMove){
  const n=moves.length;const scored=new Array(n);
  for(let i=0;i<n;i++){const[fr,fc,tr,tc]=moves[i];let s=0;
    if(ttBest&&ttBest[0]===fr&&ttBest[1]===fc&&ttBest[2]===tr&&ttBest[3]===tc)s=10000000;
    else{const victim=board[tr][tc],attacker=board[fr][fc];
      if(victim){s=500000+PVAL[victim.toLowerCase()]*16-PVAL[attacker.toLowerCase()];}
      else{if(k1&&k1[0]===fr&&k1[1]===fc&&k1[2]===tr&&k1[3]===tc)s=50000;else if(k2&&k2[0]===fr&&k2[1]===fc&&k2[2]===tr&&k2[3]===tc)s=40000;else if(counterMove&&counterMove[0]===fr&&counterMove[1]===fc&&counterMove[2]===tr&&counterMove[3]===tc)s=30000;else s=historyTable[hKey(fr,fc,tr,tc)]||0;}}
    scored[i]={mv:moves[i],s};}
  scored.sort((a,b)=>b.s-a.s);return scored;
}

function quiesce(board,alpha,beta,redToMove,depth,ply){
  searchStats.nodes++;
  const inChk=inCheck(board,redToMove);
  const standPat=(redToMove?1:-1)*evaluate(board);
  if(inChk){
    const moves=allLegalMoves(board,redToMove);
    if(moves.length===0)return-MATE+ply;let best=standPat;
    if(best<beta){for(const[fr,fc,tr,tc]of moves){const h=makeMove(board,fr,fc,tr,tc);const val=-quiesce(board,-beta,-alpha,!redToMove,depth-1,ply+1);unmakeMove(board,h);if(val>best)best=val;if(best>alpha)alpha=best;if(alpha>=beta)break;}}
    return best;}
  if(standPat>=beta)return beta;if(standPat>alpha)alpha=standPat;if(depth<-4)return alpha;
  const delta=1000;const capMoves=legalCaptures(board,redToMove);
  capMoves.sort((a,b)=>PVAL[board[b[2]][b[3]].toLowerCase()]*16-PVAL[board[a[2]][a[3]].toLowerCase()]*16-PVAL[board[b[0]][b[1]].toLowerCase()]+PVAL[board[a[0]][a[1]].toLowerCase()]);
  for(const[fr,fc,tr,tc]of capMoves){
    const vv=PVAL[board[tr][tc].toLowerCase()];if(standPat+vv+delta<alpha)continue;
    const h=makeMove(board,fr,fc,tr,tc);const val=-quiesce(board,-beta,-alpha,!redToMove,depth-1,ply+1);unmakeMove(board,h);
    if(val>=beta)return beta;if(val>alpha)alpha=val;}
  return alpha;
}

function negamax(board,depth,alpha,beta,redToMove,ply,killers,counterMoves,allowNull,isPV,repCount){
  searchStats.nodes++;
  if(repCount&&ply>0&&ply<2){const ck=boardHash(board,redToMove).toString();if((repCount.get(ck)||0)>=1)return 0;}
  alpha=Math.max(alpha,-MATE+ply);beta=Math.min(beta,MATE-ply-1);if(alpha>=beta)return alpha;
  if(depth<=0)return quiesce(board,alpha,beta,redToMove,0,ply);
  const hash=boardHash(board,redToMove);const tte=ttGet(hash);let ttBest=null;
  if(tte){ttBest=tte.mv;if(tte.d>=depth){if(tte.f==='exact')return tte.v;if(tte.f==='lower'&&tte.v>=beta)return tte.v;if(tte.f==='upper'&&tte.v<=alpha)return tte.v;}}
  const inChk=inCheck(board,redToMove);if(inChk)depth+=1;
  if(!isPV&&!inChk&&depth<=3){const sv=(redToMove?1:-1)*evaluate(board);if(sv+200*depth<alpha){const qv=quiesce(board,alpha,beta,redToMove,0,ply);if(qv<alpha)return qv;}}
  if(allowNull&&!inChk&&depth>=3&&gamePhase(board)!==2&&!isPV){const R=depth>=5?3:2;const val=-negamax(board,depth-1-R,-beta,-beta+1,!redToMove,ply+1,killers,counterMoves,false,false,repCount);if(val>=beta)return beta;}
  let futile=false;if(!isPV&&!inChk&&depth<=4){const sv=(redToMove?1:-1)*evaluate(board);const fm=150+100*depth;if(sv+fm<alpha)futile=true;}
  if(!ttBest&&depth>=4){const sk=new Array(128).fill(null);negamax(board,depth-2,alpha,beta,redToMove,ply,sk,counterMoves,true,false,repCount);const sh=ttGet(hash);if(sh&&isValidMove(board,redToMove,sh.mv))ttBest=sh.mv;}
  const allMoves=allLegalMoves(board,redToMove);if(allMoves.length===0)return inChk?-MATE+ply:0;
  const k1=killers[ply*2],k2=killers[ply*2+1];const prev=ply>0?counterMoves[ply-1]:null;const cm=prev?counterMoves[hKey(prev[0],prev[1],prev[2],prev[3])]:null;
  const scored=scoreMoves(board,allMoves,ttBest,k1,k2,cm);
  let bestVal=-INF,bestMove=scored[0].mv,ttFlag='upper',movesDone=0;
  for(const{mv}of scored){const[fr,fc,tr,tc]=mv;const isCap=board[tr][tc]!==0;
    if(futile&&!isCap&&!inChk&&movesDone>0)continue;
    const h=makeMove(board,fr,fc,tr,tc);const gc=inCheck(board,!redToMove);movesDone++;
    let val,sd=depth-1;
    if(movesDone===1){val=-negamax(board,sd,-beta,-alpha,!redToMove,ply+1,killers,counterMoves,true,isPV,repCount);}
    else{let red=0;if(depth>=3&&movesDone>3&&!isCap&&!gc&&!inChk){red=Math.min(depth-2,1+Math.floor(Math.log(movesDone)*Math.log(depth)/4));if(isPV)red=Math.max(0,red-1);}
      val=-negamax(board,sd-red,-alpha-1,-alpha,!redToMove,ply+1,killers,counterMoves,true,false,repCount);
      if(red>0&&val>alpha)val=-negamax(board,sd,-alpha-1,-alpha,!redToMove,ply+1,killers,counterMoves,true,false,repCount);
      if(val>alpha&&val<beta)val=-negamax(board,sd,-beta,-alpha,!redToMove,ply+1,killers,counterMoves,true,isPV,repCount);}
    unmakeMove(board,h);
    if(val>bestVal){bestVal=val;bestMove=mv;if(val>alpha){alpha=val;ttFlag='exact';}}
    if(alpha>=beta){if(!isCap){killers[ply*2+1]=killers[ply*2];killers[ply*2]=mv;historyTable[hKey(fr,fc,tr,tc)]=(historyTable[hKey(fr,fc,tr,tc)]||0)+depth*depth;}
      if(!isCap&&prev)counterMoves[hKey(prev[0],prev[1],prev[2],prev[3])]=mv;ttFlag='lower';break;}}
  ttPut(hash,depth,ttFlag,bestVal,bestMove);return bestVal;
}

function extractPV(board,redToMove,maxPly){const pv=[];const tmp=cloneBoard(board);let turn=redToMove;const visited=new Set();for(let i=0;i<maxPly;i++){const h=boardHash(tmp,turn);if(visited.has(h.toString()))break;visited.add(h.toString());const tte=ttGet(h);if(!tte||!tte.mv)break;const[fr,fc,tr,tc]=tte.mv;const p=tmp[fr][fc];if(!p)break;if((turn&&!isRed(p))||(!turn&&!isBlack(p)))break;if(!isLegalMove(tmp,fr,fc,tr,tc))break;pv.push([fr,fc,tr,tc]);makeMove(tmp,fr,fc,tr,tc);turn=!turn;}return pv;}

function aiMove(board,aiIsRed,maxDepth,onProgress,moveHistory,timeLimitMs){
  const killers=new Array(128).fill(null);const counterMoves={};let bestMove=null,bestVal=0;
  // 时间预算：maxDepth 已不再是硬性停止条件，仅作为"最小搜索深度"
  // 引擎在 timeLimit 内会一直加深；只要深度 >= maxDepth 且超时才停，否则继续往深搜
  startTime=Date.now();const timeLimit=timeLimitMs||(maxDepth>=5?8000:maxDepth>=4?4000:maxDepth>=3?1500:500);
  stopSearch=false;searchStats.nodes=0;searchStats.pv=[];
  const bm=bookMove(board,aiIsRed,moveHistory||[]);if(bm&&isLegalMove(board,bm[0],bm[1],bm[2],bm[3])){return{bestMove:bm,score:0,depth:0,nodes:1,timeMs:0,pv:[bm]};}
  const legal=allLegalMoves(board,aiIsRed);if(legal.length===0)return null;if(legal.length===1)return{bestMove:legal[0],score:0,depth:maxDepth,nodes:1,timeMs:0,pv:[legal[0]]};
  // Repetition detection with Zobrist hash
  const repCount=new Map();
  if(moveHistory&&moveHistory.length>0){const tb=cloneBoard(INITIAL_BOARD);let turn=true;repCount.set(boardHash(tb,turn).toString(),1);for(const[fr,fc,tr,tc]of moveHistory){if(tb[fr][fc]){makeMove(tb,fr,fc,tr,tc);turn=!turn;const kh=boardHash(tb,turn).toString();repCount.set(kh,(repCount.get(kh)||0)+1);}}}
  let alpha=-INF,beta=INF;
  // 上限：maxDepth + 8，避免极端局面无限加深（保护性硬上限，正常情况下时间先到）
  const hardDepthCap = maxDepth + 8;
  for(let depth=1;depth<=hardDepthCap;depth++){if(stopSearch)break;
    if(depth>1&&bestMove){const asp=60;alpha=bestVal-asp;beta=bestVal+asp;}else{alpha=-INF;beta=INF;}
    let val=negamax(board,depth,alpha,beta,aiIsRed,0,killers,counterMoves,true,true,repCount);
    if(val<=alpha||val>=beta){alpha=-INF;beta=INF;val=negamax(board,depth,alpha,beta,aiIsRed,0,killers,counterMoves,true,true,repCount);}
    bestVal=val;const rootHash=boardHash(board,aiIsRed);const tte=ttGet(rootHash);if(tte&&isValidMove(board,aiIsRed,tte.mv))bestMove=tte.mv;
    const elapsed=Date.now()-startTime;const pv=extractPV(board,aiIsRed,Math.min(depth+3,20));
    searchStats.depth=depth;searchStats.bestMove=bestMove;searchStats.score=aiIsRed?bestVal:-bestVal;searchStats.pv=pv;searchStats.timeMs=elapsed;
    if(onProgress)onProgress({depth,nodes:searchStats.nodes,timeMs:elapsed,score:searchStats.score,pv,bestMove});
    // 停止条件：
    // 1) 已找到将杀路线（|bestVal|>MATE_THRESHOLD），不必再搜
    // 2) 超过时间预算 且 已达到最小搜索深度（maxDepth）—— maxDepth 是"服务质量下限"而非"搜索上限"
    // 3) 静态搜索时间已用满 3*timeLimit 仍未到 maxDepth，强行返回（防止 maxDepth 设过高时卡死）
    if(Math.abs(bestVal)>MATE_THRESHOLD)break;
    if(elapsed>timeLimit && depth>=maxDepth)break;
    if(elapsed>timeLimit*3)break;
  }
  if(!isValidMove(board,aiIsRed,bestMove))bestMove=legal[0];
  return{bestMove,score:bestVal,depth:searchStats.depth,nodes:searchStats.nodes,timeMs:Date.now()-startTime,pv:searchStats.pv};
}

function bookMove(board,aiIsRed,hist){
  if(hist.length>=4)return null;
  if(hist.length===0&&aiIsRed){const ops=[[7,7,7,4],[7,1,7,4],[9,1,7,2],[9,7,7,6],[6,2,5,2],[6,6,5,6],[6,4,5,4],[9,2,7,4]];return ops[Math.floor(Math.random()*ops.length)];}
  if(hist.length===1&&!aiIsRed){const first=hist[0];
    if((first[0]===7&&first[1]===7&&first[2]===7&&first[3]===4)||(first[0]===7&&first[1]===1&&first[2]===7&&first[3]===4)){const res=[[0,1,2,2],[0,7,2,6],[2,1,2,4],[2,7,2,4],[3,4,4,4]];return res[Math.floor(Math.random()*res.length)];}
    if((first[0]===9&&first[1]===1&&first[2]===7&&first[3]===2)||(first[0]===9&&first[1]===7&&first[2]===7&&first[3]===6))return[0,1,2,2];
    if(first[0]===6&&first[3]===5)return[3,4,4,4];}
  return null;
}

self.onmessage=function(e){const msg=e.data;
  if(msg.type==='search'){stopSearch=false;hReset();searchStats.nodes=0;startTime=Date.now();
    const result=aiMove(msg.board,msg.redToMove,msg.depth,(stats)=>postMessage({type:'progress',...stats}),msg.moveHistory||[],msg.timeLimit||(msg.depth>=5?3000:msg.depth>=4?1500:msg.depth>=3?600:200));
    postMessage({type:'result',...result});}
  else if(msg.type==='stop')stopSearch=true;
  else if(msg.type==='newgame'){ttClear();hReset();}
};
