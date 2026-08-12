/**
 * ctaHelpers.ts
 *
 * Camada central de normalização e construção de URLs para CTAs.
 *
 * Utilizada por:
 *   - backend/src/routes/mediaRoutes.ts  (persistência / normalizeCta)
 *   - backend/src/routes/qrRoutes.ts     (redirect QR Code e NFC)
 *
 * Compatível com registros antigos que armazenam o target como URL wa.me:
 *   { "type": "WHATSAPP", "target": "https://wa.me/5521985080634?text=Ola" }
 *
 * E com o novo modelo canônico:
 *   { "type": "WHATSAPP", "target": "5521985080634", "text": "Olá!" }
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CtaObject {
  enabled?: boolean;
  type: string;
  /** Para WHATSAPP: dígitos puros ou URL wa.me legada. Para outros tipos: URL completa. */
  target: string;
  /** Para WHATSAPP: mensagem pré-preenchida (novo modelo canônico). */
  text?: string;
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

/**
 * Retorna `true` se `digits` é um número de telefone válido.
 * Aceita de 10 a 15 dígitos (padrão internacional ITU-T E.164 máx = 15).
 */
export function isValidPhone(digits: string): boolean {
  return /^\d{10,15}$/.test(digits);
}

/**
 * Garante que o número possua o código do país.
 * Se o número tiver 10–11 dígitos (formato brasileiro com DDD, sem +55),
 * o prefixo "55" é adicionado automaticamente.
 *
 * Exemplos:
 *   "21985080634"   → "5521985080634"  (celular BR com DDD, sem +55)
 *   "2134567890"    → "552134567890"   (fixo BR com DDD, sem +55)
 *   "5521985080634" → "5521985080634"  (já tem código do país)
 *   "12025551234"   → "12025551234"    (EUA, 11 dígitos – mantém como está)
 *
 * Nota: números de 11 dígitos de outros países (ex.: +1 800 5551234)
 * tecnicamente precisariam do código do país. Mas como o VitDoor serve
 * clientes majoritariamente brasileiros, o padrão é adicionar 55.
 */
export function ensureBrazilCountryCode(digits: string): string {
  if (!digits) return digits;
  // Já tem código de país se tiver 12+ dígitos
  if (digits.length >= 12) return digits;
  // 10–11 dígitos → número brasileiro sem +55
  if (digits.length >= 10) return '55' + digits;
  // Número muito curto — retorna como está (será rejeitado por isValidPhone)
  return digits;
}

/**
 * Extrai phone e text de qualquer formato de entrada:
 *   - Dígitos puros:                    "5521985080634"
 *   - Número com máscara:               "+55 (21) 98508-0634"
 *   - URL wa.me:                        "https://wa.me/5521985080634"
 *   - URL wa.me com texto:              "https://wa.me/5521985080634?text=Ola"
 *   - URL api.whatsapp.com:             "https://api.whatsapp.com/send/?phone=5521..."
 *   - Novo modelo com text separado:    { target: "5521985080634", text: "Olá!" }
 *
 * O parâmetro `cta` é o objeto CTA completo para que o campo `text`
 * separado (novo modelo) tenha precedência sobre o ?text= embutido na URL.
 */
export function parseWhatsAppTarget(cta: Pick<CtaObject, 'target' | 'text'>): WhatsAppParsed | null {
  const raw = String(cta.target || '').trim();
  if (!raw) return null;

  // --- Caso 1: URL completa (wa.me ou api.whatsapp.com) ---
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      let phone = '';
      let text: string | undefined;

      if (url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com') {
        if (url.hostname === 'wa.me') {
          // https://wa.me/5521985080634[?text=...]
          phone = url.pathname.replace(/^\/+/, '').replace(/\D/g, '');
          text = url.searchParams.get('text') ?? undefined;
        } else {
          // https://api.whatsapp.com/send/?phone=55219...&text=...
          phone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
          text = url.searchParams.get('text') ?? undefined;
        }
      } else {
        // Outra URL com protocolo: não é WhatsApp — retorna null
        return null;
      }

      phone = ensureBrazilCountryCode(phone);
      if (!isValidPhone(phone)) return null;

      // O campo text separado (novo modelo) tem precedência sobre o ?text= da URL
      const finalText = (cta.text?.trim()) || text || undefined;
      return { phone, text: finalText };
    } catch {
      return null;
    }
  }

  // --- Caso 2: Número puro ou com máscara (+55 21 98508-0634) ---
  const digits = ensureBrazilCountryCode(raw.replace(/\D/g, ''));
  if (!isValidPhone(digits)) return null;

  const finalText = cta.text?.trim() || undefined;
  return { phone: digits, text: finalText };
}

