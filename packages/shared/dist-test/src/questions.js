"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUESTION_TYPE_LABEL = void 0;
exports.isAnswered = isAnswered;
exports.QUESTION_TYPE_LABEL = {
    SINGLE_CHOICE: 'Escolha uma',
    MULTIPLE_CHOICE: 'Marque todas as certas',
    TRUE_FALSE: 'Mito ou verdade',
    NUMBER: 'Digite o número',
    ORDER: 'Coloque em ordem',
    BUILD_SENTENCE: 'Monte a frase',
    MATCH_PAIRS: 'Ligue os pares',
    CLASSIFY: 'Classifique',
    SIMULATOR: 'Simulador',
};
/** A resposta está completa o suficiente para enviar? */
function isAnswered(q, a) {
    if (!a)
        return false;
    switch (q.type) {
        case 'NUMBER': return typeof a.value === 'number' && Number.isFinite(a.value);
        case 'ORDER': return (a.sequence?.length ?? 0) === q.pieces.length;
        case 'BUILD_SENTENCE': return (a.sequence?.length ?? 0) > 0;
        case 'MATCH_PAIRS': return (a.pairs?.length ?? 0) === q.left.length;
        case 'CLASSIFY': return (a.assignments?.length ?? 0) === q.items.length;
        case 'SIMULATOR': return typeof a.simulator?.correct === 'boolean';
        default: return (a.optionIds?.length ?? 0) > 0;
    }
}
