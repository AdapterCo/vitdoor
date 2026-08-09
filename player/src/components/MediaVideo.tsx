import React, { useEffect, useRef, useState } from 'react';

interface MediaVideoProps {
  src: string;
  volume?: number;
  loop?: boolean;
  onEnded?: () => void;
  objectFit?: React.CSSProperties['objectFit'];
  audioEnabled?: boolean;
}

export function MediaVideo({ src, volume = 80, loop = false, onEnded, objectFit = 'cover', audioEnabled = true }: MediaVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(!audioEnabled || volume <= 0);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.volume = Math.min(1, Math.max(0, volume / 100));
    const shouldMute = !audioEnabled || volume <= 0;
    video.muted = shouldMute;
    setMuted(shouldMute);
    setAudioBlocked(false);
    void video.play().catch(async () => {
      video.muted = true;
      setMuted(true);
      setAudioBlocked(audioEnabled && volume > 0);
      await video.play().catch(() => undefined);
    });
  }, [src, volume, audioEnabled]);

  const enableAudio = async () => {
    const video = ref.current;
    if (!video) return;
    video.muted = false;
    video.volume = Math.min(1, Math.max(0, volume / 100));
    await video.play();
    setMuted(false);
    setAudioBlocked(false);
  };

  return <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
    <video ref={ref} src={src} crossOrigin="anonymous" autoPlay muted={muted} playsInline loop={loop} onEnded={loop ? undefined : onEnded} style={{ width: '100%', height: '100%', objectFit, background: '#000' }} />
    {audioBlocked && <button onClick={() => void enableAudio()} style={{ position: 'absolute', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: 5, padding: '12px 18px', border: 0, borderRadius: '10px', background: 'rgba(15,23,42,.9)', color: '#fff', cursor: 'pointer' }}>Ativar áudio</button>}
  </div>;
}
