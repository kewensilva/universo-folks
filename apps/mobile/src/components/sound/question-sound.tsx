import { useEffect } from 'react';
import { View } from 'react-native';
import type { SoundSpec } from '@folks/shared';
import { useSound } from '@/lib/sound';
import { SoundButton } from './sound-button';

/** Som da questão ("ouça e responda"): toca sozinho ao abrir e pode ser ouvido de novo. */
export function QuestionSound({ spec, autoPlay = true }: { spec: SoundSpec | null; autoPlay?: boolean }) {
  const sound = useSound();
  useEffect(() => {
    if (!spec || !autoPlay) return;
    const t = setTimeout(() => { void sound.play('q', spec); }, 350);
    return () => clearTimeout(t);
    // toca uma vez por questão (o componente é recriado a cada questão)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!spec) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <SoundButton big label={sound.playing ? 'Tocando…' : 'Ouvir de novo'} caption={spec.kind === 'TTS' ? 'Voz do aparelho' : 'Pode ouvir quantas vezes quiser'} playing={sound.playing === 'q'} onPress={() => (sound.playing ? sound.stop() : void sound.play('q', spec))} />
    </View>
  );
}
