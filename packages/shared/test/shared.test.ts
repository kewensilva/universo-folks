import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaFor, profileOf, contextTitle, createApiClient, ApiError, isAnswered, fmt } from '../src';

test('cada perfil cai na sua área', () => {
  assert.equal(areaFor({ mode: 'PLATFORM' }), 'master');
  assert.equal(areaFor({ mode: 'TENANT', tenantRole: 'ADMIN_CLIENTE' }), 'empresa');
  assert.equal(areaFor({ mode: 'TENANT', tenantRole: 'COLABORADOR_CLIENTE' }), 'estudar');
  assert.equal(areaFor({ mode: 'B2C' }), 'estudar');
  assert.equal(profileOf({ mode: 'TENANT', tenantRole: null, role: 'ADMIN_CLIENTE' }), 'ADMIN_EMPRESA', 'aceita o role de /auth/contexts');
  assert.equal(contextTitle({ mode: 'B2C', label: 'Individual', role: 'ALUNO_CLIENTE' }).title, 'Individual');
});

test('cliente da API renova o token uma vez só, mesmo com chamadas em paralelo', async () => {
  let token = 'velho';
  let refreshes = 0;
  const fakeFetch = (async (_url: string, init: any) => {
    const auth = init.headers.authorization;
    if (auth !== 'Bearer novo') return new Response(JSON.stringify({ message: 'Token expirado' }), { status: 401 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
  const api = createApiClient({ baseUrl: 'http://x/api', fetch: fakeFetch, getAccessToken: () => token, refresh: async () => { refreshes++; await new Promise((r) => setTimeout(r, 10)); token = 'novo'; return token; } });
  const r = await Promise.all([api.request('GET', '/a'), api.request('GET', '/b'), api.request('GET', '/c')]);
  assert.deepEqual(r, [{ ok: true }, { ok: true }, { ok: true }]);
  assert.equal(refreshes, 1);
});

test('sessão expirada: refresh falha -> avisa e propaga o 401', async () => {
  let expired = false;
  const fakeFetch = (async () => new Response(JSON.stringify({ message: 'Não autenticado' }), { status: 401 })) as unknown as typeof fetch;
  const api = createApiClient({ baseUrl: 'http://x/api', fetch: fakeFetch, getAccessToken: () => 't', refresh: async () => null, onSessionExpired: () => { expired = true; } });
  await assert.rejects(api.request('GET', '/a'), (e: unknown) => e instanceof ApiError && e.status === 401 && e.message === 'Não autenticado');
  assert.equal(expired, true);
});

test('servidor fora do ar: refresh que falha NÃO derruba a sessão', async () => {
  let expired = false;
  const fakeFetch = (async () => new Response(JSON.stringify({ message: 'Token expirado' }), { status: 401 })) as unknown as typeof fetch;
  const api = createApiClient({ baseUrl: 'http://x/api', fetch: fakeFetch, getAccessToken: () => 't', refresh: async () => { throw new TypeError('Failed to fetch'); }, onSessionExpired: () => { expired = true; } });
  await assert.rejects(api.request('GET', '/a'));
  assert.equal(expired, false, 'sem conexão não manda para o login');
});

test('erro de negócio mantém a mensagem pt-BR e o código', async () => {
  const fakeFetch = (async () => new Response(JSON.stringify({ message: 'Esta etapa faz parte do Premium.', reason: 'PREMIUM_REQUIRED' }), { status: 403 })) as unknown as typeof fetch;
  const api = createApiClient({ baseUrl: 'http://x/api', fetch: fakeFetch, getAccessToken: () => 't', refresh: async () => 't' });
  await assert.rejects(api.request('GET', '/a'), (e: unknown) => e instanceof ApiError && e.isPremiumRequired && e.message.includes('Premium'));
});

test('resposta completa por tipo e formatação pt-BR', () => {
  assert.equal(isAnswered({ id: 'q', prompt: 'p', points: 1, type: 'ORDER', pieces: ['a', 'b'] }, { sequence: ['a'] }), false);
  assert.equal(isAnswered({ id: 'q', prompt: 'p', points: 1, type: 'NUMBER' }, { value: 0 }), true);
  assert.equal(fmt.money(199990), 'R$ 1.999,90');
  assert.equal(fmt.pct(66.6), '67%');
  assert.equal(fmt.dateOnly('2026-11-30T00:00:00.000Z'), '30/11/2026', 'prazo não volta um dia no fuso de São Paulo');
  assert.equal(fmt.dayToIso('2026-11-30'), '2026-11-30T00:00:00.000Z');
});

test('vídeo: só reprodução contínua conta como assistido (pular a barra não conta)', async () => {
  const { createWatchTracker } = await import('../src');
  const t = createWatchTracker({ durationSeconds: 100, minWatchPct: 90 });
  assert.equal(t.requiredSeconds, 90);
  for (let s = 0; s <= 20; s += 0.25) t.tick(s);
  assert.equal(Math.round(t.watched), 20);
  t.tick(80); // arrastou a barra
  assert.equal(Math.round(t.watched), 20, 'o salto não conta');
  for (let s = 80.25; s <= 99; s += 0.25) t.tick(s);
  assert.equal(Math.round(t.watched), 99, 'retoma a contagem a partir do novo ponto');
  assert.equal(t.end(), 100);
  assert.equal(t.shouldReport(1_000_000), true);
  assert.equal(t.shouldReport(1_005_000), false, 'no máximo um envio a cada 10 s');
  assert.equal(t.shouldReport(1_010_000), true);
});

test('visual em HTML vira dados (lacuna, diálogo e texto), sem HTML na tela', async () => {
  const { parseVisual, htmlToText } = await import('../src');
  assert.deepEqual(parseVisual({ kind: 'HTML', html: '<div class="gapln">She <b class="gapb">___</b> from Brazil.</div>' }), { kind: 'gap', parts: [{ text: 'She' }, { blank: true }, { text: 'from Brazil.' }] });
  assert.deepEqual(parseVisual({ kind: 'HTML', html: '<div class="dlgq"><div class="dlgb them">“Você é sempre negativo.”</div></div>' }), { kind: 'dialog', context: undefined, lines: [{ who: 'them', text: '“Você é sempre negativo.”' }] });
  assert.deepEqual(parseVisual({ kind: 'HTML', html: '<div class="dlgq"><div class="dlgctx">O Rafael respondeu seco.</div></div>' }), { kind: 'dialog', context: 'O Rafael respondeu seco.', lines: [] });
  assert.equal(htmlToText('<script>x</script>A &amp; B &#39;c&#39;'), "xA & B 'c'");
  assert.deepEqual(parseVisual({ kind: 'SVG', svg: '<svg/>' }), { kind: 'svg', svg: '<svg/>' });
  assert.equal(parseVisual(null), null);
});
