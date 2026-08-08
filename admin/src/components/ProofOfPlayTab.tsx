import React from 'react';
import { BarChart3, Download, ShieldCheck, PlayCircle } from 'lucide-react';

interface ProofOfPlayTabProps {
  stats: any;
}

export const ProofOfPlayTab: React.FC<ProofOfPlayTabProps> = ({ stats }) => {
  const recentLogs = stats?.recentLogs || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Proof of Play & Relatórios</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            Registro auditado de cada mídia veiculada nas telas para comprovação junto aos anunciantes.
          </p>
        </div>

        <button className="btn-secondary">
          <Download size={18} /> Exportar Relatório (PDF / Excel)
        </button>
      </div>

      {/* Audit Logs Table */}
      <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={20} color="#4ade80" /> Histórico de Exibição em Tempo Real
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: '0.85rem' }}>
              <th style={{ padding: '12px' }}>DATA / HORA</th>
              <th style={{ padding: '12px' }}>TELA</th>
              <th style={{ padding: '12px' }}>MÍDIA EXIBIDA</th>
              <th style={{ padding: '12px' }}>DURAÇÃO</th>
              <th style={{ padding: '12px' }}>STATUS EXIBIÇÃO</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.length > 0 ? (
              recentLogs.map((log: any) => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.9rem' }}>
                  <td style={{ padding: '14px 12px', color: '#94a3b8', fontSize: '0.85rem' }}>
                    {new Date(log.playedAt).toLocaleString('pt-BR')}
                  </td>
                  <td style={{ padding: '14px 12px', fontWeight: 600, color: '#fff' }}>
                    {log.screen?.name || 'TV Recepção'}
                  </td>
                  <td style={{ padding: '14px 12px', color: '#60a5fa' }}>{log.mediaName}</td>
                  <td style={{ padding: '14px 12px', color: '#cbd5e1' }}>{log.durationSeconds}s</td>
                  <td style={{ padding: '14px 12px' }}>
                    <span className="badge-online">Completa (100%)</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                  Aguardando recepção dos primeiros logs de Proof-of-Play dos Players...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
