import React, { useState } from 'react';
import { Building2, Plus, Shield, CheckCircle2, Globe, HardDrive, Tv } from 'lucide-react';

interface TenantsTabProps {
  tenants: any[];
  onCreateTenant: (tenantData: any) => void;
  onUpdateTenant: (tenantId: string, data: { maxScreens: number; status: string }) => Promise<void>;
}

export const TenantsTab: React.FC<TenantsTabProps> = ({ tenants, onCreateTenant, onUpdateTenant }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [maxScreens, setMaxScreens] = useState(1);
  const [maxStorageMb, setMaxStorageMb] = useState(10000);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [editMaxScreens, setEditMaxScreens] = useState(1);
  const [editStatus, setEditStatus] = useState('ACTIVE');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug || !adminName || !adminEmail || adminPassword.length < 8) return;
    onCreateTenant({
      name,
      slug,
      maxScreens,
      maxStorageMb,
      adminName,
      adminEmail,
      adminPassword
    });
    setName('');
    setSlug('');
    setIsModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Clientes SaaS & Tenants</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            Cadastre cada cliente e defina diretamente a quantidade de telas e o armazenamento contratado.
          </p>
        </div>

        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Cadastrar Nova Empresa Cliente
        </button>
      </div>

      {/* Tenants Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {tenants.map((t) => (
          <div key={t.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>{t.name}</h4>
                <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>slug: {t.slug}</span>
              </div>
              <span className="badge-online">{t.unlimitedScreens ? 'Telas ilimitadas' : `${t.maxScreens} ${t.maxScreens === 1 ? 'tela contratada' : 'telas contratadas'}`}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                <Tv size={16} color="#60a5fa" /> {t.unlimitedScreens ? 'Sem limite de telas' : `Limite: ${t.maxScreens} telas`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                <HardDrive size={16} color="#f59e0b" /> Limite: {t.maxStorageMb / 1000} GB
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
              <span>Status: <strong style={{ color: t.status === 'ACTIVE' ? '#4ade80' : '#f87171' }}>{t.status === 'ACTIVE' ? 'ATIVO' : 'SUSPENSO'}</strong></span>
              <span>Criado em: {new Date(t.createdAt).toLocaleDateString()}</span>
            </div>
            <div style={{ fontSize: '.8rem', color: '#94a3b8' }}>
              Uso: <strong style={{ color: '#fff' }}>{t._count?.screens || 0}/{t.maxScreens}</strong> dispositivos • {t._count?.medias || 0} mídias
            </div>
            <button className="btn-secondary" onClick={() => { setEditingTenant(t); setEditMaxScreens(t.maxScreens); setEditStatus(t.status || 'ACTIVE'); }}>
              Editar cliente
            </button>
          </div>
        ))}
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
          <div className="glass-panel" style={{ width: '480px', padding: '30px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px', color: '#fff' }}>
              Cadastrar Nova Empresa Cliente
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
              Crie um ambiente isolado com limites configuráveis de telas e armazenamento R2.
            </p>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Nome da Empresa *</label>
                <input
                  type="text"
                  placeholder="Ex: Redentora Supermercados"
                  className="input-field"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Identificador Slug *</label>
                <input
                  type="text"
                  className="input-field"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Telas contratadas *</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    className="input-field"
                    value={maxScreens}
                    onChange={(e) => setMaxScreens(parseInt(e.target.value, 10))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Armazenamento (MB)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={maxStorageMb}
                    onChange={(e) => setMaxStorageMb(parseInt(e.target.value, 10))}
                  />
                </div>
              </div>

              <div style={{ paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
                <strong style={{ color: '#fff', fontSize: '.9rem' }}>Acesso do cliente</strong>
              </div>
              <input className="input-field" placeholder="Nome do administrador" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
              <input className="input-field" type="email" placeholder="E-mail de acesso" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
              <input className="input-field" type="password" minLength={8} placeholder="Senha inicial (mínimo 8 caracteres)" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={18} /> Cadastrar Empresa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editingTenant && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'grid', placeItems: 'center', zIndex: 1000 }}>
        <form className="glass-panel" style={{ width: '420px', padding: '30px', display: 'flex', flexDirection: 'column', gap: '16px' }} onSubmit={async (event) => {
          event.preventDefault();
          await onUpdateTenant(editingTenant.id, { maxScreens: editMaxScreens, status: editStatus });
          setEditingTenant(null);
        }}>
          <div><h3>Editar cliente</h3><p style={{ color: '#94a3b8' }}>{editingTenant.name}</p></div>
          <label>Telas contratadas<input className="input-field" type="number" min={1} step={1} required value={editMaxScreens} onChange={(e) => setEditMaxScreens(Math.max(1, parseInt(e.target.value, 10) || 1))} /></label>
          <label>Status<select className="input-field" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}><option value="ACTIVE">Ativo</option><option value="SUSPENDED">Suspenso por inadimplência</option></select></label>
          {editStatus === 'SUSPENDED' && <div style={{ color: '#fca5a5', background: 'rgba(239,68,68,.1)', padding: '12px', borderRadius: '8px' }}>A suspensão encerra acessos e transmissões imediatamente, sem excluir dados.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}><button type="button" className="btn-secondary" onClick={() => setEditingTenant(null)}>Cancelar</button><button type="submit" className="btn-primary">Salvar</button></div>
        </form>
      </div>}
    </div>
  );
};
