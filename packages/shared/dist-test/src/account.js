"use strict";
// Conta do aluno/colaborador no app e na web: Hangar, preferências, progresso, empresa e planos.
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPANY_STATUS_LABEL = exports.DAILY_GOALS = exports.HANGAR_SLOTS = void 0;
exports.outfitOf = outfitOf;
/** Abas do Hangar, na ordem e com os nomes do protótipo. */
exports.HANGAR_SLOTS = [
    { slot: 'SUIT', label: 'Traje' },
    { slot: 'DETAILS', label: 'Detalhes' },
    { slot: 'VISOR', label: 'Viseira' },
    { slot: 'HEAD', label: 'Cabeça' },
    { slot: 'BACK', label: 'Costas' },
];
const OUTFIT_KEY = { SUIT: 'suit', DETAILS: 'accent', VISOR: 'visor', HEAD: 'head', BACK: 'back' };
/** Itens equipados (ou um item que está sendo experimentado) viram a roupa do astronauta. */
function outfitOf(h, preview) {
    const out = {};
    for (const s of h?.slots ?? []) {
        const it = s.items.find((i) => i.equipped);
        if (it)
            out[OUTFIT_KEY[s.slot]] = it.key;
    }
    if (preview)
        out[OUTFIT_KEY[preview.slot]] = preview.key;
    return out;
}
exports.DAILY_GOALS = [20, 50, 100, 150];
/** Situação do colaborador na empresa (GET /me/company → status). */
exports.COMPANY_STATUS_LABEL = {
    INVITED: 'Convite enviado',
    ON_TRACK: 'Em dia',
    LATE: 'Atrasado',
    NOT_STARTED: 'Não começou',
    DONE: 'Concluiu',
};
