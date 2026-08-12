/**
 * ctaHelpers.ts
 *
 * Camada central de normalização e construção de URLs para CTAs.
 *
 * Suporta dois modos:
 *   1. DIRECT: Redirecionamento direto para 1 canal (WhatsApp, Instagram ou Link)
 *   2. PROFILE: Cartão de Visita Digital / Perfil da Mídia com múltiplos links
 *
 * Utilizada por:
 *   - backend/src/routes/mediaRoutes.ts  (persistência / normalizeCta)
 *   - backend/src/routes/qrRoutes.ts     (redirect QR Code e NFC / Landing Page)
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type CtaMode = 'DIRECT' | 'PROFILE';

export type CtaLinkType = 'WHATSAPP' | 'INSTAGRAM' | 'YOUTUBE' | 'TIKTOK' | 'URL';

export interface CtaProfileLink {
  id: string;
  type: CtaLinkType;
  target: string;
  text?: string;       // para WhatsApp
  label: string;
}

export interface CtaProfile {
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  links: CtaProfileLink[];
}

export interface CtaObject {
  enabled?: boolean;
  mode?: CtaMode;
  /** Usado no Modo DIRECT */
  type?: string;
  target?: string;
  text?: string;
  /** Usado no Modo PROFILE */
  profile?: CtaProfile;
  /** Configurações visuais do QR Code no player */
  position?: string;
  size?: number;
  label?: string;
}

export interface WhatsAppParsed {
  phone: string;   // somente dígitos, e.g. "5521985080634"
  text?: string;   // mensagem opcional já decodificada
}

// ---------------------------------------------------------------------------
// WhatsApp helpers
// ---------------------------------------------------------------------------

export function isValidPhone(digits: string): boolean {
  return /^\d{10,15}$/.test(digits);
}

/**
 * Garante que o número possua o código do país.
 * Se o número tiver 10–11 dígitos (formato brasileiro com DDD, sem +55),
 * o prefixo "55" é adicionado automaticamente.
 */
export function ensureBrazilCountryCode(digits: string): string {
  if (!digits) return digits;
  if (digits.length >= 12) return digits;
  if (digits.length >= 10) return '55' + digits;
  return digits;
}

export function parseWhatsAppTarget(cta: Pick<CtaObject, 'target' | 'text'>): WhatsAppParsed | null {
  const raw = String(cta.target || '').trim();
  if (!raw) return null;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      let phone = '';
      let text: string | undefined;

      if (url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com') {
        if (url.hostname === 'wa.me') {
          phone = url.pathname.replace(/^\/+/, '').replace(/\D/g, '');
          text = url.searchParams.get('text') ?? undefined;
        } else {
          phone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
          text = url.searchParams.get('text') ?? undefined;
        }
      } else {
        return null;
      }

      phone = ensureBrazilCountryCode(phone);
      if (!isValidPhone(phone)) return null;

      const finalText = (cta.text?.trim()) || text || undefined;
      return { phone, text: finalText };
    } catch {
      return null;
    }
  }

  const digits = ensureBrazilCountryCode(raw.replace(/\D/g, ''));
  if (!isValidPhone(digits)) return null;

  const finalText = cta.text?.trim() || undefined;
  return { phone: digits, text: finalText };
}

export function buildWhatsAppWebUrl(phone: string, text?: string): string {
  const base = `https://wa.me/${phone}`;
  if (text && text.trim()) {
    return `${base}?text=${encodeURIComponent(text.trim())}`;
  }
  return base;
}

