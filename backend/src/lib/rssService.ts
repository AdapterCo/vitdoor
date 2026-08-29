import { XMLParser } from 'fast-xml-parser';

const MAX_ITEMS = 20;
const MAX_ITEM_CHARS = 200;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: true,
  processEntities: true,
  htmlEntities: true,
  trimValues: true
});

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;
const PRIVATE_IP = /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc00:|fd00:|fe80:)/i;

interface FeedCacheEntry {
  items: string[];
  hash: string;
  fetchedAt: number;
  failing: boolean;
}

const cache = new Map<string, FeedCacheEntry>();

/** Valida a URL do feed antes de qualquer requisição (defesa contra SSRF por host).
 *  Não protege contra DNS rebinding — aceitável para URLs configuradas pelo admin. */
export function assertSafeFeedUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL de feed inválida.');
  }
  if (url.protocol !== 'https:') throw new Error('O feed RSS deve usar HTTPS.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (PRIVATE_HOST.test(host) || PRIVATE_IP.test(host)) {
    throw new Error('Endereço de feed não permitido.');
  }
  return url.toString();
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai os títulos dos itens de um feed RSS 2.0, RDF ou Atom, já limpos. */
export function parseFeedTitles(xml: string): string[] {
  const doc = parser.parse(xml);
  const raw =
    doc?.rss?.channel?.item ??
    doc?.['rdf:RDF']?.item ??
    doc?.RDF?.item ??
    doc?.feed?.entry ??
    [];
  const list = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const item of list) {
    let title = item?.title;
    if (title && typeof title === 'object') title = title['#text'] ?? '';
    const clean = stripHtml(String(title ?? '')).slice(0, MAX_ITEM_CHARS).trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    titles.push(clean);
    if (titles.length >= MAX_ITEMS) break;
  }
  return titles;
}

async function fetchFeedText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'VitDoor-RSS/1.0',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) return await response.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        controller.abort();
        throw new Error('Feed maior que o limite de 2 MB.');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    clearTimeout(timer);
  }
}

/** Busca um feed e atualiza o cache em memória. Nunca lança.
 *  Retorna true quando o conjunto de manchetes mudou em relação ao valor anterior. */
export async function refreshFeed(url: string): Promise<boolean> {
  try {
    const safe = assertSafeFeedUrl(url);
    const xml = await fetchFeedText(safe);
    const items = parseFeedTitles(xml);
    if (items.length === 0) throw new Error('Feed sem manchetes.');
    const hash = items.join('');
    const previous = cache.get(url);
    cache.set(url, { items, hash, fetchedAt: Date.now(), failing: false });
    return !previous || previous.hash !== hash;
  } catch (error) {
    const previous = cache.get(url);
    cache.set(url, {
      items: previous?.items ?? [],
      hash: previous?.hash ?? '',
      fetchedAt: previous?.fetchedAt ?? 0,
      failing: true
    });
    console.warn(`RSS: falha ao atualizar ${url}: ${(error as Error).message}`);
    return false;
  }
}

/** Manchetes atualmente em cache para a URL (vazio se nunca resolveu). */
export function getFeedItems(url: string): string[] {
  return cache.get(url)?.items ?? [];
}
