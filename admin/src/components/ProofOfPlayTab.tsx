import React, { useState } from 'react';
import { BarChart3, Download, ShieldCheck, QrCode, Smartphone, TrendingUp, Wifi, Globe } from 'lucide-react';

interface ProofOfPlayTabProps {
  stats: any;
  qrStats: any;
}

export const ProofOfPlayTab: React.FC<ProofOfPlayTabProps> = ({ stats, qrStats }) => {
  const recentLogs = stats?.recentLogs || [];
  const [qrPeriod] = useState(30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Proof of Play &amp; Conversões</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            Reproduções auditadas e rastreamento de scans de QR Code por tela e mídia.
          </p>
        </div>
        <button className="btn-secondary">
          <Download size={18} /> Exportar Relatório (PDF / Excel)
        </button>
      </div>

      {/* ── QR Code Conversion Dashboard ── */}
      {qrStats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCode size={20} color="#f59e0b" /> Rastreamento de Conversão via QR Code
            <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#64748b' }}>— últimos {qrPeriod} dias</span>
          </h3>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Total de Interações', value: qrStats.totalScans || 0, icon: <QrCode size={20} />, color: '#f59e0b' },
              { label: 'QR Code (Câmera)', value: qrStats.qrCodeScans || 0, icon: <QrCode size={20} />, color: '#38bdf8' },
              { label: 'NFC (Aproximação)', value: qrStats.nfcTapScans || 0, icon: <Wifi size={20} />, color: '#a855f7' },
              { label: 'WhatsApp', value: qrStats.whatsappScans || 0, icon: <Smartphone size={20} />, color: '#25d366' },
              { label: 'Instagram', value: qrStats.instagramScans || 0, icon: <TrendingUp size={20} />, color: '#e1306c' },
              { label: 'Link / Site', value: qrStats.urlScans || 0, icon: <Globe size={20} />, color: '#38bdf8' },
              { label: 'Cartão Digital', value: qrStats.profileScans || 0, icon: <QrCode size={20} />, color: '#fbbf24' }
            ].map((kpi) => (
              <div key={kpi.label} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ color: kpi.color }}>{kpi.icon}</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#fff' }}>{kpi.value}</div>
                <div style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 600 }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Top Mídias × Top Telas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

            {/* Top Mídias */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <TrendingUp size={16} color="#f59e0b" /> Top Mídias por Scans
              </h4>
              {qrStats.topMedias?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {qrStats.topMedias.map((m: any, i: number) => (
                    <div key={m.mediaId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                      <span style={{ color: '#cbd5e1', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                        {i + 1}. {m.mediaName}
                      </span>
                      <span className="badge badge-warning">{m.scans} scan{m.scans > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#475569', fontSize: '0.85rem' }}>Nenhum scan registrado neste período.</p>
              )}
            </div>

            {/* Top Telas */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Wifi size={16} color="#22c55e" /> Top Telas por Scans
              </h4>
              {qrStats.topScreens?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {qrStats.topScreens.map((s: any, i: number) => (
                    <div key={s.screenId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                      <div>
                        <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{i + 1}. {s.screenName}</span>
                        {s.locationName && <span style={{ color: '#64748b', fontSize: '.76rem', display: 'block' }}>{s.locationName}</span>}
                      </div>
                      <span className="badge badge-success">{s.scans} scan{s.scans > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#475569', fontSize: '0.85rem' }}>Nenhum scan registrado neste período.</p>
              )}
            </div>
          </div>

          {/* Recent QR & NFC Scans */}
          <div className="glass-panel" style={{ padding: '20px', overflowX: 'auto' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <QrCode size={16} color="#f59e0b" /> Scans &amp; Aproximações NFC Recentes
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.82rem' }}>
                  <th style={{ padding: '10px' }}>DATA / HORA</th>
                  <th style={{ padding: '10px' }}>ORIGEM</th>
                  <th style={{ padding: '10px' }}>TELA</th>
                  <th style={{ padding: '10px' }}>MÍDIA</th>
                  <th style={{ padding: '10px' }}>DESTINO</th>
                </tr>
              </thead>
              <tbody>
                {qrStats.recentScans?.length > 0 ? (
                  qrStats.recentScans.map((scan: any) => (
                    <tr key={scan.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.87rem' }}>
                      <td style={{ padding: '11px 10px', color: '#94a3b8', fontSize: '0.82rem' }}>
                        {new Date(scan.scannedAt).toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '11px 10px' }}>
                        {scan.scanSource === 'NFC_TAP' ? (
                          <span style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                            🛜 NFC Totem
                          </span>
                        ) : (
                          <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                            📱 QR Code
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '11px 10px', fontWeight: 600, color: '#fff' }}>
                        {scan.screen?.name ?? <span style={{ color: '#475569' }}>Tela não identificada</span>}
                        {scan.screen?.locationName && (
                          <span style={{ color: '#64748b', fontSize: '0.77rem', display: 'block' }}>{scan.screen.locationName}</span>
                        )}
                      </td>
                      <td style={{ padding: '11px 10px', color: '#60a5fa' }}>
                        {scan.media?.name ?? <span style={{ color: '#475569' }}>Mídia removida</span>}
                      </td>
                      <td style={{ padding: '11px 10px' }}>
                        {scan.ctaType === 'WHATSAPP' ? (
                          <span style={{ background: 'rgba(37,211,102,0.15)', color: '#25d366', padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                            💬 WhatsApp
                          </span>
                        ) : scan.ctaType === 'INSTAGRAM' ? (
                          <span style={{ background: 'rgba(225,48,108,0.15)', color: '#e1306c', padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                            📷 Instagram
                          </span>
                        ) : scan.ctaType === 'PROFILE' ? (
                          <span style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                            🎴 Cartão Digital
                          </span>
                        ) : (
                          <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                            🌐 Link / Site
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#475569' }}>
                      Nenhum scan de QR Code registrado nos últimos {qrPeriod} dias.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Proof of Play Logs ── */}
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