export function buildWhatsAppAppUrl(phone: string, text?: string): string {
  const base = `whatsapp://send?phone=${phone}`;
  if (text && text.trim()) {
    return `${base}&text=${encodeURIComponent(text.trim())}`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Instagram & Video helpers
// ---------------------------------------------------------------------------

export function normalizeInstagramTarget(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }

  const handle = trimmed.replace(/^@/, '').trim();
  if (!handle) return null;
  return `https://instagram.com/${handle}`;
}

export function normalizeGenericUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^(https?:\/\/)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// getNormalizedTargetUrl
// ---------------------------------------------------------------------------

export function getNormalizedTargetUrl(cta: any): string {
  if (!cta) return '';

  if (cta.type === 'WHATSAPP') {
    const parsed = parseWhatsAppTarget(cta);
    if (!parsed) return '';
    return buildWhatsAppWebUrl(parsed.phone, parsed.text);
  }

  if (cta.type === 'INSTAGRAM') {
    return normalizeInstagramTarget(String(cta.target || '')) ?? '';
  }

  return normalizeGenericUrl(String(cta.target || '')) ?? '';
}

// ---------------------------------------------------------------------------
// Landing Page HTML Generator — Perfil Cartão de Visita Digital
// ---------------------------------------------------------------------------

export function renderProfileHtml(cta: CtaObject, mediaName?: string): string {
  const profile = cta.profile || { title: mediaName || 'VitDoor', links: [] };
  const title = profile.title || mediaName || 'Conecte-se conosco';
  const subtitle = profile.subtitle || 'Selecione a opção desejada abaixo:';

  const linksHtml = (profile.links || []).map((link) => {
    let url = '';
    let icon = '🌐';
    let bgColor = '#3b82f6';
    let hoverColor = '#2563eb';

    if (link.type === 'WHATSAPP') {
      const parsed = parseWhatsAppTarget({ target: link.target, text: link.text });
      url = parsed ? buildWhatsAppWebUrl(parsed.phone, parsed.text) : link.target;
      icon = '💬';
      bgColor = '#25D366';
      hoverColor = '#1ebe5d';
    } else if (link.type === 'INSTAGRAM') {
      url = normalizeInstagramTarget(link.target) || link.target;
      icon = '📷';
      bgColor = '#E1306C';
      hoverColor = '#c1275b';
    } else if (link.type === 'YOUTUBE') {
      url = normalizeGenericUrl(link.target) || link.target;
      icon = '🎬';
      bgColor = '#FF0000';
      hoverColor = '#cc0000';
    } else if (link.type === 'TIKTOK') {
      url = normalizeGenericUrl(link.target) || link.target;
      icon = '🎵';
      bgColor = '#00f2fe';
      hoverColor = '#00c6ff';
    } else {
      url = normalizeGenericUrl(link.target) || link.target;
      icon = '🌐';
      bgColor = '#38bdf8';
      hoverColor = '#0284c7';
    }

    const safeUrl = url.replace(/"/g, '&quot;');
    const safeLabel = link.label.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-btn" style="--bg: ${bgColor}; --hover: ${hoverColor};">
      <span class="icon">${icon}</span>
      <span class="label">${safeLabel}</span>
      <span class="arrow">→</span>
    </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>${title.replace(/</g, '&lt;')}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; min-height: 100%;
      background: #0f172a;
      background: radial-gradient(circle at top, #1e293b 0%, #0f172a 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #f8fafc;
      display: flex;
      justify-content: center;
      padding: 32px 16px;
    }
    .container {
      width: 100%;
      max-width: 420px;
      margin: auto;
      text-align: center;
    }
    .profile-card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 28px;
      padding: 36px 24px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      font-size: 12px;
      font-weight: 700;
      border-radius: 20px;
      margin-bottom: 20px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .title {
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .subtitle {
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .links-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .link-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }
    .link-btn:hover, .link-btn:active {
      background: var(--bg);
      border-color: var(--bg);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }
    .link-btn .icon {
      font-size: 22px;
      margin-right: 12px;
    }
    .link-btn .label {
      flex: 1;
      text-align: left;
    }
    .link-btn .arrow {
      font-size: 18px;
      opacity: 0.6;
      transition: transform 0.2s;
    }
    .link-btn:hover .arrow {
      transform: translateX(4px);
      opacity: 1;
    }
    .footer {
      margin-top: 32px;
      font-size: 12px;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .footer strong { color: #f59e0b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="profile-card">
      <div class="badge">✨ VitDoor Interactive</div>
      <h1 class="title">${title.replace(/</g, '&lt;')}</h1>
      ${subtitle ? `<p class="subtitle">${subtitle.replace(/</g, '&lt;')}</p>` : ''}

      <div class="links-list">
        ${linksHtml || '<p style="color:#64748b;font-size:14px;">Nenhum link cadastrado.</p>'}
      </div>
    </div>

    <div class="footer">
      Powered by <strong>VitDoor</strong> Mídia Indoor
    </div>
  </div>
</body>
</html>`;
}
