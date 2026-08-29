import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { MultiZoneLayout } from './MultiZoneLayout';
import { MediaVideo } from './MediaVideo';
import { MediaQrCta } from './MediaQrCta';

interface LayoutRendererProps {
  activePlaylist?: any;
  activeLayout?: any;
  activeAlert?: any;
  onMediaChanged?: (mediaName: string) => void;
  volume?: number;
  screenId?: string;
  orientation?: string;
}

export const LayoutRenderer: React.FC<LayoutRendererProps> = ({
  activePlaylist,
  activeLayout,
  activeAlert,
  onMediaChanged,
  volume = 80,
  screenId,
  orientation = 'HORIZONTAL'
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [countdown, setCountdown] = useState(15);

  const items = activePlaylist?.items || [];
  const currentItem = items.length > 0 ? items[currentIndex % items.length] : null;
  const currentMedia = currentItem?.media;
  const currentDuration = currentItem?.durationSeconds || currentMedia?.durationSeconds || 10;
  const advance = () => {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next < items.length) return next;
      return activePlaylist?.isLoop === false ? prev : 0;
    });
  };

  useEffect(() => {
    setCurrentIndex(0);
  }, [activePlaylist?.id, activePlaylist?.updatedAt]);

  // Auto-advance media timer strictly adhering to currentDuration
  useEffect(() => {
    if (items.length === 0) return;

    setCountdown(currentDuration);
    if (currentMedia?.name && onMediaChanged) {
      onMediaChanged(currentMedia.name);
    }

    const countdownInterval = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : currentDuration));
    }, 1000);

    const timer = setTimeout(() => {
      advance();
    }, (currentDuration + (currentMedia?.type === 'VIDEO' ? 2 : 0)) * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(countdownInterval);
    };
  }, [currentIndex, items.length, currentDuration, currentMedia, activePlaylist?.isLoop]);

  if (activeLayout) {
    return <MultiZoneLayout layout={activeLayout} activePlaylist={activePlaylist} activeAlert={activeAlert} volume={volume} orientation={orientation} />;
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#000',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Main Content Area */}
      <div style={{ flex: 1, position: 'relative', width: '100%', background: '#090d16', overflow: 'hidden' }}>
        {currentMedia ? (
          currentMedia.type === 'VIDEO' ? (
            <MediaVideo
              src={currentMedia.url}
              volume={volume}
              loop={items.length === 1 && activePlaylist?.isLoop !== false}
              onEnded={advance}
              objectFit="cover"
            />
          ) : currentMedia.type === 'WEB_PAGE' ? (
            <iframe
              src={currentMedia.url}
              title={currentMedia.name}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          ) : (
            <img
              src={currentMedia.url}
              alt={currentMedia.name}
              crossOrigin="anonymous"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#94a3b8',
            fontSize: '1.5rem',
            textAlign: 'center'
          }}>
            📺 Nenhuma mídia na programação atual
          </div>
        )}
        <MediaQrCta cta={currentMedia?.cta} mediaId={currentMedia?.id} screenId={screenId} />

      </div>

      {/* Emergency Overlay Modal */}
      {activeAlert && activeAlert.active && (
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
      )}
    </div>
  );
};
