// Solmar Heat — local development server.
//   node serve.ts [--port 8080]
// Serves only the game/ folder beside this file, with the MIME types a
// browser game needs, and refuses any path that climbs out of game/.
// A convenience for playing the entry locally; the hand-in is main.ts.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game/', import.meta.url)));
const portArg = process.argv.indexOf('--port');
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.css': 'text/css',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';
  const file = resolve(join(root, '.' + path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
server.listen(port, () => {
  console.log(`solmar-heat: serving game/ at http://localhost:${port}`);
});
