import React from 'react';
import { ShieldCheck, Tv, Wifi } from 'lucide-react';

interface PairingScreenProps {
  pairingCode: string;
  isConnected: boolean;
}

export const PairingScreen: React.FC<PairingScreenProps> = ({ pairingCode, isConnected }) => (
  <div style={{ width: '100vw', height: '100vh', color: '#fff', padding: '40px', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)' }}>
    <div style={{ width: 'min(700px, 100%)', textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', background: '#ffffff', padding: '10px 24px', borderRadius: '16px', marginBottom: '28px' }}>
        <img src="/logo.png" alt="VitDoor Logo" style={{ height: '48px', objectFit: 'contain' }} />
      </div>
      <div style={{ padding: '42px 54px', borderRadius: '24px', background: 'rgba(15,23,42,.88)', border: '1px solid rgba(59,130,246,.35)', boxShadow: '0 25px 60px rgba(0,0,0,.45)' }}>
        <p style={{ color: '#94a3b8' }}>Código de ativação deste dispositivo</p>
        <div style={{ margin: '18px 0', padding: '16px', borderRadius: '16px', border: '2px dashed #3b82f6', background: '#111827', color: '#60a5fa', font: '800 4.3rem monospace', letterSpacing: '10px' }}>{pairingCode}</div>
        <p style={{ color: '#cbd5e1', lineHeight: 1.6 }}>
          No painel, acesse <strong>Telas e Dispositivos</strong> e informe este código. A ativação consome uma licença contratada.
        </p>
        <div style={{ marginTop: '24px', color: isConnected ? '#4ade80' : '#f87171', display: 'flex', justifyContent: 'center', gap: '8px' }}>
          <Wifi size={20} /> {isConnected ? 'Conectado e aguardando ativação' : 'Conectando ao servidor...'}
        </div>
      </div>
      <div style={{ marginTop: '24px', color: '#64748b', fontSize: '.82rem' }}><ShieldCheck size={14} /> Ativação segura · Player v1.0</div>
    </div>
  </div>
);
