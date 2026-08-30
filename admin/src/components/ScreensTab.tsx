import React, { useEffect, useState } from 'react';
import { Tv, Volume2, Camera, RefreshCw, Power, Trash2, Plus, Sliders, CheckCircle2, Radio, Copy, Check, X, Pencil, DownloadCloud } from 'lucide-react';

interface ScreensTabProps {
  screens: any[];
  playlists: any[];
  layouts: any[];
  onPairScreen: (data: any) => Promise<boolean>;
  onUpdateScreen: (screenId: string, data: any) => void;
  onRemoteCommand: (screenId: string, action: string, payload?: any) => void;
  onDeleteScreen: (screenId: string) => void;
  onUpdatePlayerApp: (payload: { apkUrl: string; version: string; checksum?: string; screenIds?: string[] }) => Promise<void>;
  onGetFleetCount: () => Promise<number>;
  userRole?: string;
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
  onUpdatePlayerApp,
  onGetFleetCount,
  userRole,
  isPairModalOpen,
  setIsPairModalOpen
}) => {
  const [pairingCode, setPairingCode] = useState('');
  const [name, setName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [groupName, setGroupName] = useState('Geral');
  const [orientation, setOrientation] = useState('HORIZONTAL');
  const [volumeDrafts, setVolumeDrafts] = useState<Record<string, string>>({});
  const [nfcModalScreen, setNfcModalScreen] = useState<any | null>(null);

  // Edit screen modal state
  const [editingScreen, setEditingScreen] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [editOrientation, setEditOrientation] = useState('HORIZONTAL');

  // OTA update modal state (SUPER_ADMIN)
  const [otaOpen, setOtaOpen] = useState(false);
  const [otaVersion, setOtaVersion] = useState('');
  const [otaApkUrl, setOtaApkUrl] = useState('');
  const [otaChecksum, setOtaChecksum] = useState('');
  const [otaTarget, setOtaTarget] = useState<'FLEET' | 'SELECTED'>('SELECTED');
  const [otaSelectedIds, setOtaSelectedIds] = useState<string[]>([]);
  const [otaSending, setOtaSending] = useState(false);
  const [fleetCount, setFleetCount] = useState<number | null>(null);

  useEffect(() => {
    if (otaOpen) onGetFleetCount().then(setFleetCount).catch(() => setFleetCount(null));
  }, [otaOpen]);

  const submitOta = async () => {
    const version = otaVersion.trim();
    const apkUrl = otaApkUrl.trim();
    const checksum = otaChecksum.trim().toLowerCase();
    if (!/^\d+\.\d+\.\d+$/.test(version)) { alert('Versão deve estar no formato x.y.z.'); return; }
    if (checksum && !/^[a-f0-9]{64}$/.test(checksum)) { alert('Se informar o checksum, use um SHA-256 (64 caracteres hex).'); return; }
    if (otaTarget === 'SELECTED' && otaSelectedIds.length === 0) { alert('Selecione ao menos uma tela.'); return; }
    const scope = otaTarget === 'FLEET'
      ? `TODAS as telas pareadas do sistema (todos os clientes)${fleetCount != null ? ` — ${fleetCount} tela(s)` : ''}`
      : `${otaSelectedIds.length} tela(s) selecionada(s)`;
    if (!window.confirm(`Enviar atualização do app para a versão ${version} em ${scope}? As TV Boxes vão baixar e instalar o novo APK.`)) return;
    setOtaSending(true);
    try {
      await onUpdatePlayerApp({ apkUrl, version, ...(checksum ? { checksum } : {}), ...(otaTarget === 'SELECTED' ? { screenIds: otaSelectedIds } : {}) });
      setOtaOpen(false);
      setOtaVersion(''); setOtaApkUrl(''); setOtaChecksum(''); setOtaSelectedIds([]); setOtaTarget('SELECTED');
    } finally {
      setOtaSending(false);
    }
  };

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

  const getVolumeDraft = (screen: any) => volumeDrafts[screen.id] ?? String(screen.volume ?? 80);

  const applyVolume = (screen: any) => {
    const value = Number(volumeDrafts[screen.id] ?? screen.volume ?? 80);
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setVolumeDrafts((current) => ({ ...current, [screen.id]: String(screen.volume ?? 80) }));
      return;
    }
    setVolumeDrafts((current) => ({ ...current, [screen.id]: String(value) }));
    if (value !== Number(screen.volume ?? 80)) {
      onRemoteCommand(screen.id, 'SET_VOLUME', { volume: value });
    }
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

        <div style={{ display: 'flex', gap: '10px' }}>
          {userRole === 'SUPER_ADMIN' && (
            <button className="btn-secondary" onClick={() => setOtaOpen(true)} title="Atualização remota do app do player">
              <DownloadCloud size={18} /> Atualizar app do Player
            </button>
          )}
          <button className="btn-primary" onClick={() => setIsPairModalOpen(true)}>
            <Plus size={18} /> Parear com Código (6 dígitos)
          </button>
        </div>
      </div>

      {/* Screens Table */}
      <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '12px' }}>TELA</th>
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
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>IP: {screen.ipAddress || 'não informado'} · App v{screen.appVersion || '—'}</span>
                    </div>
                  </div>
                </td>

                <td style={{ padding: '16px 12px', color: '#cbd5e1' }}>
                  {screen.locationName} <br />
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Grupo: {screen.groupName}</span>
                </td>

                <td style={{ padding: '16px 12px' }}>
                  <select
                    value={screen.orientation || 'HORIZONTAL'}
                    onChange={(e) => onUpdateScreen(screen.id, { orientation: e.target.value })}
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
                    <option value="HORIZONTAL">Horizontal (0° Padrão 16:9)</option>
                    <option value="90">Girar 90° Horário (Totem Vertical)</option>
                    <option value="180">Invertido (180° Ponta-Cabeça)</option>
                    <option value="VERTICAL">Vertical / 270° (Totem Vertical 9:16)</option>
                  </select>
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
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      inputMode="numeric"
                      className="input-field"
                      aria-label={`Volume da tela ${screen.name}`}
                      value={getVolumeDraft(screen)}
                      onChange={(e) => setVolumeDrafts((current) => ({ ...current, [screen.id]: e.target.value }))}
                      onBlur={() => applyVolume(screen)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      style={{ width: '72px', padding: '6px 8px', textAlign: 'center' }}
                    />
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>%</span>
                  </div>
                </td>

                <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px' }}
                      title="Editar Tela"
                      onClick={() => {
                        setEditingScreen(screen);
                        setEditName(screen.name);
                        setEditLocationName(screen.locationName || '');
                        setEditGroupName(screen.groupName || 'Geral');
                        setEditOrientation(screen.orientation || 'HORIZONTAL');
                      }}
                    >
                      <Pencil size={14} color="#a855f7" />
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px' }}
                      title="Link da Tag NFC para o Totem"
                      onClick={() => setNfcModalScreen(screen)}
                    >
                      <Radio size={14} color="#38bdf8" />
                    </button>
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
                      onClick={() => {
                        if (window.confirm(`Tem certeza que deseja remover a tela "${screen.name}"?`)) {
                          onDeleteScreen(screen.id);
                        }
                      }}
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
                  <option value="HORIZONTAL">Horizontal (0° Padrão 16:9)</option>
                  <option value="90">Girar 90° Horário (Totem Vertical)</option>
                  <option value="180">Invertido (180° Ponta-Cabeça)</option>
                  <option value="VERTICAL">Vertical / 270° (Totem Vertical 9:16)</option>
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

      {/* NFC Tag Link Modal */}
      {nfcModalScreen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '28px', position: 'relative' }}>
            <button
              onClick={() => setNfcModalScreen(null)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '10px', background: 'rgba(56, 189, 248, 0.15)', borderRadius: '12px', color: '#38bdf8' }}>
                <Radio size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                  Tag NFC — {nfcModalScreen.name}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Aproximação inteligente por Totem
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: '1.5', marginBottom: '16px' }}>
              Grave o link abaixo no adesivo NFC fixado no Totem. Quando o cliente aproximar o celular, ele abrirá automaticamente o link/cupom da mídia que estiver passando na TV <strong>naquele exato segundo</strong>!
            </p>

            <div style={{
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '14px',
              fontFamily: 'monospace',
              fontSize: '0.88rem',
              color: '#38bdf8',
              wordBreak: 'break-all',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <span>{`${window.location.origin}/r/nfc/${nfcModalScreen.id}`}</span>
              <button
                className="btn-primary"
                style={{ padding: '8px 12px', fontSize: '0.8rem', flexShrink: 0 }}
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/r/nfc/${nfcModalScreen.id}`);
                  alert('Link NFC copiado com sucesso! Agora basta gravar no adesivo NFC usando o aplicativo NFC Tools.');
                }}
              >
                <Copy size={14} /> Copiar
              </button>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px 16px', borderRadius: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
              💡 <strong>Dica de Gravação:</strong> No seu celular, instale o aplicativo gratuito <em>NFC Tools</em>, escolha "Escrever" &gt; "Adicionar registro" &gt; "URL" e cole o link acima. Em seguida, encoste no adesivo NFC!
            </div>
          </div>
        </div>
      )}

      {/* Edit Screen Modal */}
      {editingScreen && (
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
              Editar Configurações da Tela
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
              Altere o nome, localização, grupo e orientação de exibição desta tela.
            </p>

            <form onSubmit={(e) => {
              e.preventDefault();
              onUpdateScreen(editingScreen.id, {
                name: editName,
                locationName: editLocationName,
                groupName: editGroupName,
                orientation: editOrientation
              });
              setEditingScreen(null);
            }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Nome da Tela *</label>
                <input
                  type="text"
                  className="input-field"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Local / Endereço</label>
                <input
                  type="text"
                  className="input-field"
                  value={editLocationName}
                  onChange={(e) => setEditLocationName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Grupo</label>
                <input
                  type="text"
                  className="input-field"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Orientação da Tela *</label>
                <select
                  className="input-field"
                  value={editOrientation}
                  onChange={(e) => setEditOrientation(e.target.value)}
                >
                  <option value="HORIZONTAL">Horizontal (0° Padrão 16:9)</option>
                  <option value="90">Girar 90° Horário (Totem Vertical)</option>
                  <option value="180">Invertido (180° Ponta-Cabeça)</option>
                  <option value="VERTICAL">Vertical / 270° (Totem Vertical 9:16)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingScreen(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OTA — Atualizar app do Player (SUPER_ADMIN) */}
      {otaOpen && userRole === 'SUPER_ADMIN' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '18px' }}>
          <div className="glass-panel" style={{ width: 'min(560px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: '28px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '6px', color: '#fff' }}>Atualizar app do Player</h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '18px' }}>
              As TV Boxes vão baixar o APK do R2 (HTTPS) e instalar. O APK precisa estar hospedado no domínio de mídia do VitDoor. O checksum SHA-256 é opcional — o Android já recusa APK assinado com outra chave.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Versão (x.y.z)
                <input className="input-field" value={otaVersion} onChange={(e) => setOtaVersion(e.target.value)} placeholder="2.3.0" style={{ marginTop: '4px' }} />
              </label>
              <label style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>URL do APK
                <input className="input-field" value={otaApkUrl} onChange={(e) => setOtaApkUrl(e.target.value)} placeholder="https://media.vitdoor.com.br/player/vitdoor-player-v2.3.0.apk" style={{ marginTop: '4px' }} />
              </label>
              <label style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Checksum SHA-256 (opcional)
                <input className="input-field" value={otaChecksum} onChange={(e) => setOtaChecksum(e.target.value)} placeholder="deixe em branco para não validar" style={{ marginTop: '4px' }} />
              </label>

              <div style={{ marginTop: '4px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '6px' }}>
                  <input type="radio" checked={otaTarget === 'SELECTED'} onChange={() => setOtaTarget('SELECTED')} /> Somente as telas selecionadas
                </label>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1' }}>
                  <input type="radio" checked={otaTarget === 'FLEET'} onChange={() => setOtaTarget('FLEET')} /> Toda a frota — todas as telas pareadas de todos os clientes{fleetCount != null ? ` (${fleetCount})` : ''}
                </label>
              </div>

              {otaTarget === 'SELECTED' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {screens.filter((s) => s.paired).map((screen) => (
                    <button
                      key={screen.id}
                      type="button"
                      className={otaSelectedIds.includes(screen.id) ? 'btn-primary' : 'btn-secondary'}
                      style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                      onClick={() => setOtaSelectedIds((ids) => ids.includes(screen.id) ? ids.filter((x) => x !== screen.id) : [...ids, screen.id])}
                    >
                      {screen.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button type="button" className="btn-secondary" onClick={() => setOtaOpen(false)} disabled={otaSending}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={submitOta} disabled={otaSending}>
                <DownloadCloud size={16} /> {otaSending ? 'Enviando...' : 'Enviar atualização'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
