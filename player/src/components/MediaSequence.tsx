import React, { useEffect, useRef, useState } from 'react';
import { MediaQrCta } from './MediaQrCta';

export interface PlaybackEvent {
  mediaId: string; mediaName: string; mediaVersion: number; playedAt: string;
  durationSeconds: number; completed: boolean; reason: string; zoneId: string;
}
export interface PlaybackProps {
  onProof?: (event: PlaybackEvent) => void;
  onCurrent?: (media: any, zoneId: string) => void;
  screenId?: string;
  zoneId?: string;
}
export function MediaSequence({ items, onCycle, volume = 80, audioEnabled = true, fit = 'contain', ...events }: PlaybackProps & { items: any[]; onCycle?: () => void; volume?: number; audioEnabled?: boolean; fit?: React.CSSProperties['objectFit'] }) {
  const [cycle, setCycle] = useState(0);
  const signature = JSON.stringify(items.map(i => [i.mediaId || i.media?.id || i.id, i.media?.version || i.version, i.durationSeconds]));
  useEffect(() => setCycle(0), [signature]);
  const item = items[cycle % Math.max(items.length, 1)];
  if (!item) return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>Área sem conteúdo</div>;
  const media = item.media || { ...item, id: item.mediaId || item.id };
  return <MediaItem key={`${signature}:${cycle}`} media={media} duration={item.durationSeconds || media.durationSeconds || 10} volume={volume} audioEnabled={audioEnabled} fit={fit} onNext={() => { if (onCycle) onCycle(); else setCycle(v => v + 1); }} {...events} />;
}

function MediaItem({ media, duration, volume, audioEnabled, fit, onNext, onProof, onCurrent, screenId, zoneId = 'main' }: PlaybackProps & { media: any; duration: number; volume: number; audioEnabled: boolean; fit: React.CSSProperties['objectFit']; onNext: () => void }) {
  const av = useRef<HTMLMediaElement | null>(null);
  const callbacks = useRef({ onProof, onCurrent, onNext }); callbacks.current = { onProof, onCurrent, onNext };
  const loaded = useRef(false), done = useRef(false), startedAt = useRef('');
  const elapsed = useRef(0), playingSince = useRef<number | null>(null), progressAt = useRef(performance.now());
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const isAv = media.type === 'VIDEO' || media.type === 'AUDIO';
  const accrue = () => { if (playingSince.current !== null) { elapsed.current += (performance.now() - playingSince.current) / 1000; playingSince.current = null; } };
  const finish = (completed: boolean, reason: string, advance = true) => {
    if (done.current) return;
    done.current = true; accrue();
    callbacks.current.onCurrent?.(null, zoneId);
    if (media.id && (loaded.current || reason === 'MEDIA_ERROR')) callbacks.current.onProof?.({ mediaId: media.id, mediaName: media.name || 'Mídia', mediaVersion: media.version || 1, playedAt: startedAt.current || new Date().toISOString(), durationSeconds: Math.max(0, Math.round(elapsed.current)), completed, reason, zoneId });
    if (advance) callbacks.current.onNext();
  };
  const start = () => {
    if (done.current) return;
    if (!loaded.current) { loaded.current = true; startedAt.current = new Date().toISOString(); callbacks.current.onCurrent?.(media, zoneId); }
    if (!document.hidden && playingSince.current === null) playingSince.current = performance.now();
    progressAt.current = performance.now();
  };
  const fail = () => { setFailed(true); finish(false, 'MEDIA_ERROR', false); };
  useEffect(() => {
    done.current = false; loaded.current = false; elapsed.current = 0; playingSince.current = null; startedAt.current = ''; progressAt.current = performance.now();
    if (media.validUntil && new Date(media.validUntil).getTime() <= Date.now()) { setFailed(true); finish(false, 'EXPIRED', false); return; }
    const visibility = () => { if (document.hidden) { accrue(); av.current?.pause(); } else if (isAv) { void av.current?.play().catch(fail); } else if (loaded.current) start(); };
    document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(() => {
      if (done.current) return;
      const total = elapsed.current + (playingSince.current === null ? 0 : (performance.now() - playingSince.current) / 1000);
      if (!loaded.current && performance.now() - progressAt.current > 20_000) fail();
      else if (!isAv && loaded.current && total >= duration) finish(true, 'COMPLETED');
      else if (isAv && !document.hidden && performance.now() - progressAt.current > 20_000) fail();
      else if (isAv && total > Math.max(duration + 30, 60)) finish(false, 'PLAYBACK_TIMEOUT');
    }, 250);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); finish(false, 'INTERRUPTED', false); };
  }, []);
  useEffect(() => { if (failed) { const timer = setTimeout(onNext, 2000); return () => clearTimeout(timer); } }, [failed]);
  useEffect(() => {
    const element = av.current;
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, volume / 100));
    element.muted = !audioEnabled || volume <= 0;
    void element.play().catch(() => { element.muted = true; setAudioBlocked(audioEnabled && volume > 0); void element.play().catch(fail); });
  }, [volume, audioEnabled]);
  const mediaProps = { src: media.url, autoPlay: true, playsInline: true, crossOrigin: 'anonymous' as const, onPlaying: start, onPause: accrue, onWaiting: accrue, onTimeUpdate: () => { progressAt.current = performance.now(); }, onEnded: () => finish(true, 'COMPLETED'), onError: fail };
  return <div style={{ height: '100%', width: '100%', position: 'relative', background: '#000' }}>
    {failed ? <div role="status" style={{ color: '#94a3b8', padding: 20 }}>Mídia indisponível. Avançando…</div> : media.type === 'VIDEO' ? <video ref={el => { av.current = el; }} {...mediaProps} style={{ width: '100%', height: '100%', objectFit: fit }} /> : media.type === 'AUDIO' ? <><audio ref={el => { av.current = el; }} {...mediaProps} /><div style={{ color: '#fff', padding: 20 }}>{media.name}</div></> : ['WEB_PAGE', 'PDF'].includes(media.type) ? <iframe src={media.url} title={media.name} onLoad={start} onError={fail} sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', border: 0 }} /> : <img src={media.url} alt={media.name} crossOrigin="anonymous" onLoad={start} onError={fail} style={{ width: '100%', height: '100%', objectFit: fit }} />}
    {audioBlocked && !failed && <button onClick={() => { if (av.current) { av.current.muted = false; void av.current.play().then(() => setAudioBlocked(false)).catch(fail); } }} style={{ position: 'absolute', bottom: 20, left: 20 }}>Ativar áudio</button>}
    <MediaQrCta cta={media.cta} mediaId={media.id} screenId={screenId} />
  </div>;
}
