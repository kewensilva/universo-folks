import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { VideoFrame } from './video-frame';
import { colors, createWatchTracker, errorMessage, type LessonVideo, type VideoProgressResult } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Card, Progress, Text } from './ui';

/** Página mínima com o player oficial do Vimeo; os eventos voltam ao app por postMessage. */
function playerHtml(embedUrl: string) {
  const sep = embedUrl.includes('?') ? '&' : '?';
  const src = `${embedUrl}${sep}playsinline=1&dnt=1&title=0&byline=0&portrait=0`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
<body><iframe id="v" src=${JSON.stringify(src)} allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
<script src="https://player.vimeo.com/api/player.js"></script>
<script>
  function send(o){ var m = JSON.stringify(o); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(m); else if (window.parent !== window) window.parent.postMessage(m, '*'); }
  try {
    var p = new Vimeo.Player(document.getElementById('v'));
    p.on('timeupdate', function(d){ send({ e: 'time', s: d.seconds }); });
    p.on('ended', function(){ send({ e: 'ended' }); });
    p.on('pause', function(){ send({ e: 'pause' }); });
  } catch (err) { send({ e: 'error', m: String(err) }); }
</script></body></html>`;
}

/**
 * Etapa de vídeo no app. Mesma regra da web: conta só a reprodução contínua, envia o progresso
 * a cada 10 s e a API conclui ao atingir a % mínima (anti-pulo no servidor).
 */
export function VideoPlayer({ lessonId, video, onCompleted }: { lessonId: string; video: LessonVideo; onCompleted: (r: VideoProgressResult) => void }) {
  const { api } = useSession();
  const [tracker] = useState(() => createWatchTracker(video));
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const completed = useRef(false);
  const html = useMemo(() => (video.embedUrl ? playerHtml(video.embedUrl) : null), [video.embedUrl]);

  async function send(ended = false) {
    if (completed.current) return;
    try {
      const r = await api.learning.videoProgress(lessonId, tracker.watched, ended);
      if (r.completed && !completed.current) {
        completed.current = true;
        setDone(true);
        onCompleted(r);
      }
    } catch (e) { setErr(errorMessage(e)); }
  }

  function onMessage(data: string) {
    let m: { e: string; s?: number; m?: string };
    try { m = JSON.parse(data); } catch { return; }
    if (m.e === 'time' && typeof m.s === 'number') {
      tracker.tick(m.s);
      setPct(tracker.pctWatched);
      if (tracker.shouldReport()) void send();
    } else if (m.e === 'ended') { tracker.end(); setPct(tracker.pctWatched); void send(true); }
    else if (m.e === 'pause') void send();
    else if (m.e === 'error') setErr('Não foi possível carregar o player do vídeo.');
  }

  if (!html) return <Card><Text tone="muted">O vídeo desta etapa ainda não foi definido.</Text></Card>;
  return (
    <View>
      <View style={{ aspectRatio: 16 / 9, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: colors.cardBorder }}>
        <VideoFrame html={html} onMessage={onMessage} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <View style={{ flex: 1 }}><Progress value={done ? 100 : pct} /></View>
        <Text tone="dim" weight="bold" size={12}>{done ? 'Concluído' : `${Math.round(pct)}% assistido`}</Text>
      </View>
      {!done && !!video.durationSeconds && <Text tone="muted" size={13} style={{ marginTop: 8 }}>Assista pelo menos {video.minWatchPct ?? 90}% do vídeo para concluir a etapa. Pular a barra não conta.</Text>}
      {err && <Text tone="red" weight="bold" style={{ marginTop: 8 }}>{err}</Text>}
    </View>
  );
}
