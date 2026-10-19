/**
 * Minimal static file server for local development.
 *
 * index.html also works opened straight from disk; serving it is closer to
 * how it runs once hosted. No dependencies — just:
 *
 *   node tools/serve.mjs          → http://localhost:8080
 *   node tools/serve.mjs 3000     → a different port
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

const server = http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url === '/' ? 'index.html' : url);

    // Keep requests inside the project directory.
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found: ' + url);
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  Port ${PORT} is already in use.\n` +
        `  Something else is running there — maybe this server in another window.\n\n` +
        `  Try a different port:   run.bat ${PORT + 1}\n`
    );
  } else {
    console.error(`\n  Could not start the server: ${err.message}\n`);
  }
  process.exit(1);
});
