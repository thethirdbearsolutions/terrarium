// Serves Terrarium and its sibling app repos from one origin, so the shell
// frames local copies: node tools/dev.mjs [port]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPOS = ['terrarium', 'hardreturn', 'bingleball', 'magnimarbles', 'turtlebloom', 'webturtles'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.bmp': 'image/bmp', '.gif': 'image/gif' };
const port = Number(process.argv[2] || 8077);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(302, { location: '/terrarium/' }); return res.end(); }
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
  const repo = path.split('/')[0];
  if (!REPOS.includes(repo) || path.split('/').some(p => p.startsWith('.'))) { res.writeHead(404); return res.end('not here'); }
  let file = join(CODE, path);
  try {
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(302, { location: url.pathname + '/' }); return res.end(); }
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/terrarium/`));
