import React, { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { MediaVideo } from './MediaVideo';

export function MultiZoneLayout({ layout, activePlaylist, activeAlert, volume = 80 }: { layout: any; activePlaylist?: any; activeAlert?: any; volume?: number }) {
  const config = useMemo(() => {
    if (!layout) return null;
    if (layout.canvasConfig && typeof layout.canvasConfig === 'object') {
      return layout.canvasConfig;
    }
    if (layout.canvasConfigJson) {
      try { return JSON.parse(layout.canvasConfigJson); } catch { return null; }
    }
    return null;
  }, [layout?.id, layout?.canvasConfig, layout?.canvasConfigJson]);
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, []);
  if (!config) return <div style={{ width: '100vw', height: '100vh', background: '#000', color: '#fff', display: 'grid', placeItems: 'center' }}>Layout inválido</div>;

  return <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      {(config.zones || []).map((zone: any, zoneIndex: number) => {
        const zoneItems = (zone.items && zone.items.length > 0) ? zone.items : (activePlaylist?.items || []);
        return (
          <div key={zone.id} style={{ width: `${zone.widthPercent}%`, height: '100%', overflow: 'hidden', borderRight: '1px solid rgba(255,255,255,.08)' }}>
            <ZonePlayer items={zoneItems} fit={zone.fit || 'CONTAIN'} volume={volume} loop={zone.loop !== false} audioEnabled={typeof zone.audioEnabled === 'boolean' ? zone.audioEnabled : zoneIndex === 0} />
          </div>
        );
      })}
    </div>
    {config.ticker?.enabled && <div style={{ height: '64px', flexShrink: 0, background: '#0f172a', borderTop: '2px solid #2563eb', color: '#fff', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}><div style={{ whiteSpace: 'nowrap', paddingLeft: '100%', animation: 'layout-marquee 28s linear infinite', fontSize: '1.15rem' }}>{config.ticker.text}</div></div>
      {config.clock?.enabled && config.clock.position === 'FOOTER' && <ClockDisplay time={time} footer />}
      <style>{`@keyframes layout-marquee{from{transform:translateX(0)}to{transform:translateX(-100%)}}`}</style>
    </div>}
    {config.clock?.enabled && config.clock.position !== 'FOOTER' && <div style={{ position: 'absolute', ...clockPositionStyle(config.clock.position), zIndex: 20 }}><ClockDisplay time={time} /></div>}
    {activeAlert?.active && <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(185,28,28,.96)', color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '40px' }}><div><h1 style={{ fontSize: '3.5rem' }}>{activeAlert.title}</h1><p style={{ fontSize: '2rem' }}>{activeAlert.message}</p></div></div>}
  </div>;
}

function ClockDisplay({ time, footer = false }: { time: string; footer?: boolean }) {
  return <span style={{
    display: 'flex', gap: '7px', alignItems: 'center', color: '#fff', whiteSpace: 'nowrap',
    padding: footer ? '0 20px' : '11px 16px',
    borderRadius: footer ? 0 : '12px',
    background: footer ? '#1e293b' : 'rgba(15,23,42,.82)',
    backdropFilter: 'blur(10px)', height: footer ? '100%' : undefined
  }}><Clock size={18} /> {time}</span>;
}

function clockPositionStyle(position?: string): React.CSSProperties {
  const edge = '18px';
  switch (position) {
    case 'TOP_LEFT': return { top: edge, left: edge };
    case 'BOTTOM_LEFT': return { bottom: edge, left: edge };
    case 'BOTTOM_RIGHT': return { bottom: edge, right: edge };
    default: return { top: edge, right: edge };
  }
}

function ZonePlayer({ items, fit, volume, loop, audioEnabled }: { items: any[]; fit: string; volume: number; loop: boolean; audioEnabled: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [JSON.stringify(items.map((item) => item.mediaId))]);
  const item = items[index % Math.max(1, items.length)];
  const advance = () => items.length > 1 && setIndex((current) => loop ? (current + 1) % items.length : Math.min(current + 1, items.length - 1));
  useEffect(() => {
    if (!item || item.type === 'VIDEO') return;
    const timer = setTimeout(advance, Math.max(1, item.durationSeconds || 10) * 1000);
    return () => clearTimeout(timer);
  }, [index, item?.mediaId, item?.durationSeconds]);
  if (!item) return <div style={{ width: '100%', height: '100%', background: '#111827', color: '#64748b', display: 'grid', placeItems: 'center' }}>Área sem conteúdo</div>;
  const objectFit = fit === 'COVER' ? 'cover' : fit === 'FILL' ? 'fill' : 'contain';
  if (item.type === 'VIDEO') return <MediaVideo key={item.mediaId} src={item.url} volume={volume} audioEnabled={audioEnabled} loop={items.length === 1 && loop} onEnded={advance} objectFit={objectFit} />;
  if (item.type === 'WEB_PAGE') return <iframe src={item.url} title={item.name} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', border: 0 }} />;
  return <img src={item.url} crossOrigin="anonymous" alt={item.name} style={{ width: '100%', height: '100%', objectFit, background: '#000' }} />;
}
