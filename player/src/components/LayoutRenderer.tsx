import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Newspaper } from 'lucide-react';
import { MultiZoneLayout } from './MultiZoneLayout';

interface LayoutRendererProps {
  activePlaylist?: any;
  activeLayout?: any;
  activeAlert?: any;
  onMediaChanged?: (mediaName: string) => void;
}

export const LayoutRenderer: React.FC<LayoutRendererProps> = ({
  activePlaylist,
  activeLayout,
  activeAlert,
  onMediaChanged
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
    return <MultiZoneLayout layout={activeLayout} activeAlert={activeAlert} />;
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
            <video
              src={currentMedia.url}
              crossOrigin="anonymous"
              autoPlay
              muted
              playsInline
              onEnded={advance}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : currentMedia.type === 'WEB_PAGE' ? (
            <iframe
              src={currentMedia.url}
              title={currentMedia.name}
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          ) : currentMedia.type === 'RSS' ? (
            /* Dedicated RSS News Display Card */
            <div style={{
              width: '100%',
              height: '100%',
              background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px',
              color: '#fff',
              position: 'relative'
            }}>
              {/* Badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid #3b82f6',
                padding: '10px 24px',
                borderRadius: '50px',
                color: '#60a5fa',
                fontWeight: 700,
                fontSize: '1.1rem',
                marginBottom: '30px'
              }}>
                <Newspaper size={24} /> {currentMedia.name}
              </div>

              {/* News Headline Box */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '24px',
                padding: '50px 70px',
                textAlign: 'center',
                maxWidth: '900px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
              }}>
                <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#f8fafc', lineHeight: '1.3', marginBottom: '20px' }}>
                  Mercado Financeiro e Notícias Internacionais em Tempo Real
                </h2>

                <p style={{ fontSize: '1.3rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                  Acompanhe as principais atualizações do feed RSS configurado: <strong>{currentMedia.url}</strong>.
                  Novas manchetes são atualizadas automaticamente.
                </p>

                <div style={{
                  marginTop: '30px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(30, 41, 59, 0.9)',
                  padding: '8px 20px',
                  borderRadius: '10px',
                  color: '#94a3b8',
                  fontSize: '0.95rem'
                }}>
                  <Clock size={16} color="#60a5fa" /> Exibindo por: <strong style={{ color: '#fff' }}>{countdown}s</strong> (Limite: {currentDuration}s)
                </div>
              </div>
            </div>
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

      </div>

      {/* Emergency Overlay Modal */}
      {activeAlert && activeAlert.active && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(185, 28, 28, 0.95)',
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
