import { useCallback, useEffect, useRef, useState } from 'react';
import { detectPitch, type PitchReading } from '@folks/shared';
import { stopSound } from './sound';
import type { MicState } from './mic';

/**
 * Versão web do usePitch (o AudioStream do expo-audio não existe na web): Web Audio API com
 * getUserMedia + AnalyserNode. Mesma interface e mesma detecção (detectPitch do @folks/shared).
 */
export function usePitch() {
  const [state, setState] = useState<MicState>('idle');
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctx = useRef<{ ac: AudioContext; stream: MediaStream; timer: ReturnType<typeof setInterval> } | null>(null);
  const recent = useRef<number[]>([]);
  const muted = useRef(0);

  const stop = useCallback(() => {
    const c = ctx.current;
    ctx.current = null;
    if (c) {
      clearInterval(c.timer);
      c.stream.getTracks().forEach((t) => t.stop());
      void c.ac.close().catch(() => undefined);
    }
    setReading(null);
    setState((s) => (s === 'listening' ? 'idle' : s));
  }, []);

  const start = useCallback(async () => {
    setError(null);
    stopSound();
    if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador não dá acesso ao microfone'); setState('error'); return false; }
    setState('asking');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') setState('denied');
      else { setError(e instanceof Error ? e.message : String(e)); setState('error'); }
      return false;
    }
    const ac = new AudioContext();
    await ac.resume().catch(() => undefined);
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();
    an.fftSize = 4096;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    recent.current = [];
    const timer = setInterval(() => {
      if (Date.now() < muted.current) return;
      an.getFloatTimeDomainData(buf);
      const p = detectPitch(buf, ac.sampleRate);
      if (!p || p.clarity < 0.75) { recent.current = []; setReading(null); return; }
      const arr = recent.current;
      arr.push(p.midi);
      if (arr.length > 5) arr.shift();
      const med = [...arr].sort((a, c) => a - c)[Math.floor(arr.length / 2)];
      setReading({ ...p, midi: med });
    }, 80);
    ctx.current = { ac, stream, timer };
    setState('listening');
    return true;
  }, []);

  const mute = useCallback((ms: number) => { muted.current = Date.now() + ms; recent.current = []; setReading(null); }, []);

  useEffect(() => () => stop(), [stop]);

  return { state, reading, error, start, stop, mute };
}
