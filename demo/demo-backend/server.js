const http = require('http');

const port = process.env.PORT || 4001;

const server = http.createServer((req, res) => {
  console.log(`[demo-backend] ${req.method} ${req.url}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, from: 'demo-backend', time: new Date().toISOString() }));
});

server.listen(port, () => {
  console.log(`demo-backend listening on http://localhost:${port}`);
});