/**
 * Constrói a URL web canônica para WhatsApp.
 * Usada no QR Code (redirect simples via 302).
 *
 * Exemplo:
 *   buildWhatsAppWebUrl("5521985080634", "Olá!")
 *   → "https://wa.me/5521985080634?text=Ol%C3%A1!"
 */
export function buildWhatsAppWebUrl(phone: string, text?: string): string {
  const base = `https://wa.me/${phone}`;
  if (text && text.trim()) {
    return `${base}?text=${encodeURIComponent(text.trim())}`;
  }
  return base;
}

/**
 * Constrói a URI de esquema nativo para abrir o aplicativo WhatsApp diretamente.
 * Usada na página HTML intermediária do NFC.
 *
 * Exemplo:
 *   buildWhatsAppAppUrl("5521985080634", "Olá!")
 *   → "whatsapp://send?phone=5521985080634&text=Ol%C3%A1!"
 */
export function buildWhatsAppAppUrl(phone: string, text?: string): string {
  const base = `whatsapp://send?phone=${phone}`;
  if (text && text.trim()) {
    return `${base}&text=${encodeURIComponent(text.trim())}`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Instagram helpers
// ---------------------------------------------------------------------------

/**
 * Normaliza um handle ou URL do Instagram para a URL canônica.
 *
 * Entrada: "@sualoja" | "sualoja" | "https://instagram.com/sualoja"
 * Saída:   "https://instagram.com/sualoja"
 */
export function normalizeInstagramTarget(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      new URL(trimmed); // valida que é uma URL bem formada
      return trimmed;
    } catch {
      return null;
    }
  }

  const handle = trimmed.replace(/^@/, '').trim();
  if (!handle) return null;
  return `https://instagram.com/${handle}`;
}

// ---------------------------------------------------------------------------
// URL genérica helpers
// ---------------------------------------------------------------------------

/**
 * Normaliza uma URL genérica, adicionando https:// quando necessário.
 *
 * Entrada: "cardapio.digital/mesa1"
 * Saída:   "https://cardapio.digital/mesa1"
 */
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
// getNormalizedTargetUrl — usado pelos endpoints de redirect (QR e NFC)
// ---------------------------------------------------------------------------

/**
 * Dado um objeto CTA (parseado do ctaJson), retorna a URL final de destino.
 *
 * Para WHATSAPP: retorna `https://wa.me/<phone>[?text=...]`.
 * Para INSTAGRAM: retorna `https://instagram.com/<handle>`.
 * Para URL/CUSTOM_URL/WEBSITE: retorna a URL normalizada.
 *
 * Retorna string vazia se o CTA for inválido.
 */
export function getNormalizedTargetUrl(cta: any): string {
  if (!cta || !cta.target) return '';

  if (cta.type === 'WHATSAPP') {
    const parsed = parseWhatsAppTarget(cta);
    if (!parsed) return '';
    return buildWhatsAppWebUrl(parsed.phone, parsed.text);
  }

  if (cta.type === 'INSTAGRAM') {
    return normalizeInstagramTarget(String(cta.target)) ?? '';
  }

  // URL / CUSTOM_URL / WEBSITE
  return normalizeGenericUrl(String(cta.target)) ?? '';
}
