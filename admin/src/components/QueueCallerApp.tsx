import React, { useState, useEffect } from 'react';
import { Volume2, RefreshCw, KeyRound, Wifi, Hash, Sparkles, LogOut } from 'lucide-react';

interface QueueInfo {
  id: string;
  name: string;
  prefix: string;
  currentNum: number;
  deskName: string;
  screenId?: string;
  screenName?: string;
  screenStatus?: string;
}

interface QueueTicket {
  id: string;
  ticketNumber: string;
  deskName: string;
  calledAt: string;
}

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export function QueueCallerApp() {
  const [pinCode, setPinCode] = useState<string>(() => localStorage.getItem('vitdoor_caller_pin') || '');
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const [queue, setQueue] = useState<QueueInfo | null>(null);
  const [recentTickets, setRecentTickets] = useState<QueueTicket[]>([]);
  const [customNumInput, setCustomNumInput] = useState<string>('');
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [lastCalled, setLastCalled] = useState<string | null>(null);

  // Read PIN from URL query string if provided, then clean URL immediately
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const pinFromUrl = searchParams.get('pin');
    if (pinFromUrl) {
      const cleanPin = pinFromUrl.trim();
      setPinCode(cleanPin);
      // Clean query string from browser address bar immediately for security and aesthetics
      window.history.replaceState({}, document.title, window.location.pathname);
      handleAuth(cleanPin);
    } else if (pinCode) {
      handleAuth(pinCode);
    }
  }, []);

  // Poll status every 10 seconds when authenticated to keep TV Online/Offline status updated
  useEffect(() => {
    if (!authenticated || !pinCode) return;
    const interval = setInterval(() => {
      fetch(`${API_BASE}/queues/operator/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode: pinCode.trim() })
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.queue) setQueue(data.queue);
        })
        .catch(() => undefined);
    }, 10000);
    return () => clearInterval(interval);
  }, [authenticated, pinCode]);

  const handleAuth = async (pinToUse: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/queues/operator/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode: pinToUse.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PIN inválido');

      setQueue(data.queue);
      setRecentTickets(data.recentTickets || []);
      setAuthenticated(true);
      localStorage.setItem('vitdoor_caller_pin', pinToUse.trim());
    } catch (err: any) {
      setError(err.message || 'Não foi possível conectar');
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCallNext = async () => {
    if (!pinCode) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/queues/operator/call-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao chamar próxima senha');

      setQueue((prev) => prev ? { ...prev, currentNum: data.currentNum } : null);
      setLastCalled(data.ticketNumber);
      setRecentTickets((prev) => [{ id: String(Date.now()), ticketNumber: data.ticketNumber, deskName: data.deskName, calledAt: data.calledAt }, ...prev.slice(0, 4)]);

      // Vibrate mobile device on call
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecall = async () => {
    if (!pinCode || !queue?.currentNum) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/queues/operator/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao rechamar');

      setLastCalled(data.ticketNumber);
      if (navigator.vibrate) navigator.vibrate(150);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCallCustom = async () => {
    if (!pinCode || !customNumInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/queues/operator/call-specific`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode, customNumber: customNumInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao chamar senha');

      setLastCalled(data.ticketNumber);
      setRecentTickets((prev) => [{ id: String(Date.now()), ticketNumber: data.ticketNumber, deskName: data.deskName, calledAt: data.calledAt }, ...prev.slice(0, 4)]);
      setIsCustomModalOpen(false);
      setCustomNumInput('');
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!pinCode || !window.confirm('Deseja zerar a contagem de senhas desta fila?')) return;
    try {
      await fetch(`${API_BASE}/queues/operator/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode })
      });
      setQueue((prev) => prev ? { ...prev, currentNum: 0 } : null);
      setLastCalled(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('vitdoor_caller_pin');
    setPinCode('');
    setAuthenticated(false);
    setQueue(null);
  };

  // ----------------------------------------------------
  // LOGIN FORM (PIN ENTRY)
  // ----------------------------------------------------
  if (!authenticated) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#090d16',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          padding: '32px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'rgba(37, 99, 235, 0.15)',
            border: '1px solid #3b82f6',
            borderRadius: '20px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <KeyRound size={32} color="#60a5fa" />
          </div>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '8px' }}>VitDoor Chamador</h2>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', marginBottom: '24px' }}>
            Digite o PIN de 4 dígitos do seu consultório ou guichê para conectar.
          </p>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              padding: '12px',
              borderRadius: '12px',
              fontSize: '0.85rem',
              marginBottom: '20px'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleAuth(pinCode); }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              placeholder="Digite o PIN (ex.: 1234)"
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(30, 41, 59, 0.8)',
                color: '#fff',
                fontSize: '1.4rem',
                textAlign: 'center',
                letterSpacing: '4px',
                fontWeight: 700,
                marginBottom: '20px',
                outline: 'none'
              }}
              autoFocus
            />

            <button
              type="submit"
              disabled={loading || !pinCode.trim()}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1.05rem',
                cursor: loading ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Conectando...' : 'Entrar no Chamador'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // OPERATOR DASHBOARD (BIG BUTTONS)
  // ----------------------------------------------------
  const currentFormatted = queue ? (queue.prefix + String(queue.currentNum).padStart(3, '0')) : '000';

  return (
    <div style={{
      width: '100vw',
      minHeight: '100vh',
      background: '#090d16',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>

      {/* Header bar */}
      <header style={{
        padding: '16px 20px',
        background: 'rgba(15, 23, 42, 0.8)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', margin: 0 }}>
            {queue?.name || 'Chamador de Senhas'}
          </h1>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            {queue?.deskName} {queue?.screenName ? `• ${queue.screenName}` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            padding: '4px 10px',
            borderRadius: '20px',
            background: queue?.screenStatus === 'ONLINE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: queue?.screenStatus === 'ONLINE' ? '#4ade80' : '#fca5a5',
            fontWeight: 700
          }}>
            <Wifi size={14} /> {queue?.screenStatus === 'ONLINE' ? 'TV Conectada' : 'TV Offline'}
          </span>

          <button
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px' }}
            title="Sair"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px', margin: '0 auto', width: '100%' }}>

        {/* Status Display Card */}
        <div style={{
          background: 'radial-gradient(circle at top, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          padding: '28px',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
        }}>
          <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Última Senha Chamada
          </div>

          <div style={{
            fontSize: '4.2rem',
            fontWeight: 900,
            color: '#38bdf8',
            lineHeight: 1.1,
            margin: '12px 0',
            fontFamily: 'monospace, monospace'
          }}>
            {lastCalled || currentFormatted}
          </div>

          <div style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 600 }}>
            {queue?.deskName}
          </div>

          {error && (
            <div style={{ marginTop: '14px', color: '#fca5a5', fontSize: '0.82rem', background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px' }}>
              {error}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Big Call Next Button */}
          <button
            onClick={handleCallNext}
            disabled={loading}
            style={{
              padding: '24px',
              borderRadius: '20px',
              border: 'none',
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              color: '#fff',
              fontSize: '1.4rem',
              fontWeight: 900,
              cursor: loading ? 'wait' : 'pointer',
              boxShadow: '0 10px 25px rgba(22, 163, 74, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              transition: 'transform 0.1s active'
            }}
          >
            <Sparkles size={28} />
            CHAMAR PRÓXIMO (
            {queue ? `${queue.prefix}${String(queue.currentNum + 1).padStart(3, '0')}` : '---'}
            )
          </button>

          {/* Secondary Action Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={handleRecall}
              disabled={loading || !queue?.currentNum}
              style={{
                padding: '16px',
                borderRadius: '16px',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
                fontWeight: 700,
                fontSize: '0.98rem',
                cursor: loading || !queue?.currentNum ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: !queue?.currentNum ? 0.5 : 1
              }}
            >
              <Volume2 size={18} /> Rechamar
            </button>

            <button
              onClick={() => setIsCustomModalOpen(true)}
              style={{
                padding: '16px',
                borderRadius: '16px',
                border: '1px solid rgba(96, 165, 250, 0.4)',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                fontWeight: 700,
                fontSize: '0.98rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Hash size={18} /> Específica
            </button>
          </div>
        </div>

        {/* Recent Tickets List */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '18px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8' }}>
              HISTÓRICO RECENTE
            </span>
            <button
              onClick={handleReset}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <RefreshCw size={12} /> Zerar Fila
            </button>
          </div>

          {recentTickets.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentTickets.map((t, idx) => (
                <div key={t.id + idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: idx === 0 ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.03)',
                  borderRadius: '10px',
                  fontSize: '0.9rem'
                }}>
                  <span style={{ fontWeight: 800, color: idx === 0 ? '#38bdf8' : '#e2e8f0', fontFamily: 'monospace' }}>
                    {t.ticketNumber}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {new Date(t.calledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.82rem', color: '#475569', textAlign: 'center', padding: '12px 0' }}>
              Nenhuma senha chamada nesta sessão.
            </div>
          )}
        </div>
      </main>

      {/* Custom Ticket Modal */}
      {isCustomModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 9999
        }}>
          <div style={{
            width: '100%',
            maxWidth: '360px',
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '20px',
            padding: '24px',
            textAlign: 'center'
          }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>Chamar Senha Específica</h3>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '16px' }}>
              Digite o código exato da senha (ex.: P005 ou 050).
            </p>

            <input
              type="text"
              value={customNumInput}
              onChange={(e) => setCustomNumInput(e.target.value)}
              placeholder="Ex.: P005"
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(30, 41, 59, 0.8)',
                color: '#fff',
                fontSize: '1.3rem',
                textAlign: 'center',
                fontWeight: 800,
                marginBottom: '16px',
                outline: 'none',
                textTransform: 'uppercase'
              }}
              autoFocus
            />

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setIsCustomModalOpen(false)}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCallCustom}
                disabled={!customNumInput.trim()}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700 }}
              >
                Chamar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
