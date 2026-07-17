/**
 * xiangqi 本地服务器
 * 功能：
 *   - 静态托管当前目录（等价 python3 -m http.server）
 *   - 后端记录对局：POST /api/games/{start,move,end}
 *     数据以行式 JSON 追加写入 logs/games.jsonl
 * 零依赖，仅使用 Node.js 内置模块。
 * 用法：node server.js [port]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'games.jsonl');
const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.map':  'application/json',
  '.txt':  'text/plain; charset=utf-8',
};

function safeJoin(root, reqPath) {
  const clean = path.normalize(reqPath).replace(/^([\\/])+/, '');
  const full = path.join(root, clean);
  if (!full.startsWith(root)) return null;
  return full;
}

function appendLog(record) {
  // 单行 JSON，追加写；失败静默忽略但打 console.error
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n';
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch (e) {
    console.error('[log] append failed:', e.message);
  }
}

function readJsonBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function handleApi(req, res, pathname) {
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'method not allowed' }); return; }
  let body;
  try { body = await readJsonBody(req); }
  catch (e) { sendJson(res, 400, { error: 'invalid json: ' + e.message }); return; }

  const gid = body.gameId;
  if (!gid || typeof gid !== 'string') { sendJson(res, 400, { error: 'gameId required' }); return; }

  if (pathname === '/api/games/start') {
    appendLog({
      event: 'start',
      gameId: gid,
      playerRed: !!body.playerRed,
      aiDepth: body.aiDepth ?? null,
      initialBoard: body.initialBoard ?? null,
      ua: (req.headers['user-agent'] || '').slice(0, 200),
    });
    sendJson(res, 200, { ok: true });
    return;
  }
  if (pathname === '/api/games/move') {
    appendLog({
      event: 'move',
      gameId: gid,
      ply: body.ply ?? null,
      side: body.side ?? null,          // 'red' | 'black'
      by: body.by ?? null,              // 'human' | 'ai'
      move: body.move ?? null,          // [fr,fc,tr,tc]
      moveChinese: body.moveChinese ?? null,
      piece: body.piece ?? null,
      captured: body.captured ?? null,
      score: body.score ?? null,        // AI 时的分数（红方视角 cp）
      depth: body.depth ?? null,
      timeMs: body.timeMs ?? null,
      nodes: body.nodes ?? null,
    });
    sendJson(res, 200, { ok: true });
    return;
  }
  if (pathname === '/api/games/end') {
    appendLog({
      event: 'end',
      gameId: gid,
      result: body.result ?? null,      // 'red_win' | 'black_win' | 'draw_rep' | 'draw_stalemate' | 'aborted'
      reason: body.reason ?? null,
      plies: body.plies ?? null,
    });
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 404, { error: 'not found' });
}

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  const full = safeJoin(ROOT, pathname);
  if (!full) { res.writeHead(400); res.end('bad path'); return; }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(full).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': st.size,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(full).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname || '/';
  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('method not allowed'); return; }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`xiangqi 服务器已启动: http://127.0.0.1:${PORT}`);
  console.log(`对局日志: ${LOG_FILE}`);
});
