import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync, useAudioStream, type AudioStreamBuffer } from 'expo-audio';
import { detectPitch, pcmToMono, type PitchReading } from '@folks/shared';
import { audioMode, stopSound } from './sound';

export type MicState = 'idle' | 'asking' | 'denied' | 'listening' | 'error';

const WINDOW = 4096;

/**
 * Escuta o microfone em tempo real (PCM do expo-audio, no iOS, Android e web) e devolve a nota
 * detectada, já suavizada (mediana das últimas leituras). Nada é gravado nem enviado: o áudio
 * fica só na memória enquanto a tela está aberta.
 */
export function usePitch() {
  const [state, setState] = useState<MicState>('idle');
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ring = useRef(new Float32Array(WINDOW));
  const filled = useRef(0);
  const last = useRef(0);
  const recent = useRef<number[]>([]);
  const muted = useRef(0);

  const onBuffer = useCallback((b: AudioStreamBuffer) => {
    const mono = pcmToMono(b.data, 'float32', b.channels);
    // janela deslizante com as amostras mais recentes
    const r = ring.current;
    if (mono.length >= WINDOW) r.set(mono.subarray(mono.length - WINDOW));
    else { r.copyWithin(0, mono.length); r.set(mono, WINDOW - mono.length); }
    filled.current = Math.min(WINDOW, filled.current + mono.length);
    const now = Date.now();
    if (filled.current < WINDOW / 2 || now - last.current < 70 || now < muted.current) return;
    last.current = now;
    const p = detectPitch(r, b.sampleRate);
    if (!p || p.clarity < 0.75) {
      recent.current = [];
      setReading(null);
      return;
    }
    const arr = recent.current;
    arr.push(p.midi);
    if (arr.length > 5) arr.shift();
    const med = [...arr].sort((a, c) => a - c)[Math.floor(arr.length / 2)];
    setReading({ ...p, midi: med });
  }, []);

  const { stream } = useAudioStream({ sampleRate: 44100, channels: 1, encoding: 'float32', onBuffer });

  const start = useCallback(async () => {
    setError(null);
    stopSound();
    let perm = await getRecordingPermissionsAsync().catch(() => null);
    if (!perm?.granted) {
      setState('asking');
      perm = await requestRecordingPermissionsAsync().catch(() => null);
    }
    if (!perm?.granted) { setState('denied'); return false; }
    try {
      await audioMode(true);
      filled.current = 0;
      recent.current = [];
      await stream.start();
      setState('listening');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
      return false;
    }
  }, [stream]);

  const stop = useCallback(() => {
    try { stream.stop(); } catch { /* já parado */ }
    setReading(null);
    setState((s) => (s === 'listening' ? 'idle' : s));
    void audioMode(false);
  }, [stream]);

  /** Ignora o microfone por um tempo (ex.: enquanto toca a nota de referência, para ele não se ouvir). */
  const mute = useCallback((ms: number) => { muted.current = Date.now() + ms; recent.current = []; setReading(null); }, []);

  useEffect(() => () => { try { stream.stop(); } catch { /* ok */ } void audioMode(false); }, [stream]);

  return { state, reading, error, start, stop, mute };
}
