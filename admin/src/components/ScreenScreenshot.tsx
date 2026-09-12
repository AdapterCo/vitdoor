import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';

/** Fetch through the same API origin as login, then render a local blob URL. */
export function ScreenScreenshot({ screenId, revision }: { screenId: string; revision: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let disposed = false; let objectUrl = '';
    setImage(''); setError('');
    void (async () => {
      const response = await apiFetch(`/screens/${encodeURIComponent(screenId)}/screenshot?v=${Date.now()}`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Não foi possível carregar a captura.'); }
      if (!/^image\/(jpeg|png)(;|$)/i.test(response.headers.get('Content-Type') || '')) throw new Error('O servidor não retornou uma imagem válida.');
      const blob = await response.blob();
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob); setImage(objectUrl);
    })().catch(error => { if (!disposed) setError(error instanceof Error ? error.message : 'Falha ao carregar captura.'); });
    return () => { disposed = true; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [screenId, revision, attempt]);
  if (error) return <div role="status" style={{ color: '#fca5a5', padding: 16, textAlign: 'center' }}><p>{error}</p><button className="btn-secondary" onClick={() => setAttempt(v => v + 1)}>Tentar carregar novamente</button></div>;
  if (!image) return <span role="status" style={{ color: '#94a3b8' }}>Carregando captura…</span>;
  return <img src={image} alt="Último screenshot capturado" onError={() => setError('A imagem recebida está corrompida. Solicite uma nova captura.')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
}
