import React, { useState } from 'react';
import { LockKeyhole, Mail, Tv2 } from 'lucide-react';
import { apiFetch } from '../api';

export function LoginScreen({ onLogin }: { onLogin: (user: any) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
      onLogin(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPassword('');
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card glass-panel" onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: '20px', background: '#ffffff', padding: '12px 24px', borderRadius: '16px', display: 'inline-block', margin: '0 auto 20px auto' }}>
          <img src="/logo.png" alt="VitDoor Logo" style={{ height: '52px', objectFit: 'contain' }} />
        </div>
        <div><h1>Acesse seu painel</h1><p>Administre clientes, totens, telas e conteúdos com segurança.</p></div>
        <label>E-mail<div className="login-input"><Mail size={18} /><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></label>
        <label>Senha<div className="login-input"><LockKeyhole size={18} /><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div></label>
        {error && <div className="login-error">{error}</div>}
        <button className="btn-primary" disabled={loading}>{loading ? 'Entrando...' : 'Entrar no painel'}</button>
      </form>
    </div>
  );
}
