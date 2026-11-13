// Roteiro e2e — copie, renomeie e preencha um ok() por critério de aceite.
const API = process.env.API_URL ?? 'http://localhost:3000/api';
let fails = 0;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}${extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 200) : ''}`);
  if (!cond) fails++;
};
async function call(method, path, token, body, headers = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
// espera a API subir
for (let i = 0; i < 40; i++) { try { if ((await fetch(API.replace('/api', '/health'))).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

// login UMA vez por perfil (rate limit 10/min)
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).body;
const MASTER = (await login('master@folks.com.br', process.env.SEED_MASTER_PASSWORD ?? 'TroqueEssaSenha123')).accessToken;

// ---- critérios de aceite
// const r = await call('GET', '/master/tenants', MASTER);
// ok(r.status === 200, 'MASTER lista empresas');

console.log(`\n${fails === 0 ? 'TODOS OS TESTES PASSARAM' : fails + ' FALHA(S)'}`);
process.exit(fails ? 1 : 0);
