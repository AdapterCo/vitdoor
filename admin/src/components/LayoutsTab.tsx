import React, { useState } from 'react';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';

interface Props {
  layouts: any[];
  medias: any[];
  screens: any[];
  onCreateLayout: (data: any) => Promise<boolean>;
  onUpdateLayout: (id: string, data: any) => Promise<boolean>;
  onDeleteLayout: (id: string) => void;
}

const presetZones = (preset: string) => preset === 'FULL'
  ? [{ id: 'main', name: 'Conteúdo principal', widthPercent: 100 }]
  : preset === 'HALF'
    ? [{ id: 'main', name: 'Lado esquerdo', widthPercent: 50 }, { id: 'side', name: 'Lado direito', widthPercent: 50 }]
    : [{ id: 'main', name: 'Área principal', widthPercent: 70 }, { id: 'side', name: 'Área lateral', widthPercent: 30 }];

export const LayoutsTab: React.FC<Props> = ({ layouts, medias, screens, onCreateLayout, onUpdateLayout, onDeleteLayout }) => {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState('70_30');
  const [zoneMedia, setZoneMedia] = useState<Record<string, string[]>>({ main: [], side: [] });
  const [zoneFit, setZoneFit] = useState<Record<string, string>>({ main: 'CONTAIN', side: 'CONTAIN' });
  const [zoneAudio, setZoneAudio] = useState<Record<string, boolean>>({ main: true, side: false });
  const [screenIds, setScreenIds] = useState<string[]>([]);
  const [tickerEnabled, setTickerEnabled] = useState(false);
  const [tickerText, setTickerText] = useState('');
  const [clockEnabled, setClockEnabled] = useState(false);
  const [clockPosition, setClockPosition] = useState('TOP_RIGHT');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setEditingId(null); setName(''); setPreset('70_30'); setZoneMedia({ main: [], side: [] }); setZoneFit({ main: 'CONTAIN', side: 'CONTAIN' }); setZoneAudio({ main: true, side: false }); setScreenIds([]);
    setTickerEnabled(false); setTickerText(''); setClockEnabled(false); setClockPosition('TOP_RIGHT');
  };
  const create = () => { reset(); setOpen(true); };
  const edit = (layout: any) => {
    let config: any = {};
    try { config = JSON.parse(layout.canvasConfigJson); } catch {}
    setEditingId(layout.id); setName(layout.name); setPreset(config.preset || '70_30');
    setZoneMedia(Object.fromEntries((config.zones || []).map((zone: any) => [zone.id, (zone.items || []).map((item: any) => item.mediaId)])));
    setZoneFit(Object.fromEntries((config.zones || []).map((zone: any) => [zone.id, zone.fit || 'CONTAIN'])));
    setZoneAudio(Object.fromEntries((config.zones || []).map((zone: any, index: number) => [zone.id, typeof zone.audioEnabled === 'boolean' ? zone.audioEnabled : index === 0])));
    setScreenIds((layout.screens || []).map((screen: any) => screen.id));
    setTickerEnabled(!!config.ticker?.enabled); setTickerText(config.ticker?.text || '');
    setClockEnabled(!!config.clock?.enabled); setClockPosition(config.clock?.position || 'TOP_RIGHT');
    setOpen(true);
  };
  const toggleZoneMedia = (zoneId: string, mediaId: string) => setZoneMedia((current) => {
    const ids = current[zoneId] || [];
    return { ...current, [zoneId]: ids.includes(mediaId) ? ids.filter((id) => id !== mediaId) : [...ids, mediaId] };
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const zones = presetZones(preset).map((zone) => ({
      ...zone,
      fit: zoneFit[zone.id] || 'CONTAIN',
      loop: true,
      audioEnabled: !!zoneAudio[zone.id],
      items: (zoneMedia[zone.id] || []).map((mediaId) => {
        const media = medias.find((item) => item.id === mediaId);
        return media ? { mediaId: media.id, name: media.name, type: media.type, url: media.url, durationSeconds: media.durationSeconds } : null;
      }).filter(Boolean)
    }));
    if (zones.some((zone) => zone.items.length === 0)) {
      alert('Selecione ao menos uma mídia para cada área do layout.');
      return;
    }
    if (clockEnabled && clockPosition === 'FOOTER' && !tickerEnabled) {
      alert('Ative o rodapé para posicionar o relógio junto ao texto.');
      return;
    }
    const data = {
      name, orientation: 'HORIZONTAL', screenIds,
      canvasConfigJson: {
        version: 2, preset, zones,
        ticker: { enabled: tickerEnabled, text: tickerText },
        clock: { enabled: clockEnabled, position: clockPosition }
      }
    };
    setSaving(true);
    const success = editingId ? await onUpdateLayout(editingId, data) : await onCreateLayout(data);
    setSaving(false);
    if (success) { setOpen(false); reset(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div><h2 style={{ fontSize: '1.8rem' }}>Layouts multizona</h2><p style={{ color: '#94a3b8' }}>Cada cliente escolhe as áreas, conteúdos, widgets e telas onde o layout será aplicado.</p></div>
        <button className="btn-primary" onClick={create}><Plus size={18} /> Novo layout</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: '18px' }}>
        {layouts.map((layout) => {
          let config: any = {}; try { config = JSON.parse(layout.canvasConfigJson); } catch {}
          return <div key={layout.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><div><h3>{layout.name}</h3><span style={{ color: '#60a5fa', fontSize: '.8rem' }}>{config.preset === 'FULL' ? 'Tela inteira' : config.preset === 'HALF' ? '50 / 50' : '70 / 30'}</span></div><div style={{ display: 'flex', gap: '7px' }}><button className="btn-secondary" style={{ padding: '7px' }} onClick={() => edit(layout)}><Pencil size={15} /></button><button className="btn-danger" style={{ padding: '7px' }} onClick={() => onDeleteLayout(layout.id)}><Trash2 size={15} /></button></div></div>
            {(config.zones || []).map((zone: any) => <div key={zone.id} style={{ padding: '9px', background: 'rgba(255,255,255,.035)', borderRadius: '8px', fontSize: '.8rem' }}><strong>{zone.name} ({zone.widthPercent}%)</strong><div style={{ color: '#94a3b8' }}>{(zone.items || []).map((item: any) => item.name).join(' → ') || 'Sem conteúdo'}</div><div style={{ color: '#60a5fa', marginTop: '3px' }}>Enquadramento: {fitLabel(zone.fit)}</div></div>)}
            <div style={{ color: '#94a3b8', fontSize: '.8rem' }}>Rodapé: {config.ticker?.enabled ? config.ticker.text : 'desativado'} · Relógio: {config.clock?.enabled ? clockPositionLabel(config.clock.position) : 'desativado'}</div>
            <div style={{ color: '#94a3b8', fontSize: '.8rem' }}>Telas: {layout.screens?.length ? layout.screens.map((screen: any) => screen.name).join(', ') : 'não publicado'}</div>
          </div>;
        })}
      </div>

      {open && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: '18px' }}>
        <form className="glass-panel" onSubmit={submit} style={{ width: 'min(900px,100%)', maxHeight: '94vh', overflowY: 'auto', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div><h3>{editingId ? 'Editar layout' : 'Criar layout'}</h3><p style={{ color: '#94a3b8' }}>Nada é obrigatório além do conteúdo de cada área. Widgets são opcionais.</p></div>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do layout" required />
          <div><strong>Divisão da tela</strong><div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>{[['70_30','70 / 30'],['HALF','50 / 50'],['FULL','Tela inteira']].map(([id,label]) => <button type="button" className={preset === id ? 'btn-primary' : 'btn-secondary'} onClick={() => setPreset(id)} key={id}>{label}</button>)}</div></div>
          {presetZones(preset).map((zone) => <div key={zone.id} style={{ padding: '16px', border: '1px solid rgba(255,255,255,.1)', borderRadius: '12px' }}>
            <strong>{zone.name} — {zone.widthPercent}%</strong><p style={{ color: '#94a3b8', fontSize: '.8rem', margin: '4px 0 10px' }}>Selecione na ordem em que serão reproduzidas.</p>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '.82rem', marginBottom: '10px' }}>
              Enquadramento da mídia
              <select className="input-field" value={zoneFit[zone.id] || 'CONTAIN'} onChange={(e) => setZoneFit((current) => ({ ...current, [zone.id]: e.target.value }))} style={{ marginTop: '5px' }}>
                <option value="CONTAIN">Caber inteira — sem cortar</option>
                <option value="COVER">Preencher a área — pode cortar bordas</option>
                <option value="FILL">Esticar exatamente no espaço</option>
              </select>
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '.82rem', marginBottom: '10px' }}>
              <input type="checkbox" checked={!!zoneAudio[zone.id]} onChange={(e) => setZoneAudio((current) => e.target.checked ? { ...Object.fromEntries(Object.keys(current).map((id) => [id, false])), [zone.id]: true } : { ...current, [zone.id]: false })} /> Reproduzir áudio nesta zona
              <span style={{ display: 'block', color: '#64748b', marginTop: '3px' }}>Apenas uma zona pode emitir som para evitar sobreposição.</span>
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{medias.map((media) => <button type="button" key={media.id} className={(zoneMedia[zone.id] || []).includes(media.id) ? 'btn-primary' : 'btn-secondary'} onClick={() => toggleZoneMedia(zone.id, media.id)}>{media.name} · {media.durationSeconds}s</button>)}</div>
            {(zoneMedia[zone.id] || []).length > 0 && <div style={{ marginTop: '10px', color: '#60a5fa', fontSize: '.8rem' }}>Sequência: {(zoneMedia[zone.id] || []).map((id) => medias.find((m) => m.id === id)?.name).join(' → ')}</div>}
          </div>)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '12px' }}>
            <label className="glass-panel" style={{ padding: '14px' }}><input type="checkbox" checked={tickerEnabled} onChange={(e) => { setTickerEnabled(e.target.checked); if (!e.target.checked && clockPosition === 'FOOTER') setClockPosition('TOP_RIGHT'); }} /> Rodapé com texto rolante{tickerEnabled && <textarea className="input-field" value={tickerText} onChange={(e) => setTickerText(e.target.value)} placeholder="Digite o texto que passará no rodapé" required style={{ marginTop: '9px' }} />}</label>
            <div className="glass-panel" style={{ padding: '14px' }}>
              <label><input type="checkbox" checked={clockEnabled} onChange={(e) => setClockEnabled(e.target.checked)} /> Relógio</label>
              {clockEnabled && <select className="input-field" value={clockPosition} onChange={(e) => setClockPosition(e.target.value)} style={{ marginTop: '9px' }}>
                <option value="TOP_LEFT">Canto superior esquerdo</option>
                <option value="TOP_RIGHT">Canto superior direito</option>
                <option value="BOTTOM_LEFT">Canto inferior esquerdo</option>
                <option value="BOTTOM_RIGHT">Canto inferior direito</option>
                {tickerEnabled && <option value="FOOTER">Dentro do rodapé</option>}
              </select>}
            </div>
          </div>
          <div><strong>Aplicar nas telas</strong><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>{screens.map((screen) => <button type="button" key={screen.id} className={screenIds.includes(screen.id) ? 'btn-primary' : 'btn-secondary'} onClick={() => setScreenIds((ids) => ids.includes(screen.id) ? ids.filter((id) => id !== screen.id) : [...ids, screen.id])}>{screen.name}</button>)}</div></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" disabled={saving}><Save size={16} /> {saving ? 'Publicando...' : 'Salvar e publicar'}</button></div>
        </form>
      </div>}
    </div>
  );
};

function clockPositionLabel(position?: string): string {
  return ({
    TOP_LEFT: 'canto superior esquerdo',
    TOP_RIGHT: 'canto superior direito',
    BOTTOM_LEFT: 'canto inferior esquerdo',
    BOTTOM_RIGHT: 'canto inferior direito',
    FOOTER: 'dentro do rodapé'
  } as Record<string, string>)[position || 'TOP_RIGHT'] || 'canto superior direito';
}

function fitLabel(fit?: string): string {
  if (fit === 'COVER') return 'preencher área';
  if (fit === 'FILL') return 'esticar';
  return 'caber sem cortar';
}
