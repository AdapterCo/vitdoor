import React, { useEffect, useState } from 'react';
import { MultiZoneLayout } from './MultiZoneLayout';
import { MediaSequence, type PlaybackProps } from './MediaSequence';

export function LayoutRenderer({ activePlaylist, activeLayout, activeAlert, volume = 80, orientation = 'HORIZONTAL', ...events }: PlaybackProps & { activePlaylist?: any; activeLayout?: any; activeAlert?: any; volume?: number; orientation?: string }) {
  if (activeAlert?.active) return <div role="alert" style={{ width: '100%', height: '100%', background: '#991b1b', color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40 }}><div><h1 style={{ fontSize: '3.5rem' }}>{activeAlert.title}</h1><p style={{ fontSize: '2rem' }}>{activeAlert.message}</p></div></div>;
  if (activeLayout) return <MultiZoneLayout key={activeLayout.id} layout={activeLayout} activePlaylist={activePlaylist} volume={volume} orientation={orientation} {...events} />;
  return <PlaylistRenderer key={`${activePlaylist?.id}:${activePlaylist?.updatedAt}`} playlist={activePlaylist} volume={volume} orientation={orientation} {...events} />;
}
function PlaylistRenderer({ playlist, volume, orientation, ...events }: PlaybackProps & { playlist: any; volume: number; orientation: string }) {
  const [cycle, setCycle] = useState(0);
  const items = playlist?.items || [];
  const item = items[cycle % Math.max(1, items.length)];
  useEffect(() => {
    if (!item?.layout) return;
    const timer = setTimeout(() => setCycle(v => v + 1), Math.max(1, item.durationSeconds || 10) * 1000);
    return () => clearTimeout(timer);
  }, [cycle, item]);
  if (!item) return <div style={{ color: '#94a3b8', height: '100%', display: 'grid', placeItems: 'center' }}>Nenhuma mídia na programação atual</div>;
  if (item.layout) return <MultiZoneLayout key={cycle} layout={item.layout} volume={volume} orientation={orientation} {...events} />;
  return <MediaSequence key={cycle} items={[item]} volume={volume} fit="cover" onCycle={() => setCycle(v => v + 1)} {...events} />;
}
