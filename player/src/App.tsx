import React, { useState, useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { PairingScreen } from './components/PairingScreen';
import { LayoutRenderer } from './components/LayoutRenderer';
import { setCache, getCache, addProofLog, getAllProofLogs, clearProofLogs } from './services/storageService';
import { API_BASE, getWebSocketUrl } from './config';

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
  const [volume, setVolume] = useState<number>(80);
  const [suspended, setSuspended] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMediaNameRef = useRef('Aguardando programação');
  const manifestVersionRef = useRef(0);
  const manifestChecksumRef = useRef('');

  const applyManifest = useCallback(async (manifest: any): Promise<boolean> => {
    if (!await verifyManifest(manifest)) return false;
    if (manifest.version < manifestVersionRef.current) return false;
    if (manifest.version === manifestVersionRef.current && manifestChecksumRef.current && manifest.checksum !== manifestChecksumRef.current) return false;
    manifestVersionRef.current = manifest.version;
    manifestChecksumRef.current = manifest.checksum;
    setActivePlaylist(manifest.activePlaylist ?? null);
    setActiveLayout(manifest.activeLayout ?? null);
    if (Number.isFinite(manifest.screen?.volume)) setVolume(manifest.screen.volume);
    await Promise.all([
      setCache('manifest', manifest),
      setCache('activePlaylist', manifest.activePlaylist ?? null),
      setCache('activeLayout', manifest.activeLayout ?? null)
    ]);
    return true;
  }, []);

  // Restore cached content on boot (Offline Support)
  useEffect(() => {
    (async () => {
      const cachedScreen = await getCache('screenInfo');
      const cachedPlaylist = await getCache('activePlaylist');
      const cachedLayout = await getCache('activeLayout');
      const cachedManifest = await getCache('manifest');
      if (cachedScreen && localStorage.getItem('vitdoor_device_token')) {
        setScreenInfo(cachedScreen);
        setPaired(true);
      }
      if (cachedManifest && await applyManifest(cachedManifest)) return;
      if (cachedPlaylist) setActivePlaylist(cachedPlaylist);
      if (cachedLayout) setActiveLayout(cachedLayout);
    })();
  }, [applyManifest]);

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
        const info = { id: result.screenId, name: result.screenName };
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
            const info = { id: msg.screenId, name: msg.screenName || 'TV Mídia Indoor' };
            setScreenInfo(info);
            await setCache('screenInfo', info);

            if (msg.manifest && !await applyManifest(msg.manifest)) {
              ws.send(JSON.stringify({ type: 'COMMAND_RESULT', action: 'MANIFEST', success: false, message: 'Manifesto rejeitado: versão ou checksum inválido.' }));
              return;
            }

            if (!msg.manifest && msg.activePlaylist) {
              setActivePlaylist(msg.activePlaylist);
              await setCache('activePlaylist', msg.activePlaylist);
            }
            if (!msg.manifest && Object.prototype.hasOwnProperty.call(msg, 'activeLayout')) {
              setActiveLayout(msg.activeLayout);
              await setCache('activeLayout', msg.activeLayout);
            }
            if (msg.activeAlert) setActiveAlert(msg.activeAlert);
            if (msg.volume !== undefined) setVolume(msg.volume);
            if (msg.forceReload && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'COMMAND_RESULT', action: 'SYNC', success: true, message: 'Programação recebida e aplicada pela tela.' }));
            }
          } else if (msg.type === 'MANIFEST_UPDATED') {
            const applied = await applyManifest(msg.manifest);
            ws.send(JSON.stringify({
              type: 'COMMAND_RESULT',
              action: 'SYNC',
              success: applied,
              message: applied
                ? `Manifesto v${msg.manifest.version} validado e aplicado.`
                : 'Manifesto rejeitado: versão ou checksum inválido.'
            }));
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
  }, [applyManifest, pairingCode, paired]);

  // Log proof-of-play
  const handleMediaChanged = async (mediaName: string) => {
    currentMediaNameRef.current = mediaName;
    if (!screenInfo?.id) return;
    const logItem = {
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
      {suspended ? (
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: '#020617', color: '#94a3b8', textAlign: 'center' }}><div><h1 style={{ color: '#fff' }}>Dispositivo temporariamente indisponível</h1><p>Entre em contato com o responsável pela conta.</p></div></div>
      ) : !paired ? (
        <PairingScreen pairingCode={pairingCode} isConnected={isConnected} />
      ) : (
        <LayoutRenderer
          activePlaylist={activePlaylist}
          activeLayout={activeLayout}
          activeAlert={activeAlert}
          volume={volume}
          onMediaChanged={handleMediaChanged}
        />
      )}
    </div>
  );
}

async function verifyManifest(manifest: any): Promise<boolean> {
  if (!manifest || manifest.schemaVersion !== 1 || !Number.isInteger(manifest.version) || manifest.version < 1) return false;
  if (manifest.checksumAlgorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/i.test(manifest.checksum || '')) return false;
  if (!Array.isArray(manifest.assets)) return false;
  const invalidAsset = manifest.assets.some((asset: any) => {
    const isBinary = ['VIDEO', 'IMAGE', 'AUDIO', 'PDF'].includes(asset?.type);
    return !asset?.id || !asset?.url || (isBinary && (!/^[a-f0-9]{64}$/i.test(asset.checksum || '') || !Number.isFinite(asset.sizeBytes) || asset.sizeBytes <= 0));
  });
  if (invalidAsset) return false;

  const payload = {
    schemaVersion: manifest.schemaVersion,
    version: manifest.version,
    screen: manifest.screen,
    activePlaylist: manifest.activePlaylist,
    activeLayout: manifest.activeLayout,
    assets: manifest.assets
  };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const calculated = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return calculated === manifest.checksum.toLowerCase();
}
