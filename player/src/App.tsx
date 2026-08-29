import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { PairingScreen } from './components/PairingScreen';
import { LayoutRenderer } from './components/LayoutRenderer';
import { QueueTicketOverlay } from './components/QueueTicketOverlay';
import { setCache, getCache, addProofLog, getAllProofLogs, clearProofLogs } from './services/storageService';
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
  const [pairingCode, setPairingCode] = useState<string>('--- ---');
  const [pairingId, setPairingId] = useState<string>('');
  const [pairingSecret, setPairingSecret] = useState<string>('');
  const [paired, setPaired] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [screenInfo, setScreenInfo] = useState<any>(null);
  const [activePlaylist, setActivePlaylist] = useState<any>(null);
  const [activeLayout, setActiveLayout] = useState<any>(null);
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [calledTicket, setCalledTicket] = useState<any>(null);
  const [volume, setVolume] = useState<number>(80);
  const [suspended, setSuspended] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMediaNameRef = useRef('Aguardando programação');

  // Restore cached content on boot (Offline Support)
  useEffect(() => {
    (async () => {
      const cachedScreen = await getCache('screenInfo');
      const cachedPlaylist = await getCache('activePlaylist');
      const cachedLayout = await getCache('activeLayout');
      if (cachedScreen && localStorage.getItem('vitdoor_device_token')) {
        setScreenInfo(cachedScreen);
        setPaired(true);
      }
      if (cachedPlaylist) setActivePlaylist(cachedPlaylist);
      if (cachedLayout) setActiveLayout(cachedLayout);
    })();
  }, []);

  useEffect(() => {
    if (paired || pairingId) return;
    let cancelled = false;
    const createPairing = async () => {
      const response = await fetch(`${API_BASE}/device/pairing`, { method: 'POST' });
      if (!response.ok) throw new Error(`Falha ao solicitar código (${response.status})`);
      const session = await response.json();
      if (cancelled) return;
      setPairingId(session.pairingId);
      setPairingCode(session.pairingCode);
      setPairingSecret(session.pairingSecret);
    };
    createPairing().catch((error) => console.error('Pairing session error:', error));
    return () => { cancelled = true; };
  }, [paired, pairingId]);

  useEffect(() => {
    if (!pairingId || !pairingSecret || paired) return;
    const checkStatus = async () => {
      const response = await fetch(`${API_BASE}/device/pairing/${pairingId}/status`, {
        method: 'POST',
        headers: { Authorization: `Pairing ${pairingSecret}` }
      });
      if (response.status === 410) {
        setPairingId('');
        setPairingSecret('');
        setPairingCode('--- ---');
        return;
      }
      if (!response.ok) return;
      const result = await response.json();
      if (result.status === 'PAIRED') {
        localStorage.setItem('vitdoor_device_token', result.deviceToken);
        const info = { id: result.screenId, name: result.screenName, orientation: result.screenOrientation || 'HORIZONTAL' };
        setScreenInfo(info);
        await setCache('screenInfo', info);
        setPaired(true);
      }
    };
    void checkStatus();
    const interval = window.setInterval(() => void checkStatus(), 2500);
    return () => window.clearInterval(interval);
  }, [pairingId, pairingSecret, paired]);

  // WebSocket Connection Lifecycle
  useEffect(() => {
    if (!paired) return;
    let ws: WebSocket;
    let heartbeatInterval: any;
    let reconnectTimeout: number | undefined;
    let disposed = false;

    const connectWS = () => {
      ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        // Register player
        ws.send(JSON.stringify({
          type: 'REGISTER_PLAYER',
          pairingCode,
          deviceToken: localStorage.getItem('vitdoor_device_token'),
          os: 'Android TV (Simulated)',
          appVersion: '1.0.0'
        }));

        // Send Heartbeat every 10 seconds
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'HEARTBEAT',
              currentMediaName: currentMediaNameRef.current
            }));
          }
        }, 10000);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'PAIRING_SUCCESS' || msg.type === 'PAIRING_CONFIRMED') {
            setSuspended(false);
            const info = {
              id: msg.screenId,
              name: msg.screenName || 'TV Mídia Indoor',
              orientation: msg.orientation || msg.screenOrientation || 'HORIZONTAL'
            };
            setScreenInfo(info);
            await setCache('screenInfo', info);

            if (msg.activePlaylist) {
              setActivePlaylist(msg.activePlaylist);
              await setCache('activePlaylist', msg.activePlaylist);
            }
            if (Object.prototype.hasOwnProperty.call(msg, 'activeLayout')) {
              setActiveLayout(msg.activeLayout);
              await setCache('activeLayout', msg.activeLayout);
            }
            if (msg.activeAlert) setActiveAlert(msg.activeAlert);
            if (msg.volume !== undefined) setVolume(msg.volume);
            if (msg.forceReload && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'COMMAND_RESULT', action: 'SYNC', success: true, message: 'Programação recebida e aplicada pela tela.' }));
            }
          } else if (msg.type === 'CONTENT_UPDATED') {
            if (Object.prototype.hasOwnProperty.call(msg, 'activePlaylist')) {
              if (msg.forceReload) setActivePlaylist(null);
              setActivePlaylist(msg.activePlaylist);
              await setCache('activePlaylist', msg.activePlaylist);
            }
            if (Object.prototype.hasOwnProperty.call(msg, 'activeLayout')) {
              setActiveLayout(msg.activeLayout);
              await setCache('activeLayout', msg.activeLayout);
            }
            if (msg.volume !== undefined) setVolume(msg.volume);
          } else if (msg.type === 'SET_VOLUME') {
            if (msg.payload?.volume !== undefined) setVolume(msg.payload.volume);
          } else if (msg.type === 'REBOOT') {
            window.location.reload();
          } else if (msg.type === 'TAKE_SCREENSHOT') {
            if (containerRef.current) {
              try {
                const canvas = await html2canvas(containerRef.current, {
                  useCORS: true,
                  allowTaint: false,
                  backgroundColor: '#000',
                  logging: false
                });
                const imageDataUrl = canvas.toDataURL('image/jpeg', 0.6);
                ws.send(JSON.stringify({
                  type: 'SCREENSHOT_RESULT',
                  imageDataUrl
                }));
              } catch (e) {
                console.error('Failed to capture screenshot:', e);
                ws.send(JSON.stringify({
                  type: 'COMMAND_RESULT',
                  action: 'TAKE_SCREENSHOT',
                  success: false,
                  message: 'Não foi possível capturar a tela. Verifique as permissões da mídia.'
                }));
              }
            }
          } else if (msg.type === 'EMERGENCY_ALERT_TRIGGERED') {
            setActiveAlert(msg.alert);
          } else if (msg.type === 'EMERGENCY_ALERT_CLEARED') {
            setActiveAlert(null);
          } else if (msg.type === 'TICKET_CALLED') {
            setCalledTicket({
              ticketNumber: msg.ticketNumber,
              deskName: msg.deskName,
              audioText: msg.audioText,
              calledAt: msg.calledAt
            });
          } else if (msg.type === 'TENANT_SUSPENDED') {
            setSuspended(true);
            setActiveAlert(null);
          } else if (msg.type === 'DEVICE_AUTH_FAILED') {
            localStorage.removeItem('vitdoor_device_token');
            setPaired(false);
            setScreenInfo(null);
            setPairingId('');
            setPairingSecret('');
            setPairingCode('--- ---');
          }
        } catch (err) {
          console.error('Error handling websocket message:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        clearInterval(heartbeatInterval);
        if (!disposed) reconnectTimeout = window.setTimeout(connectWS, 3000);
      };
    };

    connectWS();

    return () => {
      disposed = true;
      if (ws) ws.close();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
    };
  }, [pairingCode, paired]);

  // Log proof-of-play
  const handleMediaChanged = async (mediaName: string) => {
    currentMediaNameRef.current = mediaName;
    if (!screenInfo?.id) return;
    const logItem = {
      eventId: crypto.randomUUID(),
      screenId: screenInfo.id,
      mediaName,
      playedAt: new Date().toISOString(),
      durationSeconds: 10,
      completed: true
    };

    await addProofLog(logItem);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        const logs = await getAllProofLogs();
        if (logs.length > 0) {
          const response = await fetch(`${API_BASE}/proof-of-play/log-batch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('vitdoor_device_token') || ''}`
            },
            body: JSON.stringify({ items: logs })
          });
          if (!response.ok) {
            throw new Error(`Servidor recusou os eventos (${response.status})`);
          }
          const result = await response.json();
          if (result.accepted > 0 || result.count > 0 || result.received > 0) {
            await clearProofLogs();
          }
        }
      } catch (err) {
        console.warn('Failed to sync proof logs to server, keeping in IndexedDB:', err);
      }
    }
  };

  return (
    <div ref={containerRef} style={getRotationStyle(screenInfo?.orientation || activeLayout?.orientation)}>
      {suspended ? (
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: '#020617', color: '#94a3b8', textAlign: 'center' }}><div><h1 style={{ color: '#fff' }}>Dispositivo temporariamente indisponível</h1><p>Entre em contato com o responsável pela conta.</p></div></div>
      ) : !paired ? (
        <PairingScreen pairingCode={pairingCode} isConnected={isConnected} />
      ) : (
        <>
          <LayoutRenderer
            activePlaylist={activePlaylist}
            activeLayout={activeLayout}
            activeAlert={activeAlert}
            volume={volume}
            screenId={screenInfo?.id}
            orientation={screenInfo?.orientation || activeLayout?.orientation || 'HORIZONTAL'}
            onMediaChanged={handleMediaChanged}
          />
          <QueueTicketOverlay ticket={calledTicket} />
        </>
      )}
    </div>
  );
}
