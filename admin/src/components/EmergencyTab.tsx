import React, { useState } from 'react';
import { AlertTriangle, Siren } from 'lucide-react';

interface EmergencyTabProps {
  screens: any[];
  onTriggerEmergency: (title: string, message: string, alertType: string, screenIds: string[]) => Promise<void>;
  onClearEmergency: (screenIds: string[]) => Promise<void>;
}

export const EmergencyTab: React.FC<EmergencyTabProps> = ({ screens, onTriggerEmergency, onClearEmergency }) => {
  const [title, setTitle] = useState('ATENÇÃO: ALERTA DE EVACUAÇÃO');
  const [message, setMessage] = useState('Dirija-se com calma para a saída de emergência mais próxima.');
  const [alertType, setAlertType] = useState('EVACUATION');
  const [screenIds, setScreenIds] = useState<string[]>([]);

  const handleTrigger = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title || !message || screenIds.length === 0) return;
    await onTriggerEmergency(title, message, alertType, screenIds);
    alert(`Alerta enviado para ${screenIds.length} ${screenIds.length === 1 ? 'tela' : 'telas'}.`);
  };

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
    <div>
      <h2 style={{ fontSize: '1.8rem', color: '#f87171', display: 'flex', gap: '10px' }}><Siren /> Alerta emergencial</h2>
      <p style={{ color: '#94a3b8' }}>Escolha explicitamente quais telas receberão o alerta.</p>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
      <div className="glass-panel" style={{ padding: '24px', border: '1px solid rgba(239,68,68,.3)' }}>
        <h3 style={{ display: 'flex', gap: '8px' }}><AlertTriangle color="#ef4444" /> Novo aviso</h3>
        <form onSubmit={handleTrigger} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          <select className="input-field" value={alertType} onChange={(e) => setAlertType(e.target.value)}>
            <option value="EVACUATION">Evacuação urgente</option><option value="WARNING">Aviso geral</option><option value="INFO">Comunicado interno</option>
          </select>
          <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <textarea rows={4} className="input-field" value={message} onChange={(e) => setMessage(e.target.value)} required />
          <div><strong>Telas de destino *</strong><div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            {screens.map((screen) => <button type="button" key={screen.id} className={screenIds.includes(screen.id) ? 'btn-primary' : 'btn-secondary'} onClick={() => setScreenIds((ids) => ids.includes(screen.id) ? ids.filter((id) => id !== screen.id) : [...ids, screen.id])}>{screen.name}</button>)}
          </div>{screenIds.length === 0 && <small style={{ color: '#fca5a5' }}>Selecione ao menos uma tela.</small>}</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button disabled={!screenIds.length} type="submit" className="btn-danger"><Siren size={18} /> Disparar alerta</button>
            <button disabled={!screenIds.length} type="button" className="btn-secondary" onClick={() => void onClearEmergency(screenIds)}>Encerrar nas selecionadas</button>
          </div>
        </form>
      </div>
      <div className="glass-panel" style={{ padding: '24px' }}><h3>Prévia</h3><div style={{ height: '320px', marginTop: '16px', borderRadius: '16px', padding: '30px', display: 'grid', placeContent: 'center', textAlign: 'center', background: alertType === 'EVACUATION' ? '#b91c1c' : alertType === 'INFO' ? '#1d4ed8' : '#b45309' }}><Siren size={56} style={{ margin: 'auto' }} /><h4>{title}</h4><p>{message}</p></div></div>
    </div>
  </div>;
};
