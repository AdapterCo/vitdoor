import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { PairingScreen } from './components/PairingScreen';
import { LayoutRenderer } from './components/LayoutRenderer';
import { QueueTicketOverlay } from './components/QueueTicketOverlay';
import { setCache, getCache, addProofLog, clearContentCache } from './services/storageService';
import { syncProofLogs } from './services/proofSync';
import { campaignIsActive } from './services/schedule';
import { API_BASE, getWebSocketUrl } from './config';
function getRotationStyle(orientation?: string): React.CSSProperties {
  const norm = (orientation || 'HORIZONTAL').toString().toUpperCase();
  if (norm === '90' || norm === 'ROTATE_90') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      width: '100vh',
      height: '100vw',
      transform: 'translate(-50%, -50%) rotate(90deg)',
      transformOrigin: 'center center',
      overflow: 'hidden',
      background: '#000'
    };
  }
  if (norm === '270' || norm === 'ROTATE_270' || norm === 'VERTICAL') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      width: '100vh',
      height: '100vw',
      transform: 'translate(-50%, -50%) rotate(270deg)',
      transformOrigin: 'center center',
      overflow: 'hidden',
      background: '#000'
    };
  }
  if (norm === '180' || norm === 'ROTATE_180') {
    return {
      width: '100vw',
      height: '100vh',
      transform: 'rotate(180deg)',
      transformOrigin: 'center center',
      overflow: 'hidden',
      background: '#000'
    };
  }
  return {
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: '#000'
  };
}

