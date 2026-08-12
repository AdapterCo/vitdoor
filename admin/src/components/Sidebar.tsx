import React from 'react';
import {
  LayoutDashboard,
  Tv,
  FileVideo,
  Layout,
  ListVideo,
  CalendarRange,
  BarChart3,
  AlertTriangle,
  Building2,
  Tv2,
  Ticket,
  LogOut
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tenantName?: string;
  user?: any;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, tenantName, user, onLogout }) => {
  const allMenuItems = [
    { id: 'dashboard', label: 'Dashboard Geral', icon: LayoutDashboard },
    { id: 'screens', label: 'Telas & Dispositivos', icon: Tv },
    { id: 'media', label: 'Biblioteca de Mídias', icon: FileVideo },
    { id: 'layouts', label: 'Editor de Layouts', icon: Layout },
    { id: 'playlists', label: 'Playlists', icon: ListVideo },
    { id: 'campaigns', label: 'Campanhas & Agendamentos', icon: CalendarRange },
    {id: 'proof-of-play', label: 'Proof of Play & Relatórios', icon: BarChart3 },
    { id: 'queues', label: 'Chamador de Senhas', icon: Ticket },
    { id: 'emergency', label: 'Alerta Emergencial', icon: AlertTriangle },
    { id: 'tenants', label: 'Clientes & Licenças', icon: Building2, masterOnly: true },
  ];
  const menuItems = allMenuItems.filter((item) => !item.masterOnly || user?.role === 'SUPER_ADMIN');

  return (
    <aside style={{
      width: '260px',
      height: '100vh',
      background: 'rgba(15, 23, 42, 0.95)',
      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
      backdropFilter: 'blur(10px)'
    }}>
      {/* Brand Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '0 12px 24px 12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          padding: '10px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Tv2 size={24} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
            VitDoor
          </h1>
          <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase' }}>
            {tenantName || 'Mídia Indoor SaaS'}
          </span>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '20px', flex: 1 }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '10px',
                border: 'none',
                background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: isActive ? '#60a5fa' : '#94a3b8',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent'
              }}
            >
              <Icon size={18} color={isActive ? '#60a5fa' : '#94a3b8'} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '14px 10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ color: '#fff', fontSize: '.85rem', fontWeight: 600 }}>{user?.name}</div>
        <div style={{ color: '#64748b', fontSize: '.72rem', margin: '3px 0 10px' }}>
          {user?.role === 'SUPER_ADMIN' ? 'Administrador da plataforma' : 'Administrador do cliente'}
        </div>
        <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', padding: '8px' }} onClick={onLogout}>
          <LogOut size={15} /> Sair
        </button>
      </div>

      {/* Footer Info */}
      <div style={{
        fontSize: '0.75rem',
        color: '#64748b',
        textAlign: 'center',
        paddingTop: '16px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        v1.0.0 Enterprise • Realtime Active
      </div>
    </aside>
  );
};
