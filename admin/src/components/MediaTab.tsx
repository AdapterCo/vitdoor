import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { UploadCloud, Image, Film, Globe, Rss, Trash2, Save, Plus, Folder, FolderPlus, Pencil, QrCode, X } from 'lucide-react';

interface MediaTabProps {
  medias: any[];
  folders: any[];
  onUploadFile: (file: File, name: string, durationSeconds: number, tags: string, folderId?: string | null) => Promise<boolean>;
  onUpdateMedia: (id: string, data: any) => Promise<boolean>;
  onCreateWidget: (widgetData: any) => void;
  onDeleteMedia: (id: string) => void;
  onCreateFolder: (name: string) => Promise<boolean>;
  onRenameFolder: (id: string, name: string) => Promise<boolean>;
  onDeleteFolder: (id: string) => Promise<boolean>;
}

export const MediaTab: React.FC<MediaTabProps> = ({
  medias,
  folders,
  onUploadFile,
  onCreateWidget,
  onDeleteMedia,
  onUpdateMedia,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder
}) => {
  const [isWidgetModalOpen, setIsWidgetModalOpen] = useState(false);
  const [widgetName, setWidgetName] = useState('');
  const [widgetType, setWidgetType] = useState('RSS');
  const [widgetUrl, setWidgetUrl] = useState('');
  const [duration, setDuration] = useState(15);
  const [durationDrafts, setDurationDrafts] = useState<Record<string, number>>({});
  const [qrModal, setQrModal] = useState<any | null>(null); // media object whose QR is being edited
  const [uploading, setUploading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('ALL');
  const [newFolderName, setNewFolderName] = useState('');
  const visibleMedias = medias.filter((media) => selectedFolder === 'ALL' ? true : selectedFolder === 'ROOT' ? !media.folderId : media.folderId === selectedFolder);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      let detectedDuration = 10;
      if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        detectedDuration = await readMediaDuration(file);
      }
      setUploading(true);
      await onUploadFile(file, file.name, detectedDuration, 'Geral', selectedFolder !== 'ALL' && selectedFolder !== 'ROOT' ? selectedFolder : null);
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleWidgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!widgetName || !widgetUrl) return;
    onCreateWidget({
      name: widgetName,
      type: widgetType,
      url: widgetUrl,
      durationSeconds: duration,
      tags: 'Widget',
      folderId: selectedFolder !== 'ALL' && selectedFolder !== 'ROOT' ? selectedFolder : null
    });
    setWidgetName('');
    setWidgetUrl('');
    setIsWidgetModalOpen(false);
  };

  const handleCreateFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    if (await onCreateFolder(name)) setNewFolderName('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Biblioteca de Mídias</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
            Envie vídeos MP4/WEBM, imagens, áudios e crie conteúdos dinâmicos, como RSS e páginas web.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" onClick={() => setIsWidgetModalOpen(true)}>
            <Rss size={18} /> Conteúdo Dinâmico / RSS Widget
          </button>

          <label className="btn-primary" style={{ cursor: 'pointer' }}>
            <UploadCloud size={18} /> Upload de Mídia
            {uploading && <span>Enviando...</span>}
            <input type="file" disabled={uploading} onChange={handleFileChange} accept="video/*,image/*,audio/*" style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={selectedFolder === 'ALL' ? 'btn-primary' : 'btn-secondary'} onClick={() => setSelectedFolder('ALL')}><Folder size={16} /> Todas</button>
        <button className={selectedFolder === 'ROOT' ? 'btn-primary' : 'btn-secondary'} onClick={() => setSelectedFolder('ROOT')}>Sem pasta</button>
        {folders.map((folder) => <div key={folder.id} style={{ display: 'flex', gap: '4px' }}>
          <button className={selectedFolder === folder.id ? 'btn-primary' : 'btn-secondary'} onClick={() => setSelectedFolder(folder.id)}><Folder size={16} /> {folder.name} ({folder._count?.medias || 0})</button>
          <button className="btn-secondary" style={{ padding: '7px' }} title="Renomear pasta" onClick={async () => { const name = prompt('Novo nome da pasta:', folder.name)?.trim(); if (name) await onRenameFolder(folder.id, name); }}><Pencil size={14} /></button>
          <button className="btn-danger" style={{ padding: '7px' }} title="Excluir pasta (as mídias serão mantidas)" onClick={async () => { if (confirm(`Excluir a pasta ${folder.name}? As mídias serão mantidas sem pasta.`) && await onDeleteFolder(folder.id)) setSelectedFolder('ALL'); }}><Trash2 size={14} /></button>
        </div>)}
        <form onSubmit={handleCreateFolder} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="text"
            className="input-field"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="Nome da nova pasta"
            maxLength={80}
            style={{ width: '180px', padding: '7px 10px' }}
          />
          <button className="btn-secondary" type="submit" disabled={!newFolderName.trim()}><FolderPlus size={16} /> Nova pasta</button>
        </form>
      </div>

      {/* Media Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {visibleMedias.map((media) => (
          <div key={media.id} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Thumbnail Box */}
            <div style={{
              height: '160px',
              background: '#020617',
              borderRadius: '10px',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              {media.type === 'IMAGE' ? (
                <img src={media.url} alt={media.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : media.type === 'VIDEO' ? (
                <video src={media.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ textAlign: 'center', color: '#60a5fa' }}>
                  <Globe size={40} style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{media.type} Widget</div>
                </div>
              )}

              {/* Type Badge */}
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                background: 'rgba(15, 23, 42, 0.8)',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {media.type === 'VIDEO' && <Film size={12} color="#60a5fa" />}
                {media.type === 'IMAGE' && <Image size={12} color="#4ade80" />}
                {media.type !== 'VIDEO' && media.type !== 'IMAGE' && <Globe size={12} color="#f59e0b" />}
                {media.type}
              </div>

              {/* Duration badge */}
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                background: 'rgba(0,0,0,0.8)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'monospace'
              }}>
                {media.durationSeconds}s
              </div>
            </div>

            {/* Title & Info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                  {media.name}
                </h4>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tag: {media.tags || 'Geral'}</span>
              </div>

              <button
                className="btn-danger"
                style={{ padding: '6px' }}
                onClick={() => onDeleteMedia(media.id)}
                title="Excluir Mídia"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select className="input-field" value={media.folderId || ''} onChange={(e) => onUpdateMedia(media.id, { folderId: e.target.value || null })} title="Mover para pasta" style={{ padding: '8px' }}>
                <option value="">Sem pasta</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
              <label style={{ color: '#94a3b8', fontSize: '.78rem', flex: 1 }}>
                Duração (segundos)
                <input
                  className="input-field"
                  type="number"
                  min={1}
                  value={durationDrafts[media.id] ?? media.durationSeconds}
                  onChange={(e) => setDurationDrafts((prev) => ({ ...prev, [media.id]: Math.max(1, Number(e.target.value)) }))}
                  style={{ marginTop: '5px', padding: '8px' }}
                />
              </label>
              <button
                className="btn-secondary"
                style={{ padding: '9px', marginTop: '18px' }}
                title="Salvar duração e atualizar playlists"
                onClick={() => onUpdateMedia(media.id, { durationSeconds: durationDrafts[media.id] ?? media.durationSeconds })}
              >
                <Save size={15} />
              </button>
            </div>
            {/* QR Code button — shown on card, opens modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: '10px' }}>
              <button
                className={media.cta?.enabled ? 'btn-secondary' : 'btn-secondary'}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  padding: '9px',
                  fontSize: '0.83rem',
                  background: media.cta?.enabled ? 'rgba(245,158,11,0.18)' : undefined,
                  borderColor: media.cta?.enabled ? '#f59e0b' : undefined,
                  color: media.cta?.enabled ? '#fbbf24' : undefined
                }}
                onClick={() => setQrModal(media)}
              >
                <QrCode size={15} />
                {media.cta?.enabled ? '✓ QR Code configurado' : 'Configurar QR Code'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* QR Code Modal */}
      {qrModal && (
        <QrCodeModal
          media={qrModal}
          onClose={() => setQrModal(null)}
          onSave={(cta) => { onUpdateMedia(qrModal.id, { cta }); setQrModal(null); }}
        />
      )}

      {/* Widget Creator Modal */}
      {isWidgetModalOpen && (
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
          <div className="glass-panel" style={{ width: '450px', padding: '30px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px', color: '#fff' }}>
              Adicionar Widget Dinâmico
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
              Integre feeds RSS de notícias ou páginas web autorizadas.
            </p>

            <form onSubmit={handleWidgetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Nome do Widget *</label>
                <input
                  type="text"
                  placeholder="Ex: Feed Notícias G1"
                  className="input-field"
                  value={widgetName}
                  onChange={(e) => setWidgetName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Tipo de Widget</label>
                <select
                  className="input-field"
                  value={widgetType}
                  onChange={(e) => setWidgetType(e.target.value)}
                >
                  <option value="RSS">Feed RSS de Notícias</option>
                  <option value="WEB_PAGE">Página da Internet (URL)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>URL / Fonte de Dados *</label>
                <input
                  type="url"
                  placeholder="Ex: https://g1.globo.com/rss/g1/"
                  className="input-field"
                  value={widgetUrl}
                  onChange={(e) => setWidgetUrl(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Duração na Playlist (segundos)</label>
                <input
                  type="number"
                  className="input-field"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                  min={5}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsWidgetModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  <Plus size={18} /> Salvar Widget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function QrCodeModal({ media, onClose, onSave }: { media: any; onClose: () => void; onSave: (cta: any) => void }) {
  const initial = media.cta || {};
  const [type, setType] = useState<'WHATSAPP' | 'INSTAGRAM' | 'URL'>(
    initial.type === 'INSTAGRAM' ? 'INSTAGRAM' : initial.type === 'URL' ? 'URL' : 'WHATSAPP'
  );
  const [target, setTarget] = useState(
    initial.type === 'WHATSAPP'
      ? String(initial.target || '').replace(/\D/g, '') || String(initial.target || '')
      : String(initial.target || '')
  );
  const [label, setLabel] = useState(initial.label || '');
  const [position, setPosition] = useState(initial.position || 'BOTTOM_RIGHT');
  const [qr, setQr] = useState('');

  const getNormalized = () => {
    const raw = target.trim();
    if (!raw) return '';
    if (type === 'WHATSAPP') {
      if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
      const digits = raw.replace(/\D/g, '');
      return digits.length >= 10 ? `https://wa.me/${digits}` : '';
    }
    if (type === 'INSTAGRAM') {
      if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
      const clean = raw.replace(/^@/, '');
      return clean ? `https://instagram.com/${clean}` : '';
    }
    // Type URL: ensure http:// or https:// prefix
    if (/^(https?:\/\/)/i.test(raw)) return raw;
    return `https://${raw}`;
  };

  const normalized = getNormalized();

  useEffect(() => {
    if (normalized) {
      QRCode.toDataURL(normalized, { width: 180, margin: 1 }).then(setQr).catch(() => setQr(''));
    } else {
      setQr('');
    }
  }, [normalized]);

  const positionLabels: Record<string, string> = {
    TOP_LEFT: 'Superior esquerdo', TOP_RIGHT: 'Superior direito',
    BOTTOM_LEFT: 'Inferior esquerdo', BOTTOM_RIGHT: 'Inferior direito'
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass-panel" style={{ width: 520, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <QrCode size={20} color="#f59e0b" /> QR Code &amp; NFC — {media.name}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 3 }}>
              Configure o destino para onde o cliente será redirecionado via QR Code ou Toque NFC.
            </p>
          </div>
          <button className="btn-secondary" style={{ padding: '6px' }} onClick={onClose}><X size={16} /></button>
        </div>

        {/* Canal */}
        <div>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 10, fontWeight: 600 }}>CANAL DE DESTINO</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { id: 'WHATSAPP', label: 'WhatsApp', icon: '💬', color: '#25d366' },
              { id: 'INSTAGRAM', label: 'Instagram', icon: '📷', color: '#e1306c' },
              { id: 'URL', label: 'Link / Site', icon: '🌐', color: '#38bdf8' }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setType(item.id as any); setTarget(''); setQr(''); }}
                style={{
                  padding: '12px 8px',
                  borderRadius: 12,
                  border: `2px solid ${type === item.id ? item.color : 'rgba(255,255,255,0.1)'}`,
                  background: type === item.id ? `${item.color}20` : 'rgba(255,255,255,0.03)',
                  color: type === item.id ? '#fff' : '#64748b',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all .18s'
                }}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div>
          <label style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            {type === 'WHATSAPP'
              ? 'NÚMERO COM DDD (OU LINK COMPLETO HA.ME)'
              : type === 'INSTAGRAM'
              ? 'LINK DO PERFIL OU @USUARIO'
              : 'URL DO SITE / LINK PERSONALIZADO COMPLETO'}
          </label>
          <input
            className="input-field"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={
              type === 'WHATSAPP'
                ? 'Ex.: 5521985080634 ou https://wa.me/5521985080634'
                : type === 'INSTAGRAM'
                ? 'Ex.: @sualoja ou https://instagram.com/sualoja'
                : 'Ex.: https://cardapio.com ou https://g.page/review'
            }
            style={{ fontSize: '0.95rem' }}
          />
        </div>

        {/* Label opcional */}
        <div>
          <label style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            TEXTO ABAIXO DO QR CODE (opcional)
          </label>
          <input
            className="input-field"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              type === 'WHATSAPP'
                ? 'Ex.: Fale conosco no WhatsApp!'
                : type === 'INSTAGRAM'
                ? 'Ex.: Siga-nos no Instagram'
                : 'Ex.: Acesse nosso cardápio'
            }
            maxLength={80}
          />
        </div>

        {/* Posição */}
        <div>
          <label style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            POSIÇÃO NA TELA
          </label>
          <select className="input-field" value={position} onChange={(e) => setPosition(e.target.value)}>
            {Object.entries(positionLabels).map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
        </div>

        {/* Prévia do QR Code */}
        {qr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 20px' }}>
            <img src={qr} alt="Prévia do QR Code" width={100} height={100} style={{ borderRadius: 8 }} />
            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>Prévia do QR Code</p>
              <p style={{ color: '#64748b', fontSize: '0.78rem', marginTop: 4 }}>
                Ao escanear, o sistema registra o scan e redireciona para o {type === 'WHATSAPP' ? 'WhatsApp' : 'Instagram'}.
              </p>
            </div>
          </div>
        )}

        {/* Ações */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-primary"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px' }}
            onClick={() => onSave({ enabled: true, type, target: normalized, position, size: 160, label })}
          >
            <QrCode size={16} /> Salvar QR Code
          </button>
          {media.cta?.enabled && (
            <button
              className="btn-danger"
              style={{ padding: '12px 18px' }}
              onClick={() => onSave(null)}
              title="Remover QR Code desta mídia"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


function readMediaDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const element = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video');
    const objectUrl = URL.createObjectURL(file);
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const duration = Number.isFinite(element.duration) ? Math.max(1, Math.ceil(element.duration)) : 10;
      URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };
    element.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(10);
    };
    element.src = objectUrl;
  });
}
