import React, { useState } from 'react';
import { AlertTriangle, Siren, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface EmergencyTabProps {
  onTriggerEmergency: (title: string, message: string, alertType: string) => void;
  onClearEmergency: () => void;
}

export const EmergencyTab: React.FC<EmergencyTabProps> = ({ onTriggerEmergency, onClearEmergency }) => {
  const [title, setTitle] = useState('ATENÇÃO: ALERTA DE INCÊNDIO / EVACUAÇÃO');
  const [message, setMessage] = useState('Por favor, dirija-se com calma para a saída de emergência mais próxima. Mantenha a calma.');
  const [alertType, setAlertType] = useState('EVACUATION');

  const handleTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) return;
    onTriggerEmergency(title, message, alertType);
    alert('🚨 Alerta emergencial disparado em tempo real para todas as telas!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Siren size={28} /> Alerta Emergencial Instantâneo
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
          Interrompa a programação normal e exiba um aviso de alta prioridade sobreposto em todas as TVs da rede.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Trigger Form */}
        <div className="glass-panel" style={{ padding: '24px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} color="#ef4444" /> Transmitir Novo Aviso Emergencial
          </h3>

          <form onSubmit={handleTrigger} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Tipo de Alerta</label>
              <select
                className="input-field"
                value={alertType}
                onChange={(e) => setAlertType(e.target.value)}
              >
                <option value="EVACUATION">Evacuação Urgente (Vermelho)</option>
                <option value="WARNING">Aviso Geral / Manutenção (Amarelo)</option>
                <option value="INFO">Comunicado Interno (Azul)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Título do Alerta *</label>
              <input
                type="text"
                className="input-field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Mensagem Detalhada *</label>
              <textarea
                rows={4}
                className="input-field"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button type="submit" className="btn-danger" style={{ flex: 1, justifyContent: 'center', padding: '14px' }}>
                <Siren size={20} /> Disparar Alerta Instantâneo
              </button>

              <button type="button" className="btn-secondary" onClick={onClearEmergency}>
                Encerrar Alertas
              </button>
            </div>
          </form>
        </div>

        {/* Live TV Preview Overlay Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>Prévia de Como a TV Exibirá</h3>

          <div style={{
            height: '320px',
            background: alertType === 'EVACUATION' ? 'rgba(185, 28, 28, 0.95)' : 'rgba(217, 119, 6, 0.95)',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '30px',
            textAlign: 'center',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.5)'
          }}>
            <Siren size={60} color="#fff" style={{ marginBottom: '16px' }} />
            <h4 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', marginBottom: '12px' }}>
              {title}
            </h4>
            <p style={{ fontSize: '1.1rem', color: '#fef2f2', maxWidth: '400px', lineHeight: '1.4' }}>
              {message}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
