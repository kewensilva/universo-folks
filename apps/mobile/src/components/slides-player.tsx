import { useState } from 'react';
import { View } from 'react-native';
import { colors, errorMessage, soundOf, type Slide } from '@folks/shared';
import { useSession } from '@/lib/session';
import { useSound } from '@/lib/sound';
import { SoundButton } from './sound/sound-button';
import { Button, Card, Progress, Text } from './ui';
import type { AstroLook } from './space/astro-art';
import { Guide } from './space/guide';

/** Aula em telas: o texto aparece em partes (nunca tudo de uma vez), como no protótipo. */
const TIPS = ['Faz sentido?', 'Esse atalho ajuda muito.', 'Guarda esse truque.'];

export function SlidesPlayer({ lessonId, slides, onCompleted, look }: { lessonId: string; slides: Slide[]; onCompleted: (r: unknown) => void; look?: AstroLook | null }) {
  const { api } = useSession();
  const [i, setI] = useState(0);
  const [part, setPart] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sound = useSound();
  const s = slides[i];
  const demos = (s.audioDemos ?? []).map((d) => ({ ...d, spec: soundOf(d) })).filter((d) => d.spec);
  const hasSound = slides.some((x) => x.audioDemos?.length);
  const parts = s.textParts?.length ? s.textParts : [s.text];
  const lastPart = part >= parts.length - 1;
  const lastSlide = i >= slides.length - 1;

  async function next() {
    if (!lastPart) return setPart(part + 1);
    sound.stop();
    if (!lastSlide) { setI(i + 1); setPart(0); return; }
    setBusy(true);
    setErr(null);
    try { onCompleted(await api.learning.completeLesson(lessonId)); }
    catch (e) { setErr(errorMessage(e)); setBusy(false); }
  }

  return (
    <View>
      <Progress value={((i + (part + 1) / parts.length) / slides.length) * 100} />
      <View style={{ marginTop: 12 }}>
        <Guide look={look} mood={sound.playing ? 'wave' : 'idle'} text={i === 0 && part === 0 ? (hasSound ? 'Aumenta o volume: essa aula é de ouvido.' : 'Bora entender isso rapidinho.') : lastSlide && lastPart ? 'Pronto pra praticar?' : demos.length && lastPart ? 'Toque nos sons e repare na diferença.' : TIPS[i % TIPS.length]} />
      </View>
      <Card style={{ marginTop: 8, minHeight: 260, padding: 22 }}>
        {!!s.heading && <Text weight="black" size={22}>{s.heading}</Text>}
        <View style={{ marginTop: 12, gap: 10 }}>
          {parts.slice(0, part + 1).map((t, k) => <Text key={k} size={17} style={{ lineHeight: 26 }}>{t}</Text>)}
        </View>
        {lastPart && demos.length > 0 && (
          <View style={{ marginTop: 18, gap: 8 }}>
            {demos.map((d, k) => (
              <SoundButton key={`${i}-${k}`} label={d.label} caption={d.caption} playing={sound.playing === `${i}-${k}`}
                onPress={() => (sound.playing === `${i}-${k}` ? sound.stop() : void sound.play(`${i}-${k}`, d.spec!))} />
            ))}
          </View>
        )}
        {s.widget && lastPart && (
          <View style={{ marginTop: 18, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.cardBorder, padding: 12 }}>
            <Text tone="muted" size={13}>Atividade interativa desta tela ({s.widget.type}) chega em breve.</Text>
          </View>
        )}
      </Card>
      {err && <Text tone="red" weight="bold" style={{ marginTop: 10 }}>{err}</Text>}
      <Button title={lastPart && lastSlide ? 'Concluir aula' : 'Continuar'} onPress={next} loading={busy} style={{ marginTop: 18 }} />
    </View>
  );
}
