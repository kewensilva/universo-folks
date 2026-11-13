// API externa simulada para testes (ex.: Vimeo/Asaas). Registra as chamadas em GET /_calls.
// Uso: node mock-api.mjs  -> http://localhost:4010 ; passe XXX_API_URL=http://localhost:4010/<prefixo>
import http from 'node:http';
const calls = [];
const routes = {
  // 'GET /exemplo/recurso': (req, body, url) => [200, { ok: true }],
};
http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method, path: url.pathname + url.search, body, headers: req.headers });
    if (url.pathname === '/_calls') return void res.end(JSON.stringify(calls));
    const handler = routes[`${req.method} ${url.pathname}`];
    const [status, payload] = handler ? handler(req, body, url) : [404, { error: 'rota não simulada' }];
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(payload === undefined ? '' : JSON.stringify(payload));
  });
}).listen(Number(process.env.MOCK_PORT ?? 4010), () => console.log('mock em http://localhost:' + (process.env.MOCK_PORT ?? 4010)));
