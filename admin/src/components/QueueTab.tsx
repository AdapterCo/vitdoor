import React, { useState, useEffect } from 'react';
import { Plus, Trash2, KeyRound, Copy, Check, ExternalLink, Ticket, Tv } from 'lucide-react';
import { apiFetch } from '../api';

interface QueueTabProps {
  screens: any[];
  tenantId?: string;
}

export const QueueTab: React.FC<QueueTabProps> = ({ screens, tenantId }) => {
  const [queues, setQueues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal Form state
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('A');
  const [deskName, setDeskName] = useState('Guichê 01');
  const [screenId, setScreenId] = useState('');
  const [pinCode, setPinCode] = useState('');

  const loadQueues = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/queues/admin${tenantId ? `?tenantId=${tenantId}` : ''}`);
      if (res.ok) {
        setQueues(await res.json());
      }
    } catch (err) {
      console.error('Error fetching queues:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueues();
  }, [tenantId]);

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const res = await apiFetch('/queues/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          prefix: prefix.trim(),
          deskName: deskName.trim(),
          screenId: screenId || null,
          pinCode: pinCode.trim() || undefined,
          tenantId
        })
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Erro ao criar fila');
        return;
      }

      setIsModalOpen(false);
      setName('');
      setPrefix('A');
      setDeskName('Guichê 01');
      setScreenId('');
      setPinCode('');
      await loadQueues();
    } catch (err: any) {
      alert(err.message || 'Erro de conexão');
    }
  };

  const handleDeleteQueue = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta fila?')) return;
    try {
      const res = await apiFetch(`/queues/admin/${id}${tenantId ? `?tenantId=${tenantId}` : ''}`, {
        method: 'DELETE'
      });
      if (res.ok) await loadQueues();
    } catch (err) {
      console.error(err);
    }
  };

  const copyCallerLink = (pin: string, queueId: string) => {
    const callerUrl = `${window.location.origin}/chamar?pin=${pin}`;
    navigator.clipboard.writeText(callerUrl);
    setCopiedId(queueId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Ticket color="#38bdf8" size={28} /> Gestão de Filas &amp; Chamador de Senhas
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginTop: '4px' }}>
            Configure os guichês/consultórios, conecte às TVs e envie o link de acesso aos operadores.
          </p>
        </div>

        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Nova Fila / Guichê
        </button>
      </div>

      {/* Queues List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {queues.map((q) => (
          <div key={q.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                  {q.name}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>
                  {q.deskName} {q.prefix ? `(Prefixo: ${q.prefix})` : ''}
                </span>
              </div>

              <button
                className="btn-danger"
                style={{ padding: '6px' }}
                onClick={() => handleDeleteQueue(q.id)}
                title="Excluir Fila"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Status Info */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
                  <Tv size={14} /> TV Vinculada:
                </span>
                <span style={{ fontWeight: 700, color: q.screen ? '#4ade80' : '#fca5a5' }}>
                  {q.screen?.name || 'Nenhuma TV'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
                  <KeyRound size={14} /> PIN do Operador:
                </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#fbbf24', fontSize: '1rem' }}>
                  {q.pinCode}
                </span>
              </div>
            </div>

            {/* Direct Link Action */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-secondary"
                style={{ flex: 1, padding: '8px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={() => copyCallerLink(q.pinCode, q.id)}
              >
                {copiedId === q.id ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                {copiedId === q.id ? 'Link Copiado!' : 'Copiar Link Chamador'}
              </button>

              <a
                href={`/chamar?pin=${q.pinCode}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
                style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Abrir Chamador em nova aba"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        ))}

        {queues.length === 0 && !loading && (
          <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#64748b' }}>
            Nenhuma fila ou consultório cadastrado. Clique em <strong>Nova Fila / Guichê</strong> para começar.
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '28px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginBottom: '16px' }}>
              Nova Fila de Atendimento
            </h3>

            <form onSubmit={handleCreateQueue} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  NOME DA FILA / SETOR
                </label>
                <input
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Recepção Médica, Açougue"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    PREFIXO (OPCIONAL)
                  </label>
                  <input
                    className="input-field"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    placeholder="Ex.: A, P, C"
                    maxLength={3}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    GUICHÊ / CONSULTÓRIO
                  </label>
                  <input
                    className="input-field"
                    value={deskName}
                    onChange={(e) => setDeskName(e.target.value)}
                    placeholder="Ex.: Consultório 03"
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  TV (TELA DE EXIBIÇÃO)
                </label>
                <select
                  className="input-field"
                  value={screenId}
                  onChange={(e) => setScreenId(e.target.value)}
                >
                  <option value="">Nenhuma TV vinculada</option>
                  {screens.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.locationName || 'Sem local'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  PIN DE ACESSO DO OPERADOR (4 DÍGITOS)
                </label>
                <input
                  className="input-field"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Deixe em branco para gerar automático"
                  maxLength={6}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Salvar Fila
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
