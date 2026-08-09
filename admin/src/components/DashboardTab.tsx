import React from 'react';
import { Tv, Wifi, WifiOff, PlayCircle, HardDrive, Cpu, Volume2, Camera, RefreshCw } from 'lucide-react';

interface DashboardTabProps {
  screens: any[];
  stats: any;
  onRemoteCommand: (screenId: string, action: string, payload?: any) => void;
  onOpenPairModal: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  screens,
  stats,
  onRemoteCommand,
  onOpenPairModal
}) => {
  const onlineCount = screens.filter((s) => s.status === 'ONLINE').length;
  const offlineCount = screens.filter((s) => s.status === 'OFFLINE').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Title & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Dashboard Geral</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            Visão consolidada da sua rede de telas de Mídia Indoor em tempo real.
          </p>
        </div>

        <button className="btn-primary" onClick={onOpenPairModal}>
          <Tv size={18} /> Parear Nova Tela
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.9rem' }}>
            <span>Total de Telas</span>
            <Tv size={20} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '10px', color: '#fff' }}>
            {screens.length}
          </div>
          <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>Rede de Exibição</span>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.9rem' }}>
            <span>Telas Online</span>
            <Wifi size={20} color="#22c55e" />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '10px', color: '#4ade80' }}>
            {onlineCount}
          </div>
          <span style={{ fontSize: '0.8rem', color: '#86efac' }}>Transmitindo normalmente</span>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.9rem' }}>
            <span>Telas Offline</span>
            <WifiOff size={20} color="#ef4444" />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '10px', color: '#f87171' }}>
            {offlineCount}
          </div>
          <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>Requer verificação</span>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.9rem' }}>
            <span>Exibições (Proof-of-Play)</span>
            <PlayCircle size={20} color="#a855f7" />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '10px', color: '#c084fc' }}>
            {stats?.totalPlays || 0}
          </div>
          <span style={{ fontSize: '0.8rem', color: '#d8b4fe' }}>Registros auditados</span>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.9rem' }}>
            <span>Armazenamento R2</span>
            <HardDrive size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: '10px', color: '#fbbf24' }}>
            {((stats?.storageUsedBytes || 0) / 1024 / 1024).toFixed(1)} MB
          </div>
          <span style={{ fontSize: '0.8rem', color: '#fde68a' }}>de {stats?.maxStorageMb || 0} MB contratados</span>
        </div>
      </div>

      {/* Screen Cards Telemetry Grid */}
      <div>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
          Monitoramento de Telas em Tempo Real
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {screens.map((screen) => (
            <div key={screen.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{screen.name}</h4>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {screen.locationName} • Grupo: {screen.groupName}
                  </span>
                </div>
                <span className={screen.status === 'ONLINE' ? 'badge-online' : 'badge-offline'}>
                  {screen.status === 'ONLINE' ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {screen.status}
                </span>
              </div>

              {/* Live Screenshot or Preview Container */}
              <div style={{
                height: '180px',
                background: '#020617',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {screen.lastScreenshotUrl ? (
                  <img src={screen.lastScreenshotUrl} alt="Último screenshot capturado" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                    <Tv size={36} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <p style={{ fontSize: '0.85rem' }}>Prévia de tela não capturada</p>
                  </div>
                )}

                {/* Overlay live controls */}
                <div style={{
                  position: 'absolute',
                  bottom: '10px',
                  right: '10px',
                  display: 'flex',
                  gap: '6px'
                }}>
                  <button
                    onClick={() => onRemoteCommand(screen.id, 'TAKE_SCREENSHOT')}
                    title="Capturar foto em tempo real"
                    style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      padding: '6px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <Camera size={14} />
                  </button>
                  <button
                    onClick={() => onRemoteCommand(screen.id, 'SYNC')}
                    title="Forçar ressincronização"
                    style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      padding: '6px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Hardware Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                background: 'rgba(255,255,255,0.03)',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '0.8rem'
              }}>
                <div>
                  <span style={{ color: '#64748b' }}>CPU</span>
                  <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{screen.cpuUsagePercent == null ? 'indisponível' : `${screen.cpuUsagePercent}%`}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>RAM</span>
                  <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{screen.ramUsagePercent == null ? 'indisponível' : `${screen.ramUsagePercent}%`}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Volume</span>
                  <div style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Volume2 size={12} color="#60a5fa" /> {screen.volume}%
                  </div>
                </div>
              </div>

              {/* Playing Info */}
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                <strong>Exibindo:</strong> {screen.currentMediaName || screen.activePlaylist?.name || 'Playlist Padrão'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
