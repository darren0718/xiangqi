/**
 * Canvas 棋盘绘制与点击交互
 */

const MARGIN = 30;       // 棋盘边距
const CELL = 60;         // 格子大小
const PIECE_R = 26;      // 棋子半径

function colX(c) { return MARGIN + c * CELL; }
function rowY(r) { return MARGIN + r * CELL; }
function posFromXY(x, y, flipped) {
  let c, r;
  if (flipped) {
    c = COLS - 1 - Math.round((x - MARGIN) / CELL);
    r = ROWS - 1 - Math.round((y - MARGIN) / CELL);
  } else {
    c = Math.round((x - MARGIN) / CELL);
    r = Math.round((y - MARGIN) / CELL);
  }
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
  const drawC = flipped ? (COLS - 1 - c) : c;
  const drawR = flipped ? (ROWS - 1 - r) : r;
  const cx = colX(drawC), cy = rowY(drawR);
  const dx = x - cx, dy = y - cy;
  if (dx*dx + dy*dy > PIECE_R*PIECE_R) return null;
  return [r, c];
}

function drawBoard(ctx, board, selected, legalTargets, lastMove, flipped, pvMoves) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#f0c78a';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  function fx(c) { return flipped ? colX(COLS - 1 - c) : colX(c); }
  function fy(r) { return flipped ? rowY(ROWS - 1 - r) : rowY(r); }

  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth = 1.5;

  // 横线
  for (let r = 0; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(fx(0), fy(r));
    ctx.lineTo(fx(COLS-1), fy(r));
    ctx.stroke();
  }
  // 竖线
  for (let c = 0; c < COLS; c++) {
    if (c === 0 || c === COLS-1) {
      ctx.beginPath();
      ctx.moveTo(fx(c), fy(0));
      ctx.lineTo(fx(c), fy(ROWS-1));
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(fx(c), fy(0));
      ctx.lineTo(fx(c), fy(4));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx(c), fy(5));
      ctx.lineTo(fx(c), fy(ROWS-1));
      ctx.stroke();
    }
  }

  // 九宫斜线
  ctx.beginPath();
  if (flipped) {
    ctx.moveTo(fx(3), fy(7)); ctx.lineTo(fx(5), fy(9));
    ctx.moveTo(fx(5), fy(7)); ctx.lineTo(fx(3), fy(9));
    ctx.moveTo(fx(3), fy(0)); ctx.lineTo(fx(5), fy(2));
    ctx.moveTo(fx(5), fy(0)); ctx.lineTo(fx(3), fy(2));
  } else {
    ctx.moveTo(colX(3), rowY(0)); ctx.lineTo(colX(5), rowY(2));
    ctx.moveTo(colX(5), rowY(0)); ctx.lineTo(colX(3), rowY(2));
    ctx.moveTo(colX(3), rowY(7)); ctx.lineTo(colX(5), rowY(9));
    ctx.moveTo(colX(5), rowY(7)); ctx.lineTo(colX(3), rowY(9));
  }
  ctx.stroke();

  // 楚河汉界
  ctx.fillStyle = '#5a3a1a';
  ctx.font = 'bold 28px "KaiTi","STKaiti","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (flipped) {
    ctx.fillText('楚 河', fx(6.5), fy(4.5));
    ctx.fillText('汉 界', fx(1.5), fy(4.5));
  } else {
    ctx.fillText('楚 河', colX(1.5), rowY(4.5));
    ctx.fillText('汉 界', colX(6.5), rowY(4.5));
  }

  // 上一步标记
  if (lastMove) {
    ctx.strokeStyle = 'rgba(0,150,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(fx(lastMove.fc)-PIECE_R-2, fy(lastMove.fr)-PIECE_R-2, PIECE_R*2+4, PIECE_R*2+4);
    ctx.strokeRect(fx(lastMove.tc)-PIECE_R-2, fy(lastMove.tr)-PIECE_R-2, PIECE_R*2+4, PIECE_R*2+4);
  }

  // PV 箭头
  if (pvMoves && pvMoves.length > 0) {
    const arrowRGB = [
      [0, 180, 70],
      [220, 80, 0],
    ];
    const maxArrows = Math.min(pvMoves.length, 2);
    for (let i = 0; i < maxArrows; i++) {
      const [RGBr, RGBg, RGBb] = arrowRGB[i % 2];
      const [fr, fc, tr, tc] = pvMoves[i];
      const x1 = fx(fc), y1 = fy(fr);
      const x2 = fx(tc), y2 = fy(tr);
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      const offset = 10;
      const ux = dx / len, uy = dy / len;
      const sx = x1 + ux * offset, sy = y1 + uy * offset;
      const ex = x2 - ux * offset, ey = y2 - uy * offset;

      ctx.beginPath();
      ctx.arc(x1, y1, 9, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${RGBr},${RGBg},${RGBb},0.18)`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x1, y1, 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${RGBr},${RGBg},${RGBb},0.55)`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x1, y1, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${RGBr},${RGBg},${RGBb},0.85)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x2, y2, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${RGBr},${RGBg},${RGBb},0.3)`;
      ctx.fill();

      const grad = ctx.createLinearGradient(sx, sy, ex, ey);
      grad.addColorStop(0, `rgba(${RGBr},${RGBg},${RGBb},0.35)`);
      grad.addColorStop(0.5, `rgba(${RGBr},${RGBg},${RGBb},0.55)`);
      grad.addColorStop(1, `rgba(${RGBr},${RGBg},${RGBb},0.75)`);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = `rgba(${RGBr},${RGBg},${RGBb},0.10)`;
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = `rgba(${RGBr},${RGBg},${RGBb},0.85)`;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      const headLen = 22;
      const ang = Math.atan2(dy, dx);
      const a1 = ang + Math.PI * 0.75;
      const a2 = ang - Math.PI * 0.75;
      const hx1 = ex + headLen * Math.cos(a1);
      const hy1 = ey + headLen * Math.sin(a1);
      const hx2 = ex + headLen * Math.cos(a2);
      const hy2 = ey + headLen * Math.sin(a2);

      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(hx1, hy1);
      ctx.lineTo(hx2, hy2);
      ctx.closePath();
      ctx.fillStyle = `rgba(${RGBr},${RGBg},${RGBb},0.2)`;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + 16 * Math.cos(a1), ey + 16 * Math.sin(a1));
      ctx.lineTo(ex + 16 * Math.cos(a2), ey + 16 * Math.sin(a2));
      ctx.closePath();
      ctx.fillStyle = `rgba(${RGBr},${RGBg},${RGBb},0.6)`;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + 10 * Math.cos(a1), ey + 10 * Math.sin(a1));
      ctx.lineTo(ex + 10 * Math.cos(a2), ey + 10 * Math.sin(a2));
      ctx.closePath();
      ctx.fillStyle = `rgba(${RGBr},${RGBg},${RGBb},0.85)`;
      ctx.fill();
    }
  }

  // 合法走法提示
  if (legalTargets) {
    ctx.fillStyle = 'rgba(0,180,0,0.35)';
    for (const [tr,tc] of legalTargets) {
      ctx.beginPath();
      ctx.arc(fx(tc), fy(tr), 8, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // 棋子
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    const p = board[r][c];
    if (!p) continue;
    drawPiece(ctx, fx(c), fy(r), p, selected && selected[0]===r && selected[1]===c);
  }
}

function drawPiece(ctx, x, y, p, selected) {
  const red = isRed(p);
  // 阴影
  ctx.beginPath();
  ctx.arc(x+2, y+3, PIECE_R, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();
  // 棋子底
  ctx.beginPath();
  ctx.arc(x, y, PIECE_R, 0, Math.PI*2);
  const grad = ctx.createRadialGradient(x-5, y-5, 5, x, y, PIECE_R);
  grad.addColorStop(0, '#fff8e8');
  grad.addColorStop(1, '#e8c878');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = red ? '#b22222' : '#1a1a1a';
  ctx.lineWidth = selected ? 3 : 2;
  ctx.stroke();
  // 内圈
  ctx.beginPath();
  ctx.arc(x, y, PIECE_R-5, 0, Math.PI*2);
  ctx.strokeStyle = red ? '#b22222' : '#1a1a1a';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 字
  ctx.fillStyle = red ? '#b22222' : '#1a1a1a';
  ctx.font = 'bold 26px "KaiTi","STKaiti","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(CN_NAME[p], x, y+1);

  if (selected) {
    ctx.strokeStyle = 'rgba(255,50,50,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, PIECE_R+3, 0, Math.PI*2);
    ctx.stroke();
  }
}

// 走法转中文描述（简化版：棋子 + 起点列 + 动作 + 终点列）
function moveToChinese(fr, fc, tr, tc, piece, board) {
  const red = isRed(piece);
  const name = CN_NAME[piece];
  // 列号（红方从右往左1-9，黑方从右往左1-9）
  const colNum = (c, r) => {
    if (red) return (9 - c);
    return (c + 1);
  };
  const action = (tr === fr) ? '平' : (red ? (tr < fr ? '进' : '退') : (tr > fr ? '进' : '退'));
  const from = colNum(fc, fr);
  if (action === '平') {
    return `${name}${cnNum(from)}${action}${cnNum(colNum(tc, tr))}`;
  }
  // 进/退：同行列不同的同子时给步数，否则给列号
  const steps = Math.abs(tr - fr);
  return `${name}${cnNum(from)}${action}${cnNum(steps)}`;
}

function cnNum(n) {
  const arr = ['零','一','二','三','四','五','六','七','八','九'];
  return arr[n] || String(n);
}
