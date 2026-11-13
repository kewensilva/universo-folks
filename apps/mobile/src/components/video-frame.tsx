import { WebView } from 'react-native-webview';

/** Celular: o player do Vimeo roda num WebView; as mensagens chegam por onMessage. */
export function VideoFrame({ html, onMessage }: { html: string; onMessage: (data: string) => void }) {
  return (
    <WebView source={{ html, baseUrl: 'https://player.vimeo.com' }} onMessage={(e) => onMessage(e.nativeEvent.data)} originWhitelist={['*']}
      allowsInlineMediaPlayback allowsFullscreenVideo mediaPlaybackRequiresUserAction={false} javaScriptEnabled
      style={{ backgroundColor: '#000' }} />
  );
}
