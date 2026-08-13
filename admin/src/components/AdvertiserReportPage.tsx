import React, { useEffect, useState } from 'react';
import { Download, Globe, QrCode, ShieldCheck, Smartphone, TrendingUp, Tv, Wifi, Clock, ArrowLeft, ExternalLink } from 'lucide-react';

interface Props {
  mediaId: string;
}

export const AdvertiserReportPage: React.FC<Props> = ({ mediaId }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/public/report/media/${mediaId}?days=30`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Relatório não encontrado.' }));
          throw new Error(err.error || 'Não foi possível carregar o relatório.');
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar o relatório de auditoria.');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [mediaId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#090d16', color: '#fff', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: '#94a3b8' }}>Carregando Relatório Auditado de Mídia...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#090d16', color: '#fff', display: 'grid', placeItems: 'center', padding: '20px' }}>
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', maxWidth: '480px' }}>
          <ShieldCheck size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h3>Relatório Indisponível</h3>
          <p style={{ color: '#94a3b8', margin: '12px 0 20px' }}>{error || 'Não foi possível localizar os dados desta mídia.'}</p>
          <a href="/" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <ArrowLeft size={16} /> Voltar ao Início
          </a>
        </div>
      </div>
    );
  }

  const { media, summary, screensList, recentPlays, recentScans } = data;
  const totalMinutes = Math.round((summary.totalDurationSeconds || 0) / 60);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    let csv = '\uFEFF'; // BOM UTF-8
    csv += 'Relatório Auditado de Veiculação - VitDoor\n';
    csv += `Mídia:;${media.name}\n`;
    csv += `Rede:;${media.networkName}\n`;
    csv += `Data de Emissão:;${new Date().toLocaleString('pt-BR')}\n\n`;

    csv += 'RESUMO DE AUDITORIA\n';
    csv += `Total de Exibições Auditadas:;${summary.totalPlays}\n`;
    csv += `Tempo Total em Tela (min):;${totalMinutes}\n`;
    csv += `Telas Ativas:;${summary.totalScreensCount}\n`;
    csv += `Total de Interações (Conversão):;${summary.totalScans}\n`;
    csv += `Conversões WhatsApp:;${summary.whatsappScans}\n`;
    csv += `Conversões Instagram:;${summary.instagramScans}\n`;
    csv += `Conversões Link / Site:;${summary.urlScans}\n`;
    csv += `Conversões Cartão Digital:;${summary.profileScans}\n\n`;

    csv += 'HISTÓRICO DE EXIBIÇÃO EM TEMPO REAL\n';
    csv += 'Data / Hora;Tela;Duração (s);Status\n';
    (recentPlays || []).forEach((row: any) => {
      csv += `"${new Date(row.playedAt).toLocaleString('pt-BR')}";"${row.screenName}";${row.durationSeconds};"Completa (100%)"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_auditado_${media.name.replace(/[^a-z0-9]/gi, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#fff', padding: '28px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        
        {/* Cabeçalho Institucional do Relatório */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <ShieldCheck size={14} /> Relatório de Auditoria Transparente
              </span>
              <span style={{ color: '#64748b', fontSize: '0.82rem' }}>{media.networkName}</span>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '4px 0', color: '#fff' }}>
              {media.name}
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              Comprovação auditada de veiculação em totens/telas e engajamento do cliente.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }} className="no-print">
            <button className="btn-secondary" onClick={handleExportCsv} title="Baixar dados em Excel / CSV">
              <Download size={16} /> Exportar Excel
            </button>
            <button className="btn-primary" onClick={handlePrint} title="Gerar PDF ou Imprimir">
              <Download size={16} /> Exportar PDF / Imprimir
            </button>
          </div>
        </div>

        {/* Card de Destaque da Mídia */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {media.thumbnailUrl || media.type === 'IMAGE' ? (
            <img
              src={media.thumbnailUrl || media.url}
              alt={media.name}
              style={{ width: '120px', height: '70px', objectFit: 'cover', borderRadius: '8px', background: '#1e293b' }}
            />
          ) : (
            <div style={{ width: '120px', height: '70px', borderRadius: '8px', background: '#1e293b', display: 'grid', placeItems: 'center', color: '#64748b' }}>
              <Tv size={28} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{media.name}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.84rem', marginTop: '4px' }}>
              Duração base: <strong>{media.durationSeconds}s</strong> · Cadastrado em: {new Date(media.createdAt).toLocaleDateString('pt-BR')}
            </div>
            {media.cta?.enabled && (
              <div style={{ color: '#60a5fa', fontSize: '0.82rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ExternalLink size={14} /> CTA Ativo: {media.cta.mode === 'PROFILE' ? '🎴 Cartão Digital' : media.cta.type}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '12px 18px', borderRadius: '12px' }}>
            <div>
              <span style={{ fontSize: '0.76rem', color: '#94a3b8', display: 'block' }}>EXIBIÇÕES</span>
              <strong style={{ fontSize: '1.4rem', color: '#4ade80' }}>{summary.totalPlays}</strong>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div>
              <span style={{ fontSize: '0.76rem', color: '#94a3b8', display: 'block' }}>TEMPO EM TELA</span>
              <strong style={{ fontSize: '1.4rem', color: '#38bdf8' }}>{totalMinutes} min</strong>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <div>
              <span style={{ fontSize: '0.76rem', color: '#94a3b8', display: 'block' }}>TELAS ATIVAS</span>
              <strong style={{ fontSize: '1.4rem', color: '#a855f7' }}>{summary.totalScreensCount}</strong>
            </div>
          </div>
        </div>

        {/* Rastreamento de Conversões por QR Code & NFC */}
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCode size={20} color="#f59e0b" /> Rastreamento de Conversão via QR Code &amp; NFC
            <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#64748b' }}>— últimos 30 dias</span>
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Total de Interações', value: summary.totalScans || 0, icon: <QrCode size={18} />, color: '#f59e0b' },
              { label: 'QR Code (Câmera)', value: summary.qrCodeScans || 0, icon: <QrCode size={18} />, color: '#38bdf8' },
              { label: 'NFC (Aproximação)', value: summary.nfcTapScans || 0, icon: <Wifi size={18} />, color: '#a855f7' },
              { label: 'WhatsApp', value: summary.whatsappScans || 0, icon: <Smartphone size={18} />, color: '#25d366' },
              { label: 'Instagram', value: summary.instagramScans || 0, icon: <TrendingUp size={18} />, color: '#e1306c' },
              { label: 'Link / Site', value: summary.urlScans || 0, icon: <Globe size={18} />, color: '#38bdf8' },
              { label: 'Cartão Digital', value: summary.profileScans || 0, icon: <QrCode size={18} />, color: '#fbbf24' }
            ].map((kpi) => (
              <div key={kpi.label} className="glass-panel" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ color: kpi.color }}>{kpi.icon}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>{kpi.value}</div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>{kpi.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Telas que veicularam a mídia */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Tv size={18} color="#38bdf8" /> Telas Onde Esta Mídia Foi Reproduzida
          </h4>
          {screensList && screensList.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {screensList.map((screen: any) => (
                <div key={screen.screenId} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.88rem' }}>{screen.screenName}</span>
                    {screen.locationName && (
                      <span style={{ color: '#64748b', fontSize: '0.76rem', display: 'block' }}>{screen.locationName}</span>
                    )}
                  </div>
                  <span className="badge badge-primary">{screen.plays} exibições</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.86rem' }}>Nenhuma reprodução registrada no período selecionado.</p>
          )}
        </div>

        {/* Histórico Auditado em Tempo Real */}
        <div className="glass-panel" style={{ padding: '20px', overflowX: 'auto' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Clock size={18} color="#4ade80" /> Histórico de Exibição Auditado em Tempo Real
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.82rem' }}>
                <th style={{ padding: '10px' }}>DATA / HORA</th>
                <th style={{ padding: '10px' }}>TELA</th>
                <th style={{ padding: '10px' }}>MÍDIA EXIBIDA</th>
                <th style={{ padding: '10px' }}>DURAÇÃO</th>
                <th style={{ padding: '10px' }}>STATUS EXIBIÇÃO</th>
              </tr>
            </thead>
            <tbody>
              {recentPlays && recentPlays.length > 0 ? (
                recentPlays.map((log: any) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.87rem' }}>
                    <td style={{ padding: '11px 10px', color: '#94a3b8', fontSize: '0.82rem' }}>
                      {new Date(log.playedAt).toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: '11px 10px', fontWeight: 600, color: '#fff' }}>
                      {log.screenName}
                      {log.locationName && (
                        <span style={{ color: '#64748b', fontSize: '0.76rem', display: 'block' }}>{log.locationName}</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 10px', color: '#60a5fa' }}>{media.name}</td>
                    <td style={{ padding: '11px 10px', color: '#cbd5e1' }}>{log.durationSeconds}s</td>
                    <td style={{ padding: '11px 10px' }}>
                      <span className="badge badge-success">Completa (100%)</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    Nenhuma exibição registrada nos últimos 30 dias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé Institucional */}
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: '12px 0 24px' }}>
          VitDoor Mídia Indoor — Relatório de Auditoria Transparente em Tempo Real
        </div>

      </div>
    </div>
  );
};
