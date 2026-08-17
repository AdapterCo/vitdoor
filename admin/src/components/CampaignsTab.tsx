import React, { useState } from 'react';
import { Plus, CheckCircle2, Trash2, Clock, Calendar, ShieldAlert } from 'lucide-react';

interface CampaignsTabProps {
  campaigns: any[];
  playlists: any[];
  onCreateCampaign: (data: any) => void;
  onDeleteCampaign?: (id: string) => void;
}

const DAYS_MAP = [
  { id: '1', label: 'Seg' },
  { id: '2', label: 'Ter' },
  { id: '3', label: 'Qua' },
  { id: '4', label: 'Qui' },
  { id: '5', label: 'Sex' },
  { id: '6', label: 'Sáb' },
  { id: '0', label: 'Dom' }
];

export const CampaignsTab: React.FC<CampaignsTabProps> = ({
  campaigns,
  playlists,
  onCreateCampaign,
  onDeleteCampaign
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [advertiserName, setAdvertiserName] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  
  // Today's date YYYY-MM-DD
  const todayStr = new Date().toISOString().split('T')[0];
  const nextMonthDate = new Date();
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const nextMonthStr = nextMonthDate.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(nextMonthStr);
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [selectedDays, setSelectedDays] = useState<string[]>(['1', '2', '3', '4', '5', '6', '0']);
  const [priority, setPriority] = useState('1');
  const [maxImpressions, setMaxImpressions] = useState('');

  const toggleDay = (dayId: string) => {
    if (selectedDays.includes(dayId)) {
      if (selectedDays.length === 1) return; // Must have at least 1 day
      setSelectedDays(selectedDays.filter((d) => d !== dayId));
    } else {
      setSelectedDays([...selectedDays, dayId]);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;

    onCreateCampaign({
      name,
      advertiserName,
      playlistId: playlistId || null,
      startDate,
      endDate,
      startTime: startTime || '00:00',
      endTime: endTime || '23:59',
      daysOfWeek: selectedDays.join(','),
      priority: parseInt(priority, 10) || 1,
      maxImpressions: maxImpressions ? parseInt(maxImpressions, 10) : undefined
    });

    // Reset
    setName('');
    setAdvertiserName('');
    setPlaylistId('');
    setStartTime('00:00');
    setEndTime('23:59');
    setSelectedDays(['1', '2', '3', '4', '5', '6', '0']);
    setPriority('1');
    setMaxImpressions('');
    setIsModalOpen(false);
  };

  const getCampaignStatus = (startStr: string, endStr: string) => {
    const now = new Date();
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(startStr);
    const end = new Date(endStr);
    end.setHours(23, 59, 59, 999);

    if (todayZero < start) {
      return { label: 'AGENDADA', class: 'badge-primary' };
    }
    if (now > end) {
      return { label: 'EXPIRADA', class: 'badge-warning' };
    }
    return { label: 'ATIVA', class: 'badge-success' };
  };

  const formatDaysText = (daysOfWeekStr?: string) => {
    if (!daysOfWeekStr) return 'Todos os dias';
    const days = daysOfWeekStr.split(',');
    if (days.length === 7) return 'Todos os dias';
    if (days.length === 5 && !days.includes('6') && !days.includes('0')) return 'Segunda a Sexta';
    if (days.length === 2 && days.includes('6') && days.includes('0')) return 'Finais de semana';
    return days.map((d) => DAYS_MAP.find((m) => m.id === d)?.label).filter(Boolean).join(', ');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Campanhas & Agendamentos</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            Programe veiculações com janela de datas, horário diário (janela de exibição) e dias da semana.
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
              <th style={{ padding: '12px' }}>PERÍODO E DIAS</th>
              <th style={{ padding: '12px' }}>HORÁRIO</th>
              <th style={{ padding: '12px' }}>PLAYLIST</th>
              <th style={{ padding: '12px' }}>PRIORIDADE</th>
              <th style={{ padding: '12px' }}>STATUS</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  Nenhuma campanha cadastrada. Clique em "Nova Campanha" para criar o primeiro agendamento.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => {
                const status = getCampaignStatus(c.startDate, c.endDate);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.9rem' }}>
                    <td style={{ padding: '16px 12px', fontWeight: 600, color: '#fff' }}>{c.name}</td>
                    <td style={{ padding: '16px 12px', color: '#cbd5e1' }}>{c.advertiserName || 'Geral'}</td>
                    <td style={{ padding: '16px 12px', color: '#94a3b8', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} color="#818cf8" />
                        <span>{new Date(c.startDate).toLocaleDateString()} a {new Date(c.endDate).toLocaleDateString()}</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '2px' }}>
                        {formatDaysText(c.daysOfWeek)}
                      </div>
                    </td>
                    <td style={{ padding: '16px 12px', color: '#38bdf8', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} />
                        <span>{c.startTime || '00:00'} - {c.endTime || '23:59'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 12px', color: '#60a5fa' }}>{c.playlist?.name || 'Sem playlist'}</td>
                    <td style={{ padding: '16px 12px' }}>
                      <span className="badge" style={{
                        background: c.priority === 3 ? 'rgba(239, 68, 68, 0.15)' : c.priority === 2 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: c.priority === 3 ? '#ef4444' : c.priority === 2 ? '#f59e0b' : '#cbd5e1'
                      }}>
                        {c.priority === 3 ? 'Urgente' : c.priority === 2 ? 'Alta' : 'Normal'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 12px' }}>
                      <span className={`badge ${status.class}`}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                      {onDeleteCampaign && (
                        <button
                          className="btn-danger"
                          style={{ padding: '6px 10px' }}
                          title="Excluir Campanha"
                          onClick={() => {
                            if (window.confirm(`Deseja excluir a campanha "${c.name}"?`)) {
                              onDeleteCampaign(c.id);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
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
          <div className="glass-panel" style={{ width: '540px', maxWidth: '92vw', padding: '30px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px', color: '#fff' }}>
              Nova Campanha Publicitária
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '20px' }}>
              Configure a validade, restrição de horário diário e dias de exibição em tela.
            </p>

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

              {/* Datas de Validade */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Data Início *</label>
                  <input
                    type="date"
                    className="input-field"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Data Fim *</label>
                  <input
                    type="date"
                    className="input-field"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Horário Diário */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Horário Início *</label>
                  <input
                    type="time"
                    className="input-field"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Horário Término *</label>
                  <input
                    type="time"
                    className="input-field"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Dias da Semana */}
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '8px' }}>
                  Dias da Semana de Exibição
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {DAYS_MAP.map((d) => {
                    const isSelected = selectedDays.includes(d.id);
                    return (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => toggleDay(d.id)}
                        style={{
                          flex: 1,
                          padding: '8px 4px',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                          background: isSelected ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.03)',
                          color: isSelected ? '#818cf8' : '#64748b'
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Prioridade & Limite de Exibições */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Prioridade</label>
                  <select
                    className="input-field"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="1">1 - Normal</option>
                    <option value="2">2 - Alta</option>
                    <option value="3">3 - Urgente / Exclusiva</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Limite de Scans/Exibições</label>
                  <input
                    type="number"
                    placeholder="Sem limite"
                    className="input-field"
                    value={maxImpressions}
                    onChange={(e) => setMaxImpressions(e.target.value)}
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

