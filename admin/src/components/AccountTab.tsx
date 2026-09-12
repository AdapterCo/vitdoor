import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { apiFetch } from '../api';

export function AccountTab({ user }: { user: { name: string; email: string } }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(''); setSuccess('');
    if (newPassword !== confirmation) { setError('A confirmação não corresponde à nova senha.'); return; }
    if (newPassword.length < 12 || new TextEncoder().encode(newPassword).length > 72) { setError('Use ao menos 12 caracteres, com no máximo 72 bytes em UTF-8.'); return; }
    setPending(true);
    try {
      const response = await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível alterar a senha.');
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
      setSuccess(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha de conexão. Tente novamente.'); }
    finally { setPending(false); }
  }
  return <section style={{ maxWidth: 560 }}>
    <h2>Minha conta</h2>
    <p style={{ color: '#94a3b8', margin: '12px 0 24px' }}>{user.name} · {user.email}</p>
    <form onSubmit={submit} className="glass-panel" style={{ padding: 28, display: 'grid', gap: 18 }} aria-busy={pending}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><KeyRound size={20} /> Trocar senha</h3>
      <p style={{ color: '#94a3b8' }}>Use pelo menos 12 caracteres. Ao salvar, as outras sessões da sua conta serão encerradas.</p>
      <label htmlFor="current-password">Senha atual
        <input id="current-password" className="input-field" type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} disabled={pending} />
      </label>
      <label htmlFor="new-password">Nova senha
        <input id="new-password" className="input-field" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={pending} aria-describedby="password-error" />
      </label>
      <label htmlFor="confirm-password">Confirmar nova senha
        <input id="confirm-password" className="input-field" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={pending} />
      </label>
      {error && <p id="password-error" role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      {success && <p role="status" style={{ color: '#86efac' }}>{success}</p>}
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Salvando…' : 'Salvar nova senha'}</button>
    </form>
  </section>;
}
