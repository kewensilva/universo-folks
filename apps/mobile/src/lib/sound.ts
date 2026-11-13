import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { encodeWav, renderSequence, sequenceDurationMs, sequenceKey, type SoundSequence, type SoundSpec } from '@folks/shared';
import { wavUri } from './sound-file';

/**
 * Toca o som do conteúdo: notas/acordes sintetizados no aparelho (sem internet), arquivo de áudio ou
 * a voz do aparelho (TTS). Um som por vez: tocar outro para o anterior.
 */
const RATE = 22050;
let current: { player?: AudioPlayer; done: () => void } | null = null;
let modeReady: Promise<void> | null = null;

/** iOS: tocar mesmo com o botão do silencioso ligado. */
export function audioMode(recording = false) {
  return setAudioModeAsync({ playsInSilentMode: true, allowsRecording: recording }).catch(() => undefined);
}

export function stopSound() {
  const c = current;
  current = null;
  if (c) {
    try { c.player?.pause(); c.player?.remove(); } catch { /* já liberado */ }
    c.done();
  }
  void Speech.stop();
}

/** Toca e resolve quando o som termina (ou quando outro som começa). */
export async function playSound(spec: SoundSpec): Promise<void> {
  stopSound();
  modeReady ??= audioMode(false);
  await modeReady;
  if (spec.kind === 'TTS') {
    return new Promise((resolve) => {
      current = { done: resolve };
      Speech.speak(spec.text, { language: spec.lang, rate: 0.95, onDone: () => resolve(), onStopped: () => resolve(), onError: () => resolve() });
    });
  }
  const uri = spec.kind === 'URL' ? spec.url : await wavUri(sequenceKey(spec.sequence), () => encodeWav(renderSequence(spec.sequence, RATE), RATE));
  return new Promise((resolve) => {
    let finished = false;
    const done = () => { if (!finished) { finished = true; resolve(); } };
    const player = createAudioPlayer({ uri });
    current = { player, done };
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) {
        sub.remove();
        if (current?.player === player) { current = null; try { player.remove(); } catch { /* ok */ } }
        done();
      }
    });
    // garantia: notas sintetizadas têm duração conhecida
    if (spec.kind === 'NOTES') setTimeout(done, sequenceDurationMs(spec.sequence) + 1500);
    player.play();
  });
}

export const playNotes = (sequence: SoundSequence) => playSound({ kind: 'NOTES', sequence });

/** Som de acerto/erro do protótipo (respeita "Efeitos sonoros" nos Ajustes). */
export function sfx(ok: boolean) {
  void playNotes(ok ? [['n', 76], ['n', 83]] : [['c', 40, 'dim']]);
}

/** Estado de "tocando" para um botão. */
export function useSound() {
  const [playing, setPlaying] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; stopSound(); }, []);
  const play = useCallback(async (key: string, spec: SoundSpec) => {
    setPlaying(key);
    try { await playSound(spec); } finally { if (alive.current) setPlaying((k) => (k === key ? null : k)); }
  }, []);
  const stop = useCallback(() => { stopSound(); setPlaying(null); }, []);
  return { playing, play, stop };
}
