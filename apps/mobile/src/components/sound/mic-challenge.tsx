import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { centsFrom, colors, midiToName, midiToSolfege, radius, sequenceDurationMs, tuningHint, type MicChallenge } from '@folks/shared';
import { usePitch } from '@/lib/mic';
import { useSound } from '@/lib/sound';
import { Button, Progress, Text } from '@/components/ui';
import { SoundButton } from './sound-button';

/**
 * Desafio no microfone: tocar (violão) ou cantar (voz) a(s) nota(s) pedida(s). Mostra um afinador:
 * ponteiro de -100 a +100 cents, "grave / agudo / afinado" e a barra de "segure assim".
 * Vale quando segura afinado pelo tempo pedido, em todas as notas da sequência.
 */
export function MicChallengeView({ challenge, onResult }: { challenge: MicChallenge; onResult: (correct: boolean, values: Record<string, number>) => void }) {
  const mic = usePitch();
  const sound = useSound();
  const [idx, setIdx] = useState(0);
  const [held, setHeld] = useState(0);
  const [bestCents, setBestCents] = useState<number | null>(null);
  const [left, setLeft] = useState(challenge.timeLimitMs);
  const holdFrom = useRef<number | null>(null);
  const started = useRef<number | null>(null);
  const finished = useRef(false);
  const target = challenge.targets[idx];

  const r = mic.reading;
  const cents = r ? centsFrom(target, r.midi, challenge.mode) : null;
  const inTune = cents !== null && Math.abs(cents) <= challenge.toleranceCents;

  function finish(ok: boolean) {
    if (finished.current) return;
    finished.current = true;
    mic.stop();
    onResult(ok, { notes: idx + (ok ? 1 : 0), total: challenge.targets.length, ...(bestCents !== null ? { cents: Math.round(bestCents) } : {}) });
  }

  // segurar afinado: avança de nota ou conclui
  useEffect(() => {
    if (mic.state !== 'listening' || finished.current) return;
    const now = Date.now();
    if (inTune) {
      holdFrom.current ??= now;
      const h = now - holdFrom.current;
      setHeld(Math.min(1, h / challenge.holdMs));
      if (cents !== null) setBestCents((b) => (b === null || Math.abs(cents) < Math.abs(b) ? cents : b));
      if (h >= challenge.holdMs) {
        holdFrom.current = null;
        setHeld(0);
        if (idx + 1 >= challenge.targets.length) finish(true);
        else setIdx(idx + 1);
      }
    } else {
      holdFrom.current = null;
      setHeld(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, mic.state]);

  // tempo para tentar
  useEffect(() => {
    if (mic.state !== 'listening') return;
    started.current ??= Date.now();
    const t = setInterval(() => {
      const rest = challenge.timeLimitMs - (Date.now() - (started.current ?? Date.now()));
      setLeft(Math.max(0, rest));
      if (rest <= 0) finish(false);
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mic.state]);

  async function reference() {
    if (!challenge.reference) return;
    const seq = challenge.reference;
    mic.mute(sequenceDurationMs(seq) + 400); // o microfone não pode ouvir a própria referência
    await sound.play('ref', { kind: 'NOTES', sequence: seq });
  }

  const hint = cents !== null ? tuningHint(cents, challenge.toleranceCents) : null;
  const needle = cents === null ? 0 : Math.max(-100, Math.min(100, cents));
  // ponteiro em pixels (porcentagem animada não funciona em todas as plataformas)
  const [barW, setBarW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => { x.value = withSpring(barW * (0.5 + needle / 200), { damping: 18, stiffness: 180 }); }, [needle, barW, x]);
  const needleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - 9 }] }));
  const voice = challenge.instrument === 'voz';

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text tone="muted" weight="bold" size={12}>{voice ? 'CANTE' : 'TOQUE'}{challenge.targets.length > 1 ? ` · NOTA ${idx + 1} DE ${challenge.targets.length}` : ''}</Text>
        <Text weight="black" size={40}>{midiToSolfege(target)}</Text>
        <Text tone="muted" weight="bold">{voice ? `${midiToName(target).replace(/-?\d+$/, '')} · em qualquer oitava` : midiToName(target)}</Text>
        {challenge.targets.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            {challenge.targets.map((t, i) => (
              <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: i < idx ? `${colors.green}33` : i === idx ? `${colors.amber}33` : 'rgba(255,255,255,0.06)' }}>
                <Text weight="black" size={13} style={{ color: i < idx ? colors.green : i === idx ? colors.amber : colors.dim }}>{midiToSolfege(t)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {challenge.reference && (
        <SoundButton label={voice ? 'Ouvir a nota' : 'Ouvir como deve soar'} caption="O microfone pausa enquanto toca" playing={sound.playing === 'ref'} onPress={() => (sound.playing ? sound.stop() : void reference())} />
      )}

      {/* afinador */}
      <View accessible accessibilityRole="adjustable" accessibilityLabel={hint ? `${hint.label}${r ? `, ouvindo ${midiToSolfege(r.midi)}` : ''}` : 'Aguardando som'}
        style={{ padding: 16, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: inTune ? colors.green : colors.cardBorder, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text tone="blue" weight="black" size={12}>GRAVE</Text>
          <Text weight="black" size={12} style={{ color: inTune ? colors.green : colors.dim }}>{mic.state === 'listening' ? (r ? `${midiToSolfege(r.midi)} ${cents !== null ? `${cents > 0 ? '+' : ''}${Math.round(cents)}¢` : ''}` : 'ouvindo…') : 'microfone desligado'}</Text>
          <Text tone="red" weight="black" size={12}>AGUDO</Text>
        </View>
        <View style={{ height: 34, justifyContent: 'center' }} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <View style={{ position: 'absolute', left: `${50 - challenge.toleranceCents / 2}%`, width: `${challenge.toleranceCents}%`, height: 8, borderRadius: 4, backgroundColor: `${colors.green}66` }} />
          <View style={{ position: 'absolute', left: '50%', width: 2, height: 22, marginLeft: -1, backgroundColor: colors.green }} />
          {mic.state === 'listening' && r && (
            <Animated.View style={[{ position: 'absolute', left: 0, width: 18, height: 30, borderRadius: 9, backgroundColor: inTune ? colors.green : colors.amber, borderWidth: 3, borderColor: '#fff' }, needleStyle]} />
          )}
        </View>
        <Text weight="black" size={17} style={{ textAlign: 'center', color: inTune ? colors.green : colors.ink }}>
          {mic.state !== 'listening' ? (voice ? 'Ligue o microfone e cante num "ááá" contínuo' : 'Ligue o microfone e toque a corda') : hint ? hint.label : voice ? 'Cante mais perto do celular' : 'Toque a corda e deixe soar'}
        </Text>
        {mic.state === 'listening' && (
          <View style={{ gap: 4 }}>
            <Text tone="muted" size={12} weight="bold">Segure afinado</Text>
            <Progress value={held * 100} color={colors.green} height={8} />
          </View>
        )}
      </View>

      {mic.state === 'denied' && <Text tone="red" weight="bold">Sem acesso ao microfone. Libere o microfone para o Universo Folks nos ajustes do celular e tente de novo.</Text>}
      {mic.state === 'error' && <Text tone="red" weight="bold">Não foi possível ligar o microfone{mic.error ? `: ${mic.error}` : ''}.</Text>}

      {mic.state === 'listening' ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Text tone="dim" size={13} style={{ flex: 1 }}>{Math.ceil(left / 1000)} s</Text>
          <Button title="Não consegui" variant="ghost" onPress={() => finish(false)} style={{ paddingVertical: 10 }} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Button title={mic.state === 'asking' ? 'Aguardando permissão…' : '🎤 Ligar o microfone'} onPress={() => { void mic.start(); }} disabled={mic.state === 'asking'} />
          <Button title="Pular" variant="ghost" onPress={() => finish(false)} />
        </View>
      )}
      <Text tone="dim" size={12} style={{ textAlign: 'center' }}>O som do microfone é analisado só no aparelho e não é gravado.</Text>
    </View>
  );
}
