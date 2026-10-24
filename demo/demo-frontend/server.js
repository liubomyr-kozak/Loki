const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 4002;
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'));

const server = http.createServer((req, res) => {
  console.log(`[demo-frontend] ${req.method} ${req.url}`);
  res.setHeader('Content-Type', 'text/html');
  res.end(indexHtml);
});

server.listen(port, () => {
  console.log(`demo-frontend listening on http://localhost:${port}`);
});
