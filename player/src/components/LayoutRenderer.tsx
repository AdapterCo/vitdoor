import { AlertTriangle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { MultiZoneLayout } from './MultiZoneLayout';
import { MediaSequence, type PlaybackProps } from './MediaSequence';

export function LayoutRenderer({ activePlaylist, activeLayout, activeAlert, volume = 80, orientation = 'HORIZONTAL', ...events }: PlaybackProps & { activePlaylist?: any; activeLayout?: any; activeAlert?: any; volume?: number; orientation?: string }) {
  if (activeAlert?.active) return (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: activeAlert.alertType === 'EVACUATION' || activeAlert.alertType === 'DANGER'
            ? 'rgba(185, 28, 28, 0.95)'
            : activeAlert.alertType === 'INFO'
            ? 'rgba(29, 78, 216, 0.95)'
            : 'rgba(180, 83, 9, 0.95)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px',
          textAlign: 'center',
          animation: 'pulse 1.5s infinite'
        }}>
          <AlertTriangle size={120} color="#fff" style={{ marginBottom: '24px' }} />
          <h1 style={{ fontSize: '3.5rem', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>
            {activeAlert.title}
          </h1>
          <p style={{ fontSize: '2rem', fontWeight: 500, maxWidth: '900px', lineHeight: '1.4' }}>
            {activeAlert.message}
          </p>
        </div>
  );
  if (activeLayout) return <MultiZoneLayout key={activeLayout.id} layout={activeLayout} activePlaylist={activePlaylist} volume={volume} orientation={orientation} {...events} />;
  return <PlaylistRenderer key={`${activePlaylist?.id}:${activePlaylist?.updatedAt}`} playlist={activePlaylist} volume={volume} orientation={orientation} {...events} />;
}
function PlaylistRenderer({ playlist, volume, orientation, ...events }: PlaybackProps & { playlist: any; volume: number; orientation: string }) {
  const [cycle, setCycle] = useState(0);
  const items = playlist?.items || [];
  const item = items[cycle % Math.max(1, items.length)];
  const advance = () => setCycle(v => playlist?.isLoop !== false || v < items.length - 1 ? v + 1 : v);
  useEffect(() => {
    if (!item?.layout) return;
    const timer = setTimeout(advance, Math.max(1, item.durationSeconds || 10) * 1000);
    return () => clearTimeout(timer);
  }, [cycle, item]);
  if (!item) return <div style={{ color: '#94a3b8', height: '100%', display: 'grid', placeItems: 'center' }}>Nenhuma mídia na programação atual</div>;
  if (item.layout) return <MultiZoneLayout key={cycle} layout={item.layout} volume={volume} orientation={orientation} {...events} />;
  return <MediaSequence key={cycle} items={[item]} volume={volume} fit="cover" onCycle={advance} {...events} />;
}
