import { View } from 'react-native';
import { Button, Screen, Text } from './ui';

/** Servidor fora do ar: o login fica guardado e o app tenta de novo sozinho. */
export function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen scroll={false}>
      <View style={{ marginTop: 120, alignItems: 'center', gap: 8 }}>
        <Text size={40}>🛰️</Text>
        <Text weight="black" size={20}>Sem conexão com o servidor</Text>
        <Text tone="muted" style={{ textAlign: 'center' }}>Seu login continua guardado. Vamos tentar de novo em alguns segundos.</Text>
        <Button title="Tentar agora" variant="ghost" onPress={onRetry} style={{ marginTop: 12, alignSelf: 'stretch' }} />
      </View>
    </Screen>
  );
}
