"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEO_REPORT_EVERY_S = void 0;
exports.createWatchTracker = createWatchTracker;
/** De quanto em quanto tempo (segundos reais) o progresso é enviado à API. */
exports.VIDEO_REPORT_EVERY_S = 10;
/**
 * Conta o tempo assistido em reprodução contínua: pular para frente não conta.
 * O servidor também limita (anti-pulo), mas assim o aluno vê o progresso real.
 */
function createWatchTracker(opts = {}) {
    const duration = opts.durationSeconds ?? 0;
    const pct = opts.minWatchPct ?? 90;
    let watched = opts.alreadyWatched ?? 0;
    let last = null;
    let lastReportAt = 0;
    return {
        /** Recebe a posição atual do player (evento timeupdate). Devolve o total assistido. */
        tick(seconds) {
            // avanço pequeno = reprodução normal (até 2x); salto maior = o aluno arrastou a barra
            if (last !== null && seconds > last && seconds - last <= 3)
                watched = Math.min(duration || Infinity, Math.max(watched, seconds));
            last = seconds;
            return watched;
        },
        /** Marca o fim do vídeo: conta o trecho final se a reprodução estava contínua. */
        end() {
            if (duration && last !== null && duration - last <= 3)
                watched = Math.max(watched, duration);
            return watched;
        },
        get watched() { return watched; },
        get requiredSeconds() { return duration ? Math.ceil((duration * pct) / 100) : null; },
        get pctWatched() { return duration ? Math.min(100, (watched / duration) * 100) : 0; },
        /** Diz se já é hora de enviar o progresso (a cada VIDEO_REPORT_EVERY_S). */
        shouldReport(nowMs = Date.now()) {
            if (nowMs - lastReportAt < exports.VIDEO_REPORT_EVERY_S * 1000)
                return false;
            lastReportAt = nowMs;
            return true;
        },
    };
}
