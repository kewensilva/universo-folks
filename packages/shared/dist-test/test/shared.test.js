"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const src_1 = require("../src");
(0, node_test_1.test)('cada perfil cai na sua área', () => {
    strict_1.default.equal((0, src_1.areaFor)({ mode: 'PLATFORM' }), 'master');
    strict_1.default.equal((0, src_1.areaFor)({ mode: 'TENANT', tenantRole: 'ADMIN_CLIENTE' }), 'empresa');
    strict_1.default.equal((0, src_1.areaFor)({ mode: 'TENANT', tenantRole: 'COLABORADOR_CLIENTE' }), 'estudar');
    strict_1.default.equal((0, src_1.areaFor)({ mode: 'B2C' }), 'estudar');
    strict_1.default.equal((0, src_1.profileOf)({ mode: 'TENANT', tenantRole: null, role: 'ADMIN_CLIENTE' }), 'ADMIN_EMPRESA', 'aceita o role de /auth/contexts');
    strict_1.default.equal((0, src_1.contextTitle)({ mode: 'B2C', label: 'Individual', role: 'ALUNO_CLIENTE' }).title, 'Individual');
});
(0, node_test_1.test)('cliente da API renova o token uma vez só, mesmo com chamadas em paralelo', async () => {
    let token = 'velho';
    let refreshes = 0;
    const fakeFetch = (async (_url, init) => {
        const auth = init.headers.authorization;
        if (auth !== 'Bearer novo')
            return new Response(JSON.stringify({ message: 'Token expirado' }), { status: 401 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const api = (0, src_1.createApiClient)({ baseUrl: 'http://x/api', fetch: fakeFetch, getAccessToken: () => token, refresh: async () => { refreshes++; await new Promise((r) => setTimeout(r, 10)); token = 'novo'; return token; } });
    const r = await Promise.all([api.request('GET', '/a'), api.request('GET', '/b'), api.request('GET', '/c')]);
    strict_1.default.deepEqual(r, [{ ok: true }, { ok: true }, { ok: true }]);
    strict_1.default.equal(refreshes, 1);
});
(0, node_test_1.test)('sessão expirada: refresh falha -> avisa e propaga o 401', async () => {
    let expired = false;
    const fakeFetch = (async () => new Response(JSON.stringify({ message: 'Não autenticado' }), { status: 401 }));
    const api = (0, src_1.createApiClient)({ baseUrl: 'http://x/api', fetch: fakeFetch, getAccessToken: () => 't', refresh: async () => null, onSessionExpired: () => { expired = true; } });
    await strict_1.default.rejects(api.request('GET', '/a'), (e) => e instanceof src_1.ApiError && e.status === 401 && e.message === 'Não autenticado');
    strict_1.default.equal(expired, true);
});
(0, node_test_1.test)('servidor fora do ar: refresh que falha NÃO derruba a sessão', async () => {
    let expired = false;
    const fakeFetch = (async () => new Response(JSON.stringify({ message: 'Token expirado' }), { status: 401 }));
    const api = (0, src_1.createApiClient)({ baseUrl: 'http://x/api', fetch: fakeFetch, getAccessToken: () => 't', refresh: async () => { throw new TypeError('Failed to fetch'); }, onSessionExpired: () => { expired = true; } });
    await strict_1.default.rejects(api.request('GET', '/a'));
    strict_1.default.equal(expired, false, 'sem conexão não manda para o login');
});
(0, node_test_1.test)('erro de negócio mantém a mensagem pt-BR e o código', async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ message: 'Esta etapa faz parte do Premium.', reason: 'PREMIUM_REQUIRED' }), { status: 403 }));
    const api = (0, src_1.createApiClient)({ baseUrl: 'http://x/api', fetch: fakeFetch, getAccessToken: () => 't', refresh: async () => 't' });
    await strict_1.default.rejects(api.request('GET', '/a'), (e) => e instanceof src_1.ApiError && e.isPremiumRequired && e.message.includes('Premium'));
});
(0, node_test_1.test)('resposta completa por tipo e formatação pt-BR', () => {
    strict_1.default.equal((0, src_1.isAnswered)({ id: 'q', prompt: 'p', points: 1, type: 'ORDER', pieces: ['a', 'b'] }, { sequence: ['a'] }), false);
    strict_1.default.equal((0, src_1.isAnswered)({ id: 'q', prompt: 'p', points: 1, type: 'NUMBER' }, { value: 0 }), true);
    strict_1.default.equal(src_1.fmt.money(199990), 'R$ 1.999,90');
    strict_1.default.equal(src_1.fmt.pct(66.6), '67%');
    strict_1.default.equal(src_1.fmt.dateOnly('2026-11-30T00:00:00.000Z'), '30/11/2026', 'prazo não volta um dia no fuso de São Paulo');
    strict_1.default.equal(src_1.fmt.dayToIso('2026-11-30'), '2026-11-30T00:00:00.000Z');
});
(0, node_test_1.test)('vídeo: só reprodução contínua conta como assistido (pular a barra não conta)', async () => {
    const { createWatchTracker } = await Promise.resolve().then(() => __importStar(require('../src')));
    const t = createWatchTracker({ durationSeconds: 100, minWatchPct: 90 });
    strict_1.default.equal(t.requiredSeconds, 90);
    for (let s = 0; s <= 20; s += 0.25)
        t.tick(s);
    strict_1.default.equal(Math.round(t.watched), 20);
    t.tick(80); // arrastou a barra
    strict_1.default.equal(Math.round(t.watched), 20, 'o salto não conta');
    for (let s = 80.25; s <= 99; s += 0.25)
        t.tick(s);
    strict_1.default.equal(Math.round(t.watched), 99, 'retoma a contagem a partir do novo ponto');
    strict_1.default.equal(t.end(), 100);
    strict_1.default.equal(t.shouldReport(1000000), true);
    strict_1.default.equal(t.shouldReport(1005000), false, 'no máximo um envio a cada 10 s');
    strict_1.default.equal(t.shouldReport(1010000), true);
});
(0, node_test_1.test)('visual em HTML vira dados (lacuna, diálogo e texto), sem HTML na tela', async () => {
    const { parseVisual, htmlToText } = await Promise.resolve().then(() => __importStar(require('../src')));
    strict_1.default.deepEqual(parseVisual({ kind: 'HTML', html: '<div class="gapln">She <b class="gapb">___</b> from Brazil.</div>' }), { kind: 'gap', parts: [{ text: 'She' }, { blank: true }, { text: 'from Brazil.' }] });
    strict_1.default.deepEqual(parseVisual({ kind: 'HTML', html: '<div class="dlgq"><div class="dlgb them">“Você é sempre negativo.”</div></div>' }), { kind: 'dialog', context: undefined, lines: [{ who: 'them', text: '“Você é sempre negativo.”' }] });
    strict_1.default.deepEqual(parseVisual({ kind: 'HTML', html: '<div class="dlgq"><div class="dlgctx">O Rafael respondeu seco.</div></div>' }), { kind: 'dialog', context: 'O Rafael respondeu seco.', lines: [] });
    strict_1.default.equal(htmlToText('<script>x</script>A &amp; B &#39;c&#39;'), "xA & B 'c'");
    strict_1.default.deepEqual(parseVisual({ kind: 'SVG', svg: '<svg/>' }), { kind: 'svg', svg: '<svg/>' });
    strict_1.default.equal(parseVisual(null), null);
});
