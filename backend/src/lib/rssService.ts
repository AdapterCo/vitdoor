import { safeFeedUrl, fetchPublicFeed } from './safeHttp.js';
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

export function assertSafeFeedUrl(raw: string): string { return safeFeedUrl(raw).toString(); }

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

/** Busca um feed e atualiza o cache em memória. Nunca lança.
 *  Retorna true quando o conjunto de manchetes mudou em relação ao valor anterior. */
export async function refreshFeed(url: string): Promise<boolean> {
  try {
    const safe = assertSafeFeedUrl(url);
    const xml = await fetchPublicFeed(safe);
    const items = parseFeedTitles(xml);
    if (items.length === 0) throw new Error('Feed sem manchetes.');
    const hash = items.join('');
    const previous = cache.get(url);
    if (cache.size >= 5000 && !cache.has(url)) cache.delete(cache.keys().next().value!);
    cache.set(url, { items, hash, fetchedAt: Date.now(), failing: false });
    return !previous || previous.hash !== hash;
  } catch (error) {
    if (cache.size >= 5000 && !cache.has(url)) cache.delete(cache.keys().next().value!);
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
