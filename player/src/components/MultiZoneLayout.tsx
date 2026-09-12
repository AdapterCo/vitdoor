import React, { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { MediaSequence, type PlaybackProps } from './MediaSequence';
import { API_BASE } from '../config';

export function MultiZoneLayout({ layout, activePlaylist, activeAlert, volume = 80, orientation = 'HORIZONTAL', onProof, onCurrent, screenId }: PlaybackProps & { layout: any; activePlaylist?: any; activeAlert?: any; volume?: number; orientation?: string }) {
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

  if (!config) return <div style={{ width: '100%', height: '100%', background: '#000', color: '#fff', display: 'grid', placeItems: 'center' }}>Layout inválido</div>;

  const isVertical = orientation === 'VERTICAL' || orientation === 'PORTRAIT' || layout?.orientation === 'VERTICAL' || config?.orientation === 'VERTICAL';

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isVertical ? 'column' : 'row' }}>
        {(config.zones || []).map((zone: any, zoneIndex: number) => {
          const zoneItems = (zone.items && zone.items.length > 0) ? zone.items : (activePlaylist?.items || []);
          return (
            <div
              key={zone.id}
              style={{
                width: isVertical ? '100%' : `${zone.widthPercent}%`,
                height: isVertical ? `${zone.heightPercent || zone.widthPercent}%` : '100%',
                overflow: 'hidden',
                borderBottom: isVertical ? '1px solid rgba(255,255,255,.08)' : undefined,
                borderRight: isVertical ? undefined : '1px solid rgba(255,255,255,.08)'
              }}
            >
              <MediaSequence loop={zone.loop !== false} items={zoneItems.filter((item: any) => !item.layout)} fit={zone.fit === 'COVER' ? 'cover' : zone.fit === 'FILL' ? 'fill' : 'contain'} volume={volume} audioEnabled={typeof zone.audioEnabled === 'boolean' ? zone.audioEnabled : zoneIndex === 0} onProof={onProof} onCurrent={onCurrent} screenId={screenId} zoneId={zoneIndex === 0 ? 'main' : String(zone.id || zoneIndex)} />
            </div>
          );
        })}
      </div>
      {config.ticker?.enabled && <TickerFooter ticker={config.ticker} clockEnabled={config.clock?.enabled} clockPosition={config.clock?.position} time={time} />}
      {config.clock?.enabled && config.clock.position !== 'FOOTER' && <div style={{ position: 'absolute', ...clockPositionStyle(config.clock.position), zIndex: 20 }}><ClockDisplay time={time} /></div>}
      {activeAlert?.active && <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(185,28,28,.96)', color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '40px' }}><div><h1 style={{ fontSize: '3.5rem' }}>{activeAlert.title}</h1><p style={{ fontSize: '2rem' }}>{activeAlert.message}</p></div></div>}
    </div>
  );
}

const TICKER_FOOTER_STYLE: React.CSSProperties = { height: '64px', flexShrink: 0, background: '#0f172a', borderTop: '2px solid #2563eb', color: '#fff', display: 'flex', alignItems: 'center', overflow: 'hidden' };
const TICKER_TRACK_STYLE: React.CSSProperties = { whiteSpace: 'nowrap', paddingLeft: '100%', fontSize: '1.2rem', fontWeight: 600 };
const TICKER_KEYFRAMES = '@keyframes layout-marquee{from{transform:translateX(0)}to{transform:translateX(-100%)}}';

function TickerFooter({ ticker, clockEnabled, clockPosition, time }: { ticker: any; clockEnabled?: boolean; clockPosition?: string; time: string }) {
  const themes: { label: string; items: string[] }[] = ticker?.mode === 'RSS' && Array.isArray(ticker.themes) ? ticker.themes : [];
  const clock = clockEnabled && clockPosition === 'FOOTER' ? <ClockDisplay time={time} footer /> : null;

  if (themes.length > 0) return <RssTicker themes={themes} clock={clock} />;

  return (
    <div style={TICKER_FOOTER_STYLE}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ ...TICKER_TRACK_STYLE, animation: 'layout-marquee 35s linear infinite' }}>{ticker?.text || ''}</div>
      </div>
      {clock}
      <style>{TICKER_KEYFRAMES}</style>
    </div>
  );
}

/** Rodízio de temas RSS: sorteia um tema, passa todas as manchetes dele uma vez, depois sorteia outro. */
function RssTicker({ themes, clock }: { themes: { label: string; items: string[] }[]; clock: React.ReactNode }) {
  const [themeIndex, setThemeIndex] = useState(() => Math.floor(Math.random() * themes.length));
  const [itemIndex, setItemIndex] = useState(0);
  const [cycle, setCycle] = useState(0);

  const theme = themes[themeIndex % themes.length];
  const items = theme?.items || [];
  const safeItemIndex = itemIndex < items.length ? itemIndex : 0;
  const current = items[safeItemIndex] || '';

  const advance = () => {
    if (safeItemIndex + 1 < items.length) {
      setItemIndex(safeItemIndex + 1);
    } else {
      let next = Math.floor(Math.random() * themes.length);
      if (themes.length > 1 && next === themeIndex % themes.length) next = (next + 1) % themes.length;
      setThemeIndex(next);
      setItemIndex(0);
    }
    setCycle((value) => value + 1);
  };

  if (!current) return null;
  const seconds = Math.min(40, Math.max(14, Math.round(current.length / 6)));

  return (
    <div style={TICKER_FOOTER_STYLE}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div key={cycle} onAnimationEnd={advance} style={{ ...TICKER_TRACK_STYLE, animation: `layout-marquee ${seconds}s linear` }}>
          <span style={{ color: '#38bdf8', fontWeight: 800, marginRight: '16px' }}>{theme.label}</span>{current}
        </div>
      </div>
      {clock}
      <style>{TICKER_KEYFRAMES}</style>
    </div>
  );
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
