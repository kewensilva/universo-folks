import { Image } from 'expo-image';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { colors, parseVisual, radius, type PublicQuestion } from '@folks/shared';
import { Text } from './ui';

const box = { marginTop: 14, borderRadius: radius.md, backgroundColor: colors.bgElevated, padding: 14 } as const;

/** Visual da questão: imagem SVG, frase com lacuna ou diálogo (mesma interpretação da web). */
export function QuestionVisual({ visual }: { visual: PublicQuestion['visual'] }) {
  const v = parseVisual(visual);
  if (!v) return null;
  switch (v.kind) {
    case 'svg':
      return <View style={[box, { alignItems: 'center', padding: 8 }]}><SvgXml xml={v.svg} width="100%" height={200} /></View>;
    case 'image':
      return <Image source={{ uri: v.url }} style={{ marginTop: 14, height: 200, borderRadius: radius.md }} contentFit="contain" />;
    case 'gap':
      return (
        <View style={box}>
          <Text weight="bold" size={18} style={{ lineHeight: 28 }}>
            {v.parts.map((p, k) => ('blank' in p ? <Text key={k} tone="amber" weight="black" size={18}>{' ______ '}</Text> : <Text key={k} weight="bold" size={18}>{` ${p.text} `}</Text>))}
          </Text>
        </View>
      );
    case 'dialog':
      return (
        <View style={[box, { gap: 8 }]}>
          {!!v.context && <Text tone="muted" size={14} style={{ fontStyle: 'italic' }}>{v.context}</Text>}
          {v.lines.map((l, k) => (
            <View key={k} style={{ alignSelf: l.who === 'me' ? 'flex-end' : 'flex-start', maxWidth: '90%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: l.who === 'me' ? `${colors.amber}33` : 'rgba(255,255,255,0.1)' }}>
              <Text weight="bold">{l.text}</Text>
            </View>
          ))}
        </View>
      );
    case 'text':
      return <View style={box}><Text weight="bold">{v.text}</Text></View>;
  }
}
