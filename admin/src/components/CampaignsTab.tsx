import React, { useState } from 'react';
import { CalendarRange, Plus, User, Clock, CheckCircle2, Trash2 } from 'lucide-react';

interface CampaignsTabProps {
  campaigns: any[];
  playlists: any[];
  onCreateCampaign: (data: any) => void;
}

export const CampaignsTab: React.FC<CampaignsTabProps> = ({ campaigns, playlists, onCreateCampaign }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [advertiserName, setAdvertiserName] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [startDate, setStartDate] = useState('2026-08-01');
  const [endDate, setEndDate] = useState('2026-08-31');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;
    onCreateCampaign({
      name,
      advertiserName,
      playlistId: playlistId || null,
      startDate,
      endDate
    });
    setName('');
    setAdvertiserName('');
    setIsModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Campanhas & Agendamentos</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            Programe anúncios publicitários com datas de início e término, restrições por horário e anunciante.
          </p>
        </div>

        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Nova Campanha
        </button>
      </div>

      {/* List Table */}
      <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '12px' }}>CAMPANHA</th>
              <th style={{ padding: '12px' }}>ANUNCIANTE</th>
              <th style={{ padding: '12px' }}>PERÍODO</th>
              <th style={{ padding: '12px' }}>PLAYLIST VINCULADA</th>
              <th style={{ padding: '12px' }}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.9rem' }}>
                <td style={{ padding: '16px 12px', fontWeight: 600, color: '#fff' }}>{c.name}</td>
                <td style={{ padding: '16px 12px', color: '#cbd5e1' }}>{c.advertiserName || 'Geral'}</td>
                <td style={{ padding: '16px 12px', color: '#94a3b8', fontSize: '0.85rem' }}>
                  {new Date(c.startDate).toLocaleDateString()} até {new Date(c.endDate).toLocaleDateString()}
                </td>
                <td style={{ padding: '16px 12px', color: '#60a5fa' }}>{c.playlist?.name || 'Geral'}</td>
                <td style={{ padding: '16px 12px' }}>
                  <span className="badge-online">ATIVA</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
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
              Nova Campanha Publicitária
            </h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Nome da Campanha *</label>
                <input
                  type="text"
                  placeholder="Ex: Campanha Dia dos Pais"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Anunciante / Cliente</label>
                <input
                  type="text"
                  placeholder="Ex: Coca-Cola Brasil"
                  className="input-field"
                  value={advertiserName}
                  onChange={(e) => setAdvertiserName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Playlist de Conteúdo</label>
                <select
                  className="input-field"
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                >
                  <option value="">Selecione uma playlist...</option>
                  {playlists.map((pl) => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Data Início</label>
                  <input
                    type="date"
                    className="input-field"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Data Fim</label>
                  <input
                    type="date"
                    className="input-field"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={18} /> Salvar Campanha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
