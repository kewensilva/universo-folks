"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firstName = exports.shortDate = exports.dayToIso = exports.dateOnly = exports.date = exports.money = exports.pct = exports.num = void 0;
exports.relativeDays = relativeDays;
exports.greeting = greeting;
/** Formatação em pt-BR (o produto é brasileiro; fuso de São Paulo). */
const nf = new Intl.NumberFormat('pt-BR');
const num = (n) => (n == null ? '—' : nf.format(n));
exports.num = num;
const pct = (n) => (n == null ? '—' : `${nf.format(Math.round(n))}%`);
exports.pct = pct;
const money = (cents, currency = 'BRL') => cents == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
exports.money = money;
const date = (iso) => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)) : '—';
exports.date = date;
/**
 * Data "só dia" (prazo de trilha, contrato): guardada como meia-noite UTC.
 * Mostra sem converter fuso, senão 30/11 00:00 UTC vira 29/11 em São Paulo.
 */
const dateOnly = (iso) => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)) : '—';
exports.dateOnly = dateOnly;
/** "2026-11-30" (input type=date) -> ISO meia-noite UTC, o mesmo formato que o banco já usa. */
const dayToIso = (day) => (day ? new Date(`${day}T00:00:00.000Z`).toISOString() : undefined);
exports.dayToIso = dayToIso;
const shortDate = (iso) => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)).replace('.', '') : '—';
exports.shortDate = shortDate;
/** "há 3 dias", "hoje" */
function relativeDays(iso, now = new Date()) {
    if (!iso)
        return 'nunca';
    const d = Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
    if (d <= 0)
        return 'hoje';
    if (d === 1)
        return 'ontem';
    if (d < 30)
        return `há ${d} dias`;
    const m = Math.floor(d / 30);
    return m === 1 ? 'há 1 mês' : `há ${m} meses`;
}
/** Primeiro nome para saudação. */
const firstName = (name) => (name ?? '').trim().split(/\s+/)[0] ?? '';
exports.firstName = firstName;
/** "Bom dia", "Boa tarde", "Boa noite" no fuso de São Paulo. */
function greeting(now = new Date()) {
    const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(now));
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
