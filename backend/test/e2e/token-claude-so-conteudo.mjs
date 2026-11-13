// e2e (ADR 0007): o token do Claude (fk_pat_) só acessa o MCP e o conteúdo; o resto da API é proibido.
// Uso: API rodando (API_URL, padrão http://localhost:3000/api) e um MASTER de teste.
//   MASTER_EMAIL=... MASTER_PASSWORD=... node test/e2e/token-claude-so-conteudo.mjs
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ROOT = API.replace(/\/api\/?$/, '');
let fails = 0, total = 0;
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 200) : ''}`); if (!c) fails++; };
const call = async (method, url, token, body) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 120); }
  return { status: r.status, body: j };
};

const login = await call('POST', `${API}/auth/login`, null, { email: process.env.MASTER_EMAIL ?? 'master@folks.com.br', password: process.env.MASTER_PASSWORD ?? 'TroqueEssaSenha123' });
const M = login.body.accessToken;
ok(!!M, 'MASTER faz login');
const created = await call('POST', `${API}/master/api-tokens`, M, { name: 'e2e token só conteúdo', expiresInDays: 1 });
const PAT = created.body.token;
ok(created.status === 201 && PAT?.startsWith('fk_pat_'), 'MASTER gera token do Claude');
ok(JSON.stringify(created.body.scopes) === JSON.stringify(['content:write', 'content:read']), 'token novo tem só permissão de conteúdo', created.body.scopes);

// permitido: conteúdo e MCP
ok((await call('GET', `${API}/master/content/planets`, PAT)).status === 200, 'token lê planetas (conteúdo)');
ok((await call('GET', `${API}/master/content/imports`, PAT)).status === 200, 'token lê importações (conteúdo)');
const mcp = await call('POST', `${ROOT}/mcp`, PAT, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } } });
ok(mcp.status < 400, 'token conversa com o servidor MCP', mcp.status);

// proibido: relatórios, pessoas, financeiro, gestão
for (const [m, path, label] of [
  ['GET', '/dashboards/master', 'relatórios do MASTER'],
  ['GET', '/master/users', 'dados de pessoas'],
  ['GET', '/master/tenants', 'empresas'],
  ['GET', '/master/billing/payments', 'financeiro'],
  ['GET', '/master/api-tokens', 'tokens'],
  ['POST', '/master/masters', 'criar Master'],
  ['GET', '/me', 'perfil do dono'],
]) {
  const r = await call(m, `${API}${path}`, PAT, m === 'POST' ? { name: 'x', email: 'x@x.example' } : undefined);
  ok(r.status === 403, `token NÃO acessa ${label} (403)`, r.status);
}

// revogado: para de funcionar
await call('DELETE', `${API}/master/api-tokens/${created.body.id}`, M);
ok((await call('GET', `${API}/master/content/planets`, PAT)).status === 401, 'token revogado deixa de funcionar (401)');

console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
