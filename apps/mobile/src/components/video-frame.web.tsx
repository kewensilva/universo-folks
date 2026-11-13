import { useEffect, useRef } from 'react';

/** Web (Expo web): o mesmo HTML num iframe; as mensagens chegam por window.postMessage. */
export function VideoFrame({ html, onMessage }: { html: string; onMessage: (data: string) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const handler = useRef(onMessage);
  useEffect(() => { handler.current = onMessage; });
  useEffect(() => {
    const listen = (e: MessageEvent) => { if (e.source === ref.current?.contentWindow && typeof e.data === 'string') handler.current(e.data); };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);
  return <iframe ref={ref} srcDoc={html} title="Vídeo" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} />;
}
