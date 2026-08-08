import React, { useState } from 'react';
import { Clock, ListVideo, Pencil, Plus, Save, Trash2 } from 'lucide-react';

interface Props {
  playlists: any[];
  medias: any[];
  layouts: any[];
  screens: any[];
  onCreatePlaylist: (data: any) => Promise<boolean>;
  onUpdatePlaylist: (id: string, data: any) => Promise<boolean>;
  onDeletePlaylist: (id: string) => void;
}

export const PlaylistsTab: React.FC<Props> = ({ playlists, medias, screens, onCreatePlaylist, onUpdatePlaylist, onDeletePlaylist }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoop, setIsLoop] = useState(true);
  const [screenIds, setScreenIds] = useState<string[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setEditingId(null); setName(''); setDescription(''); setIsLoop(true); setScreenIds([]); setItems([]);
  };
  const create = () => { reset(); setOpen(true); };
  const edit = (playlist: any) => {
    setEditingId(playlist.id);
    setName(playlist.name);
    setDescription(playlist.description || '');
    setIsLoop(playlist.isLoop !== false);
    setScreenIds((playlist.screens || []).map((screen: any) => screen.id));
    setItems((playlist.items || []).map((item: any) => ({
      mediaId: item.mediaId,
      layoutId: item.layoutId,
      durationSeconds: item.durationSeconds || item.media?.durationSeconds || 10
    })));
    setOpen(true);
  };
  const toggleMedia = (media: any) => {
    setItems((current) => current.some((item) => item.mediaId === media.id)
      ? current.filter((item) => item.mediaId !== media.id)
      : [...current, { mediaId: media.id, durationSeconds: media.durationSeconds || 10 }]);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const data = { name, description, isLoop, screenIds, items };
    const success = editingId ? await onUpdatePlaylist(editingId, data) : await onCreatePlaylist(data);
    setSaving(false);
    if (success) { setOpen(false); reset(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h2 style={{ fontSize: '1.8rem' }}>Playlists e distribuição</h2><p style={{ color: '#94a3b8' }}>Defina sequência, duração, repetição e telas de destino.</p></div>
        <button className="btn-primary" onClick={create}><Plus size={18} /> Nova playlist</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: '18px' }}>
        {playlists.map((playlist) => {
          const total = (playlist.items || []).reduce((sum: number, item: any) => sum + item.durationSeconds, 0);
          return (
            <div className="glass-panel" key={playlist.id} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div><h3>{playlist.name}</h3><span style={{ color: '#94a3b8', fontSize: '.8rem' }}>{playlist.description || 'Sem descrição'}</span></div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <button className="btn-secondary" style={{ padding: '7px' }} onClick={() => edit(playlist)} title="Editar"><Pencil size={15} /></button>
                  <button className="btn-danger" style={{ padding: '7px' }} onClick={() => onDeletePlaylist(playlist.id)} title="Excluir"><Trash2 size={15} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', color: '#60a5fa', fontSize: '.82rem' }}>
                <span><ListVideo size={14} /> {playlist.items?.length || 0} itens</span>
                <span><Clock size={14} /> {total}s</span>
                <strong style={{ color: playlist.isLoop ? '#4ade80' : '#fbbf24' }}>{playlist.isLoop ? 'Loop ativo' : 'Sem loop'}</strong>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '.8rem' }}>Telas: {playlist.screens?.length ? playlist.screens.map((s: any) => s.name).join(', ') : 'não publicada'}</div>
              {(playlist.items || []).map((item: any, index: number) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,.035)', fontSize: '.82rem' }}>
                  <span>{index + 1}. {item.media?.name || item.layout?.name}</span><span>{item.durationSeconds}s</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.78)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: '20px' }}>
          <form className="glass-panel" onSubmit={submit} style={{ width: 'min(720px,100%)', maxHeight: '92vh', overflowY: 'auto', padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div><h3>{editingId ? 'Editar playlist' : 'Criar playlist'}</h3><p style={{ color: '#94a3b8', fontSize: '.84rem' }}>As alterações são enviadas imediatamente às telas selecionadas.</p></div>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da playlist" required />
            <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição" />
            <label style={{ display: 'flex', gap: '10px', alignItems: 'center', color: '#fff' }}>
              <input type="checkbox" checked={isLoop} onChange={(e) => setIsLoop(e.target.checked)} />
              <span><strong>Loop contínuo</strong><small style={{ display: 'block', color: '#94a3b8' }}>Desative para reproduzir a sequência somente uma vez.</small></span>
            </label>
            <div><strong>Telas de destino</strong><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '9px' }}>
              {screens.map((screen) => <button type="button" key={screen.id} className={screenIds.includes(screen.id) ? 'btn-primary' : 'btn-secondary'} onClick={() => setScreenIds((ids) => ids.includes(screen.id) ? ids.filter((id) => id !== screen.id) : [...ids, screen.id])}>{screen.name}</button>)}
            </div></div>
            <div><strong>Biblioteca</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: '8px', marginTop: '9px' }}>
              {medias.map((media) => <button type="button" key={media.id} className={items.some((item) => item.mediaId === media.id) ? 'btn-primary' : 'btn-secondary'} onClick={() => toggleMedia(media)}>{media.name} · {media.durationSeconds}s</button>)}
            </div></div>
            {items.length > 0 && <div><strong>Duração por item</strong>{items.map((item, index) => {
              const media = medias.find((candidate) => candidate.id === item.mediaId);
              return <div key={item.mediaId || index} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '10px', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ color: '#cbd5e1' }}>{index + 1}. {media?.name}</span>
                <input className="input-field" type="number" min={1} value={item.durationSeconds} onChange={(e) => setItems((current) => current.map((entry, i) => i === index ? { ...entry, durationSeconds: Math.max(1, Number(e.target.value)) } : entry))} />
              </div>;
            })}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Salvando...' : 'Salvar e publicar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
