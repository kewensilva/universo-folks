"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sameContext = exports.PROFILE_LABEL = exports.isStudyContext = void 0;
exports.profileOf = profileOf;
exports.areaFor = areaFor;
exports.contextTitle = contextTitle;
function profileOf(ctx) {
    if (ctx.mode === 'PLATFORM')
        return 'MASTER';
    if (ctx.mode === 'TENANT')
        return (ctx.tenantRole ?? ctx.role) === 'ADMIN_CLIENTE' ? 'ADMIN_EMPRESA' : 'COLABORADOR';
    return 'ALUNO';
}
/** ÚNICA regra de "qual área este perfil vê". Novos perfis (B2G) entram aqui. */
function areaFor(ctx) {
    const p = profileOf(ctx);
    return p === 'MASTER' ? 'master' : p === 'ADMIN_EMPRESA' ? 'empresa' : 'estudar';
}
/** O app (mobile) é a área de estudo: MASTER e ADMIN usam o painel na web. */
const isStudyContext = (ctx) => areaFor(ctx) === 'estudar';
exports.isStudyContext = isStudyContext;
exports.PROFILE_LABEL = {
    MASTER: 'Master Folks',
    ADMIN_EMPRESA: 'Administrador da empresa',
    COLABORADOR: 'Colaborador',
    ALUNO: 'Aluno individual',
};
/** Rótulo curto de um contexto disponível (tela "Entrar como"). */
function contextTitle(c) {
    const p = profileOf({ mode: c.mode, tenantRole: c.role ?? null });
    if (p === 'MASTER')
        return { title: 'Folks (Master)', subtitle: 'Painel completo da plataforma' };
    if (p === 'ADMIN_EMPRESA')
        return { title: c.label, subtitle: 'Administrar a empresa' };
    if (p === 'COLABORADOR')
        return { title: c.label, subtitle: 'Estudar pela empresa' };
    return { title: 'Individual', subtitle: 'Estudar por conta própria (grátis ou Premium)' };
}
/** Mesmo contexto? (para marcar o atual na troca) */
const sameContext = (a, b) => a.mode === b.mode && (a.mode !== 'TENANT' || a.tenantId === b.tenantId);
exports.sameContext = sameContext;
