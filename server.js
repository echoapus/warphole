const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
// Native Router and Static File Server
const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url;

  // Static File Server
  const safeSuffix = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safeSuffix);

  // Prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Determine Content-Type
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'text/html';
    if (ext === '.css') contentType = 'text/css';
    else if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.json') contentType = 'application/json';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.svg') contentType = 'image/svg+xml';

    res.writeHead(200, { 'Content-Type': contentType });
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 WARPHole Web App running at http://localhost:${PORT}`);
  console.log(`--------------------------------------------------`);
  console.log(`- Zero Dependencies, ultra-fast latency scans`);
  console.log(`- Client-side scan (ping from browser)`);
  console.log(`==================================================`);
});
