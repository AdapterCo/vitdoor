import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { PairingScreen } from './components/PairingScreen';
import { LayoutRenderer } from './components/LayoutRenderer';
import { setCache, getCache, addProofLog, getAllProofLogs, clearProofLogs } from './services/storageService';
import { API_BASE, getWebSocketUrl } from './config';

function getOrGeneratePairingCode(): string {
  let code = localStorage.getItem('vitdoor_pairing_code');
  if (!code) {
    const num1 = Math.floor(100 + Math.random() * 900);
    const num2 = Math.floor(100 + Math.random() * 900);
    code = `${num1}-${num2}`;
    localStorage.setItem('vitdoor_pairing_code', code);
  }
  return code;
}

export function App() {
  const [pairingCode] = useState<string>(getOrGeneratePairingCode());
  const [paired, setPaired] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [screenInfo, setScreenInfo] = useState<any>(null);
  const [activePlaylist, setActivePlaylist] = useState<any>(null);
  const [activeLayout, setActiveLayout] = useState<any>(null);
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [volume, setVolume] = useState<number>(80);

  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Restore cached content on boot (Offline Support)
  useEffect(() => {
    (async () => {
      const cachedScreen = await getCache('screenInfo');
      const cachedPlaylist = await getCache('activePlaylist');
      const cachedLayout = await getCache('activeLayout');
      if (cachedScreen) {
        setScreenInfo(cachedScreen);
        setPaired(true);
      }
      if (cachedPlaylist) setActivePlaylist(cachedPlaylist);
      if (cachedLayout) setActiveLayout(cachedLayout);
    })();
  }, []);

  // WebSocket Connection Lifecycle
  useEffect(() => {
    let ws: WebSocket;
    let heartbeatInterval: any;

    const connectWS = () => {
      ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        // Register player
        ws.send(JSON.stringify({
          type: 'REGISTER_PLAYER',
          pairingCode,
          ipAddress: '192.168.1.100',
          os: 'Android TV (Simulated)',
          appVersion: '1.0.0'
        }));

        // Send Heartbeat every 10 seconds
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'HEARTBEAT',
              ramUsagePercent: Math.floor(25 + Math.random() * 15),
              cpuUsagePercent: Math.floor(10 + Math.random() * 20),
              storageFreeMb: 4096
            }));
          }
        }, 10000);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'PAIRING_SUCCESS' || msg.type === 'PAIRING_CONFIRMED') {
            setPaired(true);
            const info = { id: msg.screenId, name: msg.screenName || 'TV Mídia Indoor', tenantId: msg.tenantId };
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
          }
        } catch (err) {
          console.error('Error handling websocket message:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        clearInterval(heartbeatInterval);
        setTimeout(connectWS, 3000); // Reconnect after 3 sec
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [pairingCode]);

  // Quick auto pair demo action
  const handleAutoPair = async () => {
    try {
      await fetch(`${API_BASE}/auth/seed`, { method: 'POST' });
      const tenantsRes = await fetch(`${API_BASE}/tenants`);
      const tenants = await tenantsRes.json();
      if (!tenants || tenants.length === 0) return;

      const tenantId = tenants[0].id;
      const res = await fetch(`${API_BASE}/screens/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          pairingCode,
          name: 'TV Principal Conectada',
          locationName: 'Sede Central - Recepção',
          groupName: 'Recepção',
          orientation: 'HORIZONTAL'
        })
      });

      if (res.ok) {
        const screenData = await res.json();
        setPaired(true);
        setScreenInfo(screenData);
        await setCache('screenInfo', screenData);
      }
    } catch (err) {
      console.error('Auto pair failed:', err);
    }
  };

  // Log proof-of-play
  const handleMediaChanged = async (mediaName: string) => {
    if (!screenInfo?.id) return;
    const logItem = {
      tenantId: screenInfo.tenantId || 'demo',
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: logs })
          });
          if (!response.ok) {
            throw new Error(`Servidor recusou os eventos (${response.status})`);
          }
          const result = await response.json();
          if (result.count === logs.length) {
            await clearProofLogs();
          }
        }
      } catch (err) {
        console.warn('Failed to sync proof logs to server, keeping in IndexedDB:', err);
      }
    }
  };

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {!paired ? (
        <PairingScreen pairingCode={pairingCode} isConnected={isConnected} />
      ) : (
        <LayoutRenderer
          activePlaylist={activePlaylist}
          activeLayout={activeLayout}
          activeAlert={activeAlert}
          onMediaChanged={handleMediaChanged}
        />
      )}
    </div>
  );
}
