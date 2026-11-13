/** Formatação em pt-BR (o produto é brasileiro; fuso de São Paulo). */
const nf = new Intl.NumberFormat('pt-BR');
export const num = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
export const pct = (n: number | null | undefined) => (n == null ? '—' : `${nf.format(Math.round(n))}%`);
export const money = (cents: number | null | undefined, currency = 'BRL') =>
  cents == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
export const date = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)) : '—';
/**
 * Data "só dia" (prazo de trilha, contrato): guardada como meia-noite UTC.
 * Mostra sem converter fuso, senão 30/11 00:00 UTC vira 29/11 em São Paulo.
 */
export const dateOnly = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)) : '—';
/** "2026-11-30" (input type=date) -> ISO meia-noite UTC, o mesmo formato que o banco já usa. */
export const dayToIso = (day: string) => (day ? new Date(`${day}T00:00:00.000Z`).toISOString() : undefined);
export const shortDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)).replace('.', '') : '—';
/** "há 3 dias", "hoje" */
export function relativeDays(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'nunca';
  const d = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  const m = Math.floor(d / 30);
  return m === 1 ? 'há 1 mês' : `há ${m} meses`;
}
/** Primeiro nome para saudação. */
export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';
/** "Bom dia", "Boa tarde", "Boa noite" no fuso de São Paulo. */
export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(now));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
