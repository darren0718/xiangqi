/**
 * 评估函数（主线程与 Worker 共享模块）
 *
 * 由 chess.js 提供：ROWS, COLS, PVAL, isRed, HORSE_MOVES, ROOK_DIRS, inBoard
 * 在主线程通过 <script> 加载，在 Worker 通过 importScripts 加载。
 */

// ========== PST ==========
const PST_R_OP=[[14,14,12,18,16,18,12,14,14],[16,20,18,24,28,24,18,20,16],[12,12,12,18,20,18,12,12,12],[12,18,16,22,22,22,16,18,12],[12,14,12,18,20,18,12,14,12],[12,16,14,20,20,20,14,16,12],[6,10,8,14,14,14,8,10,6],[4,8,6,14,12,14,6,8,4],[6,4,8,16,8,16,8,4,6],[-2,10,6,14,12,14,6,10,-2]];
const PST_R_EG=PST_R_OP.map(r=>r.map(v=>Math.floor(v*1.2)));
const PST_H=[[4,8,16,12,4,12,16,8,4],[4,10,28,16,8,16,28,10,4],[12,14,16,20,18,20,16,14,12],[8,24,18,24,20,24,18,24,8],[6,16,14,18,16,18,14,16,6],[4,12,16,14,12,14,16,12,4],[2,6,8,6,10,6,8,6,2],[4,2,8,8,4,8,8,2,4],[0,2,4,4,-2,4,4,2,0],[0,-4,0,0,0,0,0,-4,0]];
const PST_C_OP=[[6,4,0,-4,-6,-4,0,4,6],[2,2,0,-2,-6,-2,0,2,2],[2,2,0,-4,-8,-4,0,2,2],[0,0,-4,2,10,2,-4,0,0],[0,0,0,-2,4,-2,0,0,0],[-2,0,-2,4,4,4,-2,0,-2],[0,0,-2,0,-2,0,-2,0,0],[0,0,-2,0,-8,0,-2,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]];
const PST_C_EG=[[8,8,8,10,10,10,8,8,8],[6,8,10,12,14,12,10,8,6],[6,6,8,10,12,10,8,6,6],[4,6,6,8,10,8,6,6,4],[4,4,6,6,8,6,6,4,4],[2,4,4,4,6,4,4,4,2],[0,2,2,2,4,2,2,2,0],[-2,0,0,0,2,0,0,0,-2],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]];
const PST_A=[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,3,0,3,0,0,0],[0,0,0,0,8,0,0,0,0],[0,0,0,3,0,3,0,0,0]];
const PST_E=[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,6,0,0,0,6,0,0],[0,0,0,0,0,0,0,0,0],[8,0,0,0,10,0,0,0,8],[0,0,0,0,0,0,0,0,0],[0,0,4,0,0,0,4,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]];
const PST_P_OP=[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[2,0,4,0,10,0,4,0,2],[8,14,18,22,24,22,18,14,8],[0,10,14,18,16,18,14,10,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]];
const PST_P_EG=[[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[6,0,10,0,14,0,10,0,6],[14,20,24,28,30,28,24,20,14],[6,18,22,26,28,26,22,18,6],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]];

function gamePhase(board){let majors=0;for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const p=board[r][c];if(p&&'rRhHcC'.includes(p))majors++;}if(majors>=10)return 0;if(majors>=6)return 1;return 2;}
function pstVal(piece,r,c,phase){const type=piece.toLowerCase();const red=isRed(piece);const rr=red?ROWS-1-r:r;let tbl;switch(type){case'r':tbl=phase===2?PST_R_EG:PST_R_OP;break;case'h':tbl=PST_H;break;case'c':tbl=phase===2?PST_C_EG:PST_C_OP;break;case'a':tbl=PST_A;break;case'e':tbl=PST_E;break;case'p':tbl=phase===2?PST_P_EG:PST_P_OP;break;default:return 0;}const cc=red?COLS-1-c:c;return(tbl[rr]&&tbl[rr][cc]!=null)?tbl[rr][cc]:0;}

