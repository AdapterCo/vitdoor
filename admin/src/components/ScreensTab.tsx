import React, { useState } from 'react';
import { Tv, Volume2, Camera, RefreshCw, Power, Trash2, Plus, Sliders, CheckCircle2 } from 'lucide-react';

interface ScreensTabProps {
  screens: any[];
  playlists: any[];
  layouts: any[];
  onPairScreen: (data: any) => Promise<boolean>;
  onUpdateScreen: (screenId: string, data: any) => void;
  onRemoteCommand: (screenId: string, action: string, payload?: any) => void;
  onDeleteScreen: (screenId: string) => void;
  isPairModalOpen: boolean;
  setIsPairModalOpen: (open: boolean) => void;
}

export const ScreensTab: React.FC<ScreensTabProps> = ({
  screens,
  playlists,
  layouts,
  onPairScreen,
  onUpdateScreen,
  onRemoteCommand,
  onDeleteScreen,
  isPairModalOpen,
  setIsPairModalOpen
}) => {
  const [pairingCode, setPairingCode] = useState('');
  const [name, setName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [groupName, setGroupName] = useState('Recepção');
  const [orientation, setOrientation] = useState('HORIZONTAL');

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingCode) return;
    const success = await onPairScreen({ pairingCode: pairingCode.trim(), name, locationName, groupName, orientation });
    if (!success) return;
    setPairingCode('');
    setName('');
    setLocationName('');
    setIsPairModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Gestão de Telas & Dispositivos</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            Vincule novas TVs, ajuste fuso horário, volume e envie comandos de diagnóstico remoto.
          </p>
        </div>

        <button className="btn-primary" onClick={() => setIsPairModalOpen(true)}>
          <Plus size={18} /> Parear com Código (6 dígitos)
        </button>
      </div>

      {/* Screens Table */}
      <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '12px' }}>TELA</th>
              <th style={{ padding: '12px' }}>CÓDIGO PAREAMENTO</th>
              <th style={{ padding: '12px' }}>LOCALIZAÇÃO / GRUPO</th>
              <th style={{ padding: '12px' }}>ORIENTAÇÃO</th>
              <th style={{ padding: '12px' }}>PLAYLIST ATIVA</th>
              <th style={{ padding: '12px' }}>VOLUME</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>AÇÕES REMOTAS</th>
            </tr>
          </thead>
          <tbody>
            {screens.map((screen) => (
              <tr key={screen.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.9rem' }}>
                <td style={{ padding: '16px 12px', fontWeight: 600, color: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Tv size={20} color="#60a5fa" />
                    <div>
                      <div>{screen.name}</div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>IP: {screen.ipAddress || '192.168.1.100'}</span>
                    </div>
                  </div>
                </td>

                <td style={{ padding: '16px 12px', fontFamily: 'monospace', color: '#60a5fa', fontWeight: 700 }}>
                  {screen.pairingCode}
                </td>

                <td style={{ padding: '16px 12px', color: '#cbd5e1' }}>
                  {screen.locationName} <br />
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Grupo: {screen.groupName}</span>
                </td>

                <td style={{ padding: '16px 12px', color: '#cbd5e1' }}>
                  {screen.orientation === 'HORIZONTAL' ? 'Horizontal (16:9)' : 'Vertical (9:16)'}
                </td>

                <td style={{ padding: '16px 12px' }}>
                  <select
                    value={screen.activePlaylistId || ''}
                    onChange={(e) => onUpdateScreen(screen.id, { activePlaylistId: e.target.value || null })}
                    style={{
                      background: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  >
                    <option value="">Sem Playlist (Nenhuma)</option>
                    {playlists.map((pl) => (
                      <option key={pl.id} value={pl.id}>{pl.name}</option>
                    ))}
                  </select>
                </td>

                <td style={{ padding: '16px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Volume2 size={16} color="#60a5fa" />
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={screen.volume || 80}
                      onChange={(e) => {
                        const vol = parseInt(e.target.value, 10);
                        onUpdateScreen(screen.id, { volume: vol });
                        onRemoteCommand(screen.id, 'SET_VOLUME', { volume: vol });
                      }}
                      style={{ width: '80px', accentColor: '#3b82f6' }}
                    />
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{screen.volume}%</span>
                  </div>
                </td>

                <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px' }}
                      title="Capturar Foto Atual"
                      onClick={() => onRemoteCommand(screen.id, 'TAKE_SCREENSHOT')}
                    >
                      <Camera size={14} />
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px' }}
                      title="Ressincronizar Mídias"
                      onClick={() => onRemoteCommand(screen.id, 'SYNC')}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px' }}
                      title="Reiniciar Player"
                      onClick={() => onRemoteCommand(screen.id, 'REBOOT')}
                    >
                      <Power size={14} color="#f59e0b" />
                    </button>
                    <button
                      className="btn-danger"
                      style={{ padding: '6px 10px' }}
                      title="Excluir Tela"
                      onClick={() => onDeleteScreen(screen.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pairing Modal */}
      {isPairModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel" style={{ width: '450px', padding: '30px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px', color: '#fff' }}>
              Parear Nova Tela
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
              Digite o código de 6 dígitos exibido na TV ao abrir o Player VitDoor.
            </p>

            <form onSubmit={handlePairSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Código de Pareamento *</label>
                <input
                  type="text"
                  placeholder="Ex: 849-210"
                  className="input-field"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Nome da Tela</label>
                <input
                  type="text"
                  placeholder="Ex: TV Recepção Entrada"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Local / Endereço</label>
                <input
                  type="text"
                  placeholder="Ex: Loja 01 - Balcão"
                  className="input-field"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Orientação</label>
                <select
                  className="input-field"
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value)}
                >
                  <option value="HORIZONTAL">Horizontal (16:9)</option>
                  <option value="VERTICAL">Vertical (9:16)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsPairModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={18} /> Confirmar Pareamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
