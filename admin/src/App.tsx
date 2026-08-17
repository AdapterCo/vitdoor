import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardTab } from './components/DashboardTab';
import { ScreensTab } from './components/ScreensTab';
import { MediaTab } from './components/MediaTab';
import { LayoutsTab } from './components/LayoutsTab';
import { PlaylistsTab } from './components/PlaylistsTab';
import { CampaignsTab } from './components/CampaignsTab';
import { ProofOfPlayTab } from './components/ProofOfPlayTab';
import { EmergencyTab } from './components/EmergencyTab';
import { TenantsTab } from './components/TenantsTab';
import { QueueTab } from './components/QueueTab';
import { QueueCallerApp } from './components/QueueCallerApp';
import { AdvertiserReportPage } from './components/AdvertiserReportPage';
import { getWebSocketUrl } from './config';
import { apiFetch } from './api';
import { LoginScreen } from './components/LoginScreen';

export function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [screens, setScreens] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [medias, setMedias] = useState<any[]>([]);
  const [mediaFolders, setMediaFolders] = useState<any[]>([]);
  const [layouts, setLayouts] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [qrStats, setQrStats] = useState<any>(null);
  const [activeTenant, setActiveTenant] = useState<any>(null);
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Restore and validate the authenticated session.
  useEffect(() => {
    const initData = async () => {
      sessionStorage.removeItem('vitdoor_token');
      localStorage.removeItem('vitdoor_token');
      try {
        const meResponse = await apiFetch('/auth/me');
        if (!meResponse.ok) return;
        const me = await meResponse.json();
        setUser(me);
        await initializeForUser(me);
      } catch (err) {
        console.error('Error restoring session:', err);
      } finally {
        setAuthLoading(false);
      }
    };

    initData();
    const logout = () => clearAuthenticatedState();
    window.addEventListener('vitdoor:logout', logout);
    return () => window.removeEventListener('vitdoor:logout', logout);
  }, []);

  const initializeForUser = async (loggedUser: any) => {
    if (loggedUser.role === 'SUPER_ADMIN') {
      const tenantsRes = await apiFetch('/tenants');
      if (!tenantsRes.ok) return;
      const tenantsData = await tenantsRes.json();
      setTenants(tenantsData);
      setActiveTenant(loggedUser.tenant);
      setActiveTab('dashboard');
      await loadTenantData(loggedUser.tenantId);
    } else {
      const tenant = loggedUser.tenant || {
        id: loggedUser.tenantId,
        name: loggedUser.tenantName
      };
      setTenants([tenant]);
      setActiveTenant(tenant);
      await loadTenantData(tenant.id);
    }
  };

  const loadTenantData = async (tenantId: string) => {
    setScreens([]); setPlaylists([]); setMedias([]); setMediaFolders([]); setLayouts([]); setCampaigns([]); setStats(null); setQrStats(null);
    try {
      const [screensRes, playlistsRes, mediasRes, foldersRes, layoutsRes, campaignsRes, statsRes, qrRes] = await Promise.all([
        apiFetch(`/screens?tenantId=${tenantId}`),
        apiFetch(`/playlists?tenantId=${tenantId}`),
        apiFetch(`/media?tenantId=${tenantId}`),
        apiFetch(`/media/folders?tenantId=${tenantId}`),
        apiFetch(`/layouts?tenantId=${tenantId}`),
        apiFetch(`/campaigns?tenantId=${tenantId}`),
        apiFetch(`/proof-of-play/stats?tenantId=${tenantId}`),
        apiFetch(`/qr-scans/stats?tenantId=${tenantId}&days=30`)
      ]);

      const responses = [screensRes, playlistsRes, mediasRes, foldersRes, layoutsRes, campaignsRes, statsRes];
      if (responses.some((response) => !response.ok)) throw new Error('Acesso ao cliente recusado.');
      setScreens(await screensRes.json());
      setPlaylists(await playlistsRes.json());
      setMedias(await mediasRes.json());
      setMediaFolders(await foldersRes.json());
      setLayouts(await layoutsRes.json());
      setCampaigns(await campaignsRes.json());
      setStats(await statsRes.json());
      if (qrRes.ok) setQrStats(await qrRes.json());
    } catch (err) {
      console.error('Error fetching tenant data:', err);
    }
  };

  // Realtime WebSocket for admin notifications
  useEffect(() => {
    if (!user || !activeTenant) return;
    let ws: WebSocket;
    let reconnectTimer: number | undefined;
    let disposed = false;
    const connectWS = () => {
      ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'REGISTER_ADMIN',
          tenantId: activeTenant?.id
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SCREEN_STATUS_CHANGED') {
            setScreens((prev) =>
              prev.map((s) => (s.id === data.screenId ? { ...s, status: data.status } : s))
            );
          } else if (data.type === 'SCREENSHOT_UPDATED') {
            setScreens((prev) =>
              prev.map((s) => (s.id === data.screenId ? { ...s, lastScreenshotUrl: data.imageUrl } : s))
            );
          } else if (data.type === 'SCREEN_TELEMETRY_UPDATE') {
            setScreens((prev) =>
              prev.map((s) => (s.id === data.screenId ? { ...s, ...data.telemetry, status: 'ONLINE' } : s))
            );
          } else if (data.type === 'COMMAND_RESULT') {
            console.info('Comando remoto concluído:', data);
          }
        } catch (e) {
          console.error('Error parsing admin websocket message:', e);
        }
      };

      ws.onclose = () => {
        if (!disposed) reconnectTimer = window.setTimeout(connectWS, 3000);
      };
    };

    connectWS();
    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [activeTenant?.id, user?.id]);

  // Actions
  const handlePairScreen = async (data: any) => {
    if (!activeTenant) return false;
    const res = await apiFetch('/screens/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, tenantId: activeTenant.id })
    });
    if (res.ok) {
      loadTenantData(activeTenant.id);
      return true;
    }
    const error = await res.json().catch(() => ({ error: 'Não foi possível ativar a tela.' }));
    alert(error.error);
    return false;
  };

  const handleUpdateScreen = async (screenId: string, data: any) => {
    const res = await apiFetch(`/screens/${screenId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, tenantId: activeTenant.id })
    });
    if (res.ok) {
      loadTenantData(activeTenant.id);
    }
  };

  const handleRemoteCommand = async (screenId: string, action: string, payload?: any) => {
    const response = await apiFetch(`/screens/${screenId}/remote-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, tenantId: activeTenant.id })
    });
    const result = await response.json();
    if (!response.ok) {
      console.warn('Não foi possível enviar o comando remoto:', result.message || result.error);
      return false;
    }
    await loadTenantData(activeTenant.id);
    return true;
  };

  const handleDeleteScreen = async (screenId: string) => {
    await apiFetch(`/screens/${screenId}?tenantId=${activeTenant.id}`, { method: 'DELETE' });
    loadTenantData(activeTenant.id);
  };

  const handleUploadFile = async (file: File, name: string, durationSeconds: number, tags: string, folderId?: string | null) => {
    if (!activeTenant) return false;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tenantId', activeTenant.id);
    formData.append('name', name);
    formData.append('durationSeconds', durationSeconds.toString());
    formData.append('tags', tags);
    if (folderId) formData.append('folderId', folderId);

    const response = await apiFetch('/media/upload', { method: 'POST', body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Falha no upload.' }));
      alert(error.error);
      return false;
    }
    loadTenantData(activeTenant.id);
    return true;
  };

  const handleUpdateMedia = async (id: string, data: any) => {
    const response = await apiFetch(`/media/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, tenantId: activeTenant.id })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Falha ao atualizar a mídia.' }));
      alert(error.error);
      return false;
    }
    await loadTenantData(activeTenant.id);
    return true;
  };

  const handleCreateWidget = async (widgetData: any) => {
    if (!activeTenant) return;
    await apiFetch('/media/widget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...widgetData, tenantId: activeTenant.id })
    });
    loadTenantData(activeTenant.id);
  };

  const handleDeleteMedia = async (id: string) => {
    await apiFetch(`/media/${id}?tenantId=${activeTenant.id}`, { method: 'DELETE' });
    loadTenantData(activeTenant.id);
  };

  const handleCreateMediaFolder = async (name: string) => {
    const response = await apiFetch('/media/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: activeTenant.id, name }) });
    if (!response.ok) { const error = await response.json(); alert(error.error); return false; }
    await loadTenantData(activeTenant.id); return true;
  };

  const handleRenameMediaFolder = async (id: string, name: string) => {
    const response = await apiFetch(`/media/folders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: activeTenant.id, name }) });
    if (!response.ok) { const error = await response.json(); alert(error.error); return false; }
    await loadTenantData(activeTenant.id); return true;
  };

  const handleDeleteMediaFolder = async (id: string) => {
    const response = await apiFetch(`/media/folders/${id}?tenantId=${activeTenant.id}`, { method: 'DELETE' });
    if (!response.ok) { const error = await response.json(); alert(error.error); return false; }
    await loadTenantData(activeTenant.id); return true;
  };

  const handleCreateLayout = async (layoutData: any) => {
    if (!activeTenant) return false;
    const response = await apiFetch('/layouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...layoutData, tenantId: activeTenant.id })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Falha ao criar layout.' }));
      alert(error.error);
      return false;
    }
    await loadTenantData(activeTenant.id);
    return true;
  };

  const handleUpdateLayout = async (id: string, layoutData: any) => {
    const response = await apiFetch(`/layouts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...layoutData, tenantId: activeTenant.id })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Falha ao atualizar layout.' }));
      alert(error.error);
      return false;
    }
    await loadTenantData(activeTenant.id);
    return true;
  };

  const handleDeleteLayout = async (id: string) => {
    if (!confirm('Excluir este layout? As telas vinculadas ficarão sem este layout.')) return;
    const response = await apiFetch(`/layouts/${id}?tenantId=${activeTenant.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Falha ao excluir layout.' }));
      alert(error.error);
      return;
    }
    await loadTenantData(activeTenant.id);
  };

  const handleCreatePlaylist = async (playlistData: any) => {
    if (!activeTenant) return false;
    const response = await apiFetch('/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...playlistData, tenantId: activeTenant.id })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Falha ao criar playlist.' }));
      alert(error.error);
      return false;
    }
    await loadTenantData(activeTenant.id);
    return true;
  };

  const handleUpdatePlaylist = async (id: string, playlistData: any) => {
    const response = await apiFetch(`/playlists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...playlistData, tenantId: activeTenant.id })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Falha ao editar playlist.' }));
      alert(error.error);
      return false;
    }
    await loadTenantData(activeTenant.id);
    return true;
  };

  const handleDeletePlaylist = async (id: string) => {
    await apiFetch(`/playlists/${id}?tenantId=${activeTenant.id}`, { method: 'DELETE' });
    loadTenantData(activeTenant.id);
  };

  const handleCreateCampaign = async (campaignData: any) => {
    if (!activeTenant) return;
    await apiFetch('/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...campaignData, tenantId: activeTenant.id })
    });
    loadTenantData(activeTenant.id);
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!activeTenant) return;
    await apiFetch(`/campaigns/${id}?tenantId=${activeTenant.id}`, { method: 'DELETE' });
    loadTenantData(activeTenant.id);
  };

  const handleTriggerEmergency = async (title: string, message: string, alertType: string, screenIds: string[]) => {
    if (!activeTenant) return;
    await apiFetch('/emergency/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: activeTenant.id, title, message, alertType, screenIds })
    });
  };

  const handleClearEmergency = async (screenIds: string[]) => {
    if (!activeTenant) return;
    await apiFetch('/emergency/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: activeTenant.id, screenIds })
    });
  };

  const handleCreateTenant = async (tenantData: any) => {
    const res = await apiFetch('/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tenantData)
    });
    if (res.ok) {
      const tenantsRes = await apiFetch('/tenants');
      setTenants(await tenantsRes.json());
    }
  };

  const handleUpdateTenant = async (tenantId: string, data: any) => {
    const response = await apiFetch(`/tenants/${tenantId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!response.ok) throw new Error('Não foi possível atualizar o cliente.');
    const tenantsResponse = await apiFetch('/tenants');
    if (tenantsResponse.ok) setTenants(await tenantsResponse.json());
  };

  const handleLogin = async (loggedUser: any) => {
    setUser(loggedUser);
    setAuthLoading(true);
    try {
      const meResponse = await apiFetch('/auth/me');
      const me = meResponse.ok ? await meResponse.json() : loggedUser;
      setUser(me);
      await initializeForUser(me);
    } finally {
      setAuthLoading(false);
    }
  };

  const clearAuthenticatedState = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setUser(null);
    setActiveTenant(null);
    setTenants([]); setScreens([]); setPlaylists([]); setMedias([]); setMediaFolders([]); setLayouts([]); setCampaigns([]); setStats(null); setQrStats(null);
    setActiveTab('dashboard');
    setIsPairModalOpen(false);
  };

  const handleLogout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearAuthenticatedState();
  };

  // If URL path is /chamar, render the standalone QueueCallerApp directly without requiring full admin login
  if (window.location.pathname === '/chamar' || window.location.pathname.startsWith('/chamar')) {
    return <QueueCallerApp />;
  }

  // If URL path is /report/media/:mediaId, render the public AdvertiserReportPage directly without requiring admin login
  const reportMediaMatch = window.location.pathname.match(/^\/report\/media\/([0-9a-f-]{36})/i);
  if (reportMediaMatch) {
    return <AdvertiserReportPage mediaId={reportMediaMatch[1]} />;
  }

  if (authLoading) {
    return <div className="login-page"><div style={{ color: '#94a3b8' }}>Carregando painel...</div></div>;
  }
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0b0f19' }}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        tenantName={activeTenant?.name}
        user={user}
        onLogout={handleLogout}
      />

      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {activeTab === 'dashboard' && (
          <DashboardTab
            screens={screens}
            stats={stats}
            onRemoteCommand={handleRemoteCommand}
            onOpenPairModal={() => {
              setActiveTab('screens');
              setIsPairModalOpen(true);
            }}
          />
        )}

        {activeTab === 'screens' && (
          <ScreensTab
            screens={screens}
            playlists={playlists}
            layouts={layouts}
            onPairScreen={handlePairScreen}
            onUpdateScreen={handleUpdateScreen}
            onRemoteCommand={handleRemoteCommand}
            onDeleteScreen={handleDeleteScreen}
            isPairModalOpen={isPairModalOpen}
            setIsPairModalOpen={setIsPairModalOpen}
          />
        )}

        {activeTab === 'media' && (
          <MediaTab
            medias={medias}
            folders={mediaFolders}
            onUploadFile={handleUploadFile}
            onUpdateMedia={handleUpdateMedia}
            onCreateWidget={handleCreateWidget}
            onDeleteMedia={handleDeleteMedia}
            onCreateFolder={handleCreateMediaFolder}
            onRenameFolder={handleRenameMediaFolder}
            onDeleteFolder={handleDeleteMediaFolder}
          />
        )}

        {activeTab === 'layouts' && (
          <LayoutsTab
            layouts={layouts}
            medias={medias}
            screens={screens}
            onCreateLayout={handleCreateLayout}
            onUpdateLayout={handleUpdateLayout}
            onDeleteLayout={handleDeleteLayout}
          />
        )}

        {activeTab === 'playlists' && (
          <PlaylistsTab
            playlists={playlists}
            medias={medias}
            folders={mediaFolders}
            layouts={layouts}
            screens={screens}
            onCreatePlaylist={handleCreatePlaylist}
            onUpdatePlaylist={handleUpdatePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
          />
        )}

        {activeTab === 'campaigns' && (
          <CampaignsTab
            campaigns={campaigns}
            playlists={playlists}
            onCreateCampaign={handleCreateCampaign}
            onDeleteCampaign={handleDeleteCampaign}
          />
        )}

        {activeTab === 'proof-of-play' && <ProofOfPlayTab stats={stats} qrStats={qrStats} />}

        {activeTab === 'queues' && (
          <QueueTab
            screens={screens}
            tenantId={activeTenant?.id}
          />
        )}

        {activeTab === 'emergency' && (
          <EmergencyTab
            screens={screens}
            onTriggerEmergency={handleTriggerEmergency}
            onClearEmergency={handleClearEmergency}
          />
        )}

        {activeTab === 'tenants' && user.role === 'SUPER_ADMIN' && (
          <TenantsTab
            tenants={tenants}
            onCreateTenant={handleCreateTenant}
            onUpdateTenant={handleUpdateTenant}
          />
        )}
      </main>
    </div>
  );
}
