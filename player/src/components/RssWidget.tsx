import React, { useEffect, useState } from 'react';
import { Newspaper, Clock } from 'lucide-react';

interface RssWidgetProps {
  mediaName: string;
  feedUrl: string;
  durationSeconds: number;
}

export const RssWidget: React.FC<RssWidgetProps> = ({ mediaName, feedUrl, durationSeconds }) => {
  const [feedData, setFeedData] = useState<any>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadRss = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/public/rss?url=${encodeURIComponent(feedUrl)}`);
        if (!res.ok) throw new Error('Falha ao carregar notícias.');
        const data = await res.json();
        if (active && data.items && data.items.length > 0) {
          setFeedData(data);
        }
      } catch (err) {
        console.error('Error fetching RSS:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadRss();
    return () => { active = false; };
  }, [feedUrl]);

  // Rotaciona artigos do feed RSS a cada 6 segundos durante a permanência do slide
  useEffect(() => {
    if (!feedData?.items?.length || feedData.items.length <= 1) return;
    const interval = setInterval(() => {
      setItemIndex((prev) => (prev + 1) % feedData.items.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [feedData]);

  const currentArticle = feedData?.items?.[itemIndex] || null;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 60px',
      color: '#fff',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Badge Superior do Feed */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'rgba(59, 130, 246, 0.2)',
        border: '1px solid #3b82f6',
        padding: '8px 22px',
        borderRadius: '50px',
        color: '#60a5fa',
        fontWeight: 700,
        fontSize: '1rem',
        marginBottom: '24px'
      }}>
        <Newspaper size={20} /> {feedData?.title || mediaName}
      </div>

      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: '1.2rem', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          Carregando últimas notícias do feed...
        </div>
      ) : currentArticle ? (
        <div style={{
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '24px',
          padding: '36px 48px',
          display: 'flex',
          gap: '32px',
          alignItems: 'center',
          maxWidth: '1000px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          transition: 'all 0.5s ease-in-out'
        }}>
          {currentArticle.imageUrl && (
            <img
              src={currentArticle.imageUrl}
              alt=""
              style={{
                width: '260px',
                height: '180px',
                objectFit: 'cover',
                borderRadius: '16px',
                background: '#1e293b',
                flexShrink: 0
              }}
            />
          )}

          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', lineHeight: '1.3', marginBottom: '12px' }}>
              {currentArticle.title}
            </h2>

            {currentArticle.description && (
              <p style={{ fontSize: '1.05rem', color: '#cbd5e1', lineHeight: '1.5', margin: 0 }}>
                {currentArticle.description}
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', color: '#64748b', fontSize: '0.82rem' }}>
              <Clock size={14} color="#60a5fa" />
              <span>{new Date(currentArticle.pubDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span>· Notícia {(itemIndex % feedData.items.length) + 1} de {feedData.items.length}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <h3>{mediaName}</h3>
          <p style={{ marginTop: '8px' }}>URL: {feedUrl}</p>
        </div>
      )}
    </div>
  );
};
