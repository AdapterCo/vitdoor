import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Only globally routed unicast; rejects mapped IPv4, loopback, ULA and link-local.
  if (isIP(address) !== 6) return false;
  const parts = address.split(':');
  const first = parseInt(parts[0], 16), second = parseInt(parts[1] || '0', 16);
  return first >= 0x2000 && first < 0x3fff && first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}

export function safeFeedUrl(raw: string): URL {
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || /(^localhost$|\.localhost\.?$|\.local\.?$|\.internal\.?$)/i.test(host) || (isIP(host) && !isPublicAddress(host))) throw new Error('Endereço de feed não permitido.');
  const allowed = (process.env.RSS_ALLOWED_HOSTS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(host)) throw new Error('Host de feed não autorizado.');
  return url;
}

export async function fetchPublicFeed(raw: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const signal = AbortSignal.timeout(8000);
  let url = safeFeedUrl(raw);
  for (let redirect = 0; redirect <= 4; redirect++) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new Error('Timeout do feed.'));
        else signal.addEventListener('abort', () => reject(new Error('Timeout do feed.')), { once: true });
      })
    ]);
    if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('IP do feed não permitido.');
    const selected = addresses[0];
    const result = await new Promise<{ text?: string; location?: string }>((resolve, reject) => {
      const request = https.get(url, {
        agent: false, signal,
        // Bind the verified address to the actual connection, preventing DNS rebinding.
        lookup: ((_host: string, options: any, cb: any) => options.all ? cb(null, [selected]) : cb(null, selected.address, selected.family)) as any,
        headers: { 'User-Agent': 'VitDoor-RSS/1.0', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'Accept-Encoding': 'identity' }
      }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
          const location = response.headers.location; response.destroy();
          if (!location) reject(new Error('Redirecionamento inválido.')); else resolve({ location });
          return;
        }
        if (response.statusCode !== 200) { response.destroy(); reject(new Error(`HTTP ${response.statusCode}`)); return; }
        let total = 0; const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => { total += chunk.length; if (total > maxBytes) request.destroy(new Error('Feed excede 2 MB.')); else chunks.push(chunk); });
        response.on('error', reject);
        response.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.on('error', reject);
    });
    if (result.text !== undefined) return result.text;
    url = safeFeedUrl(new URL(result.location!, url).toString());
  }
  throw new Error('Excesso de redirecionamentos.');
}