function horseLegs(board,r,c){let free=0;for(const[dr,dc,br,bc]of HORSE_MOVES){if(inBoard(r+br,c+bc)&&board[r+br][c+bc]===0)free++;}return free;}
function rookMobility(board,r,c){let m=0;for(const[dr,dc]of ROOK_DIRS){let nr=r+dr,nc=c+dc;while(inBoard(nr,nc)&&board[nr][nc]===0){m++;nr+=dr;nc+=dc;}if(inBoard(nr,nc)&&board[nr][nc]!==0)m++;}return m;}
function cannonMobility(board,r,c){let m=0;for(const[dr,dc]of ROOK_DIRS){let nr=r+dr,nc=c+dc,j=false;while(inBoard(nr,nc)){if(board[nr][nc]!==0){if(j){m++;break;}else j=true;}else if(!j)m++;nr+=dr;nc+=dc;}}return m;}

// ========== 评估函数 ==========
function evaluate(board){
  let score=0,redAE=0,blkAE=0;
  const redRooks=[],blkRooks=[],redCannons=[],blkCannons=[],redHorses=[],blkHorses=[],redPawns=[],blkPawns=[];
  let redMob=0,blkMob=0,redKing=[9,4],blkKing=[0,4];
  const phase=gamePhase(board);
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const p=board[r][c];if(!p)continue;const type=p.toLowerCase();const red=isRed(p);const sign=red?1:-1;score+=sign*(PVAL[type]+pstVal(p,r,c,phase));
    if(type==='k'){if(red)redKing=[r,c];else blkKing=[r,c];}else if(type==='a'||type==='e'){if(red)redAE++;else blkAE++;}
    else if(type==='r'){if(red)redRooks.push([r,c]);else blkRooks.push([r,c]);}else if(type==='c'){if(red)redCannons.push([r,c]);else blkCannons.push([r,c]);}
    else if(type==='h'){if(red)redHorses.push([r,c]);else blkHorses.push([r,c]);}else if(type==='p'){if(red)redPawns.push([r,c]);else blkPawns.push([r,c]);}}
  for(const[r,c]of redRooks)redMob+=rookMobility(board,r,c);for(const[r,c]of blkRooks)blkMob+=rookMobility(board,r,c);
  for(const[r,c]of redCannons)redMob+=cannonMobility(board,r,c);for(const[r,c]of blkCannons)blkMob+=cannonMobility(board,r,c);
  for(const[r,c]of redHorses)redMob+=horseLegs(board,r,c)*2;for(const[r,c]of blkHorses)blkMob+=horseLegs(board,r,c)*2;
  score+=(redMob-blkMob);score+=(redAE-blkAE)*15;
  function openFile(col,red){for(let r=0;r<ROWS;r++){const p=board[r][col];if(p&&p.toLowerCase()==='p'&&isRed(p)===red)return false;}return true;}
  for(const[r,c]of redRooks){if(openFile(c,true))score+=8;if(c===3||c===5)score+=6;if(r<=2)score+=5;}
  for(const[r,c]of blkRooks){if(openFile(c,false))score-=8;if(c===3||c===5)score-=6;if(r>=7)score-=5;}
  for(const[r,c]of redCannons){if(c===4&&r<5&&r>2)score+=6;if(r<=2)score+=4;}
  for(const[r,c]of blkCannons){if(c===4&&r>4&&r<7)score-=6;if(r>=7)score-=4;}
  for(const[r,c]of redPawns){if(r<=4){let paired=false;for(const[r2,c2]of redPawns){if(r2===r&&Math.abs(c2-c)===1){paired=true;break;}}if(paired)score+=6;if(c===4)score+=4;if(r===0)score-=20;}else if(r<=6)score+=1;}
  for(const[r,c]of blkPawns){if(r>=5){let paired=false;for(const[r2,c2]of blkPawns){if(r2===r&&Math.abs(c2-c)===1){paired=true;break;}}if(paired)score-=6;if(c===4)score-=4;if(r===9)score+=20;}else if(r>=3)score-=1;}
  for(const[r,c]of redHorses)score+=horseLegs(board,r,c);for(const[r,c]of blkHorses)score-=horseLegs(board,r,c);
  if(phase===2){const rkd=Math.abs(redKing[0]-4.5)+Math.abs(redKing[1]-4);const bkd=Math.abs(blkKing[0]-4.5)+Math.abs(blkKing[1]-4);score+=(bkd-rkd)*6;if(redKing[0]>=8)score-=5;if(blkKing[0]<=1)score+=5;}
  return score;
}
