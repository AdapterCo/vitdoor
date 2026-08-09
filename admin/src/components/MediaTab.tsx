import React, { useState } from 'react';
import { UploadCloud, Image, Film, Globe, Rss, Trash2, Save, Plus, Folder, FolderPlus, Pencil } from 'lucide-react';

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
  const [uploading, setUploading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('ALL');
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
        <button className="btn-secondary" onClick={async () => { const name = prompt('Nome da nova pasta:')?.trim(); if (name) await onCreateFolder(name); }}><FolderPlus size={16} /> Nova pasta</button>
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
          </div>
        ))}
      </div>

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