export function App() {
  const [ready, setReady] = useState(false), [screen, setScreen] = useState<any>(null);
  const [pairing, setPairing] = useState<any>(null), [connected, setConnected] = useState(false);
  const [content, setContent] = useState<any>(null), [alert, setAlert] = useState<any>(null);
  const [ticket, setTicket] = useState<any>(null), [suspended, setSuspended] = useState(false);
  const [now, setNow] = useState(Date.now()), [error, setError] = useState('');
  const wsRef = useRef<WebSocket | null>(null), container = useRef<HTMLDivElement>(null);
  const current = useRef<any>(null), contentRef = useRef<any>(null);
  const token = () => localStorage.getItem('vitdoor_device_token') || '';
  const heartbeat = () => { if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'HEARTBEAT', currentMediaId: current.current?.id || null, currentMediaName: current.current?.name || null })); };
  const invalidate = async () => { localStorage.removeItem('vitdoor_device_token'); await clearContentCache(); contentRef.current = null; setContent(null); setScreen(null); setPairing(null); setAlert(null); };
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { Authorization: `Bearer ${token()}`, ...options.headers }, signal: AbortSignal.timeout(20_000) });
    if (response.status === 401) { await invalidate(); throw new Error('Dispositivo precisa ser pareado novamente.'); }
    if (response.status === 403) setSuspended(true);
    if (!response.ok) throw new Error(`Servidor indisponível (${response.status}).`);
    return response;
  };
  const applyContent = async (data: any, screenId: string) => {
    const version = data.manifestVersion || data.version;
    if (!version || version < (contentRef.current?.manifestVersion || 0)) return;
    const next = { ...data, orientation: data.orientation ?? data.screen?.orientation, volume: data.volume ?? data.screen?.volume, manifestVersion: version };
    await setCache(`content:${screenId}`, next);
    if (version !== contentRef.current?.manifestVersion) { contentRef.current = next; setContent(next); }
  };
  useEffect(() => { let disposed = false; void (async () => {
    const saved = await getCache('screenInfo');
    if (saved && token()) { const data = await getCache(`content:${saved.id}`); if (!disposed) { setScreen(saved); setContent(data); contentRef.current = data; } }
  })().catch(() => setError('Não foi possível abrir o armazenamento local.')).finally(() => { if (!disposed) setReady(true); }); return () => { disposed = true; }; }, []);
  useEffect(() => {
    if (!ready || screen) return;
    let disposed = false, busy = false;
    const poll = async () => { if (busy) return; busy = true; try {
      if (!pairing) { const r = await fetch(`${API_BASE}/device/pairing`, { method: 'POST', signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(); const data = await r.json(); if (!disposed) { setPairing(data); setError(''); } }
      else {
        const r = await fetch(`${API_BASE}/device/pairing/${pairing.pairingId}/status`, { method: 'POST', headers: { Authorization: `Pairing ${pairing.pairingSecret}` }, signal: AbortSignal.timeout(15000) });
        if (r.status === 410 || r.status === 401) { if (!disposed) setPairing(null); return; }
        if (!r.ok) throw new Error(); const data = await r.json();
        if (data.status === 'PAIRED' && !disposed) { const info = { id: data.screenId, name: data.screenName, orientation: data.screenOrientation }; localStorage.setItem('vitdoor_device_token', data.deviceToken); await setCache('screenInfo', info); setScreen(info); setError(''); }
      }
    } catch { if (!disposed) setError('Tentando conectar ao servidor?'); } finally { busy = false; } };
    void poll(); const interval = setInterval(() => void poll(), 3000); return () => { disposed = true; clearInterval(interval); };
  }, [ready, screen?.id, pairing]);
  useEffect(() => {
    if (!screen) return;
    let disposed = false, busy = false;
    const refresh = async () => { if (busy) return; busy = true; try {
      const data = await (await request('/device/manifest')).json();
      if (!disposed) { await applyContent(data, screen.id); setSuspended(false); setError(''); }
      const state = await (await request('/device/state')).json(); if (!disposed) setAlert(state.activeAlert || null);
      await syncProofLogs(screen.id, token());
    } catch { /* cached content remains playable during an outage */ } finally { busy = false; } };
    void request('/device/pairing/ack', { method: 'POST' }).catch(() => {});
    void request('/device/renew', { method: 'POST' }).then(r => r.json()).then(r => { if (!disposed) localStorage.setItem('vitdoor_device_token', r.deviceToken); }).catch(() => {});
    void refresh(); const interval = setInterval(() => void refresh(), 15000);
    return () => { disposed = true; clearInterval(interval); };
  }, [screen?.id]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!ticket) return; const timer = setTimeout(() => setTicket(null), 12000); return () => clearTimeout(timer); }, [ticket]);
  useEffect(() => {
    if (!screen) return;
    let disposed = false, retry: ReturnType<typeof setTimeout>, beat: ReturnType<typeof setInterval>, ws: WebSocket;
    const acknowledge = async (msg: any, success: boolean, message: string) => {
      if (!msg.commandId) return;
      await request(`/device/commands/${msg.commandId}/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: msg.type === 'CONTENT_UPDATED' ? 'SYNC' : msg.type, success, message }) });
    };
    const handle = async (msg: any) => {
      if (disposed) return;
      if (msg.expiresAt && Date.parse(msg.expiresAt) <= Date.now()) return;
      const commandKey = `command:${screen.id}:${msg.commandId}`;
      if (msg.commandId && await getCache(commandKey)) { await acknowledge(msg, true, 'Comando já aplicado.'); return; }
      try {
        if (['PAIRING_SUCCESS', 'CONTENT_UPDATED', 'PAIRING_CONFIRMED'].includes(msg.type)) {
          setSuspended(false); await applyContent(msg, screen.id);
          if ('activeAlert' in msg) setAlert(msg.activeAlert);
        } else if (msg.type === 'SET_VOLUME') {
          const next = { ...contentRef.current, volume: msg.payload?.volume ?? msg.volume };
          await setCache(`content:${screen.id}`, next); contentRef.current = next; setContent(next);
        } else if (msg.type === 'TAKE_SCREENSHOT') {
          if (!container.current || !msg.commandId) throw new Error('Captura indisponível.');
          const canvas = await html2canvas(container.current, { useCORS: true, backgroundColor: '#000', logging: false, scale: Math.min(1, 1280 / container.current.clientWidth) });
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Captura indisponível.')), 'image/jpeg', .6));
          const form = new FormData(); form.append('file', blob, 'screen.jpg');
          await request(`/device/screenshots/${msg.commandId}`, { method: 'POST', body: form });
          await setCache(commandKey, true); return;
        } else if (msg.type === 'REBOOT') {
          await setCache(commandKey, true); await acknowledge(msg, true, 'Recarregamento solicitado.'); location.reload(); return;
        } else if (msg.type === 'EMERGENCY_ALERT_TRIGGERED') setAlert(msg.alert);
        else if (msg.type === 'EMERGENCY_ALERT_CLEARED') setAlert(null);
        else if (msg.type === 'TICKET_CALLED') setTicket(msg);
        else if (msg.type === 'TENANT_SUSPENDED') setSuspended(true);
        else if (msg.type === 'DEVICE_AUTH_FAILED') { await invalidate(); return; }
        else if (msg.commandId) throw new Error('Comando não suportado pelo simulador web.');
        if (msg.commandId) { await setCache(commandKey, true); await acknowledge(msg, true, 'Comando aplicado.'); }
      } catch (e) { if (msg.commandId) await acknowledge(msg, false, e instanceof Error ? e.message : 'Falha ao aplicar comando.').catch(() => {}); }
    };
    const connect = () => {
      if (disposed) return; ws = new WebSocket(getWebSocketUrl()); wsRef.current = ws;
      ws.onopen = () => { setConnected(true); ws.send(JSON.stringify({ type: 'REGISTER_PLAYER', clientKind: 'WEB_SIMULATOR', deviceToken: token(), os: 'Web Simulator', appVersion: '1.0.0' })); beat = setInterval(heartbeat, 10000); };
      let messages = Promise.resolve(); ws.onmessage = event => { messages = messages.then(() => handle(JSON.parse(event.data))).catch(() => {}); };
      ws.onclose = () => { setConnected(false); clearInterval(beat); if (!disposed) retry = setTimeout(connect, 3000); };
    };
    connect(); return () => { disposed = true; clearTimeout(retry); clearInterval(beat); ws?.close(); };
  }, [screen?.id]);
  const activeCampaign = (content?.campaigns || []).filter((c: any) => campaignIsActive(c, new Date(now)) && c.playlist?.items?.length).sort((a: any, b: any) => b.priority - a.priority || a.id.localeCompare(b.id))[0];
  const visibleAlert = alert?.active && (!alert.expiresAt || Date.parse(alert.expiresAt) > now) ? alert : null;
  return <div ref={container} style={getRotationStyle(content?.orientation || screen?.orientation)}>
    {suspended ? <div style={{ color: '#fff', padding: 40 }}>Dispositivo temporariamente indisponível. Entre em contato com o responsável pela conta.</div> : !screen ? <><PairingScreen pairingCode={pairing?.pairingCode || '--- ---'} isConnected={connected} />{error && <div role="status" style={{ position: 'absolute', bottom: 20, color: '#fff' }}>{error}</div>}</> : <>
      {(!ticket || visibleAlert) && <LayoutRenderer key={`${screen.id}:${content?.manifestVersion}:${activeCampaign?.id || 'default'}`} activePlaylist={activeCampaign?.playlist || content?.activePlaylist} activeLayout={activeCampaign ? null : content?.activeLayout} activeAlert={visibleAlert} volume={content?.volume ?? 80} screenId={screen.id} orientation={content?.orientation || screen.orientation}
        onCurrent={(media, zone) => { if (zone === 'main') { current.current = media; heartbeat(); } }}
        onProof={event => { if (!content?.manifestVersion) return; void addProofLog({ ...event, eventId: crypto.randomUUID(), screenId: screen.id, manifestVersion: content.manifestVersion, campaignId: activeCampaign?.id }).then(() => syncProofLogs(screen.id, token())).catch(() => setError('Falha ao salvar registro de reprodução.')); }} />}
      <QueueTicketOverlay ticket={visibleAlert ? null : ticket} />
    </>}
  </div>;
}
