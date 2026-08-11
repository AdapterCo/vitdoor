import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { API_BASE } from '../config';

interface CtaProps {
  enabled: boolean;
  type: 'WHATSAPP' | 'INSTAGRAM';
  target: string;
  position?: string;
  size?: number;
  label?: string;
}

/**
 * Exibe um QR Code sobreposto na mídia.
 *
 * URL rastreada: /r/:mediaId?s=:screenId
 *
 * O backend registra o scan (tela, horário, tipo) e redireciona para
 * WhatsApp ou Instagram — transparente para o consumidor.
 */
export function MediaQrCta({
  cta,
  mediaId,
  screenId
}: {
  cta?: CtaProps | null;
  mediaId?: string;
  screenId?: string;
}) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (!cta?.enabled || !cta.target || !mediaId) {
      setSrc('');
      return;
    }

    // Build the tracking redirect URL
    // Falls back to the direct target if mediaId is not available (should never happen in production)
    const backendOrigin = API_BASE.replace(/\/api$/, '');
    const params = screenId ? `?s=${encodeURIComponent(screenId)}` : '';
    const trackingUrl = `${backendOrigin}/r/${mediaId}${params}`;

    QRCode.toDataURL(trackingUrl, {
      width: cta.size || 160,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [cta, mediaId, screenId]);

  if (!src || !cta?.enabled) return null;

  const position: Record<string, React.CSSProperties> = {
    TOP_LEFT:     { top: 28, left: 28 },
    TOP_RIGHT:    { top: 28, right: 28 },
    BOTTOM_LEFT:  { bottom: 28, left: 28 },
    BOTTOM_RIGHT: { bottom: 28, right: 28 }
  };

  const typeIcon = cta.type === 'WHATSAPP' ? '💬' : '📷';

  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 20,
        background: '#fff',
        padding: 10,
        borderRadius: 12,
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
        ...position[cta.position || 'BOTTOM_RIGHT']
      }}
    >
      <img
        src={src}
        alt={cta.label || 'QR Code'}
        style={{ width: cta.size || 160, height: cta.size || 160, display: 'block' }}
      />
      {cta.label && (
        <div style={{ color: '#111827', fontSize: 13, fontWeight: 700, marginTop: 6 }}>
          {typeIcon} {cta.label}
        </div>
      )}
    </div>
  );
}
