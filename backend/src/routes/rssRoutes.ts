import { Router, Request, Response } from 'express';

export const rssRoutes = Router();

const feedCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/public/rss?url=...
 * Proxy e Parser público de RSS / Atom feeds de notícias.
 */
rssRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  let feedUrl = req.query.url as string | undefined;

  if (!feedUrl || typeof feedUrl !== 'string') {
    return res.status(400).json({ error: 'URL de feed RSS é obrigatória.' });
  }

  feedUrl = feedUrl.trim();
  if (!/^https?:\/\//i.test(feedUrl)) {
    feedUrl = `https://${feedUrl}`;
  }

  const cached = feedCache.get(feedUrl);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const parsedUrl = new URL(feedUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Apenas HTTP e HTTPS são permitidos.' });
    }
    const hostname = parsedUrl.hostname;
    const isPrivate = /^(localhost|::1|0\.0\.0\.0)$/i.test(hostname) ||
                      /^(127|10|192\.168|169\.254)\./.test(hostname) ||
                      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
    if (isPrivate) {
      return res.status(400).json({ error: 'Acesso a IP interno bloqueado.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VitDoor-RSS-Reader/2.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Servidor de notícias retornou HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    // Detect encoding from Content-Type or XML header
    const contentType = response.headers.get('content-type') || '';
    let charset = 'utf-8';
    if (/iso-8859-1|latin1/i.test(contentType)) {
      charset = 'iso-8859-1';
    } else {
      const sampleText = new TextDecoder('ascii').decode(buffer.slice(0, 300));
      const encodingMatch = sampleText.match(/encoding=["']([^"']+)["']/i);
      if (encodingMatch && /iso-8859-1|latin1/i.test(encodingMatch[1])) {
        charset = 'iso-8859-1';
      }
    }

    const decoder = new TextDecoder(charset);
    const xmlText = decoder.decode(buffer);

    const parsedFeed = parseRssXml(xmlText);

    feedCache.set(feedUrl, { timestamp: Date.now(), data: parsedFeed });
    return res.json(parsedFeed);
  } catch (err: any) {
    return res.status(502).json({
      error: 'Não foi possível carregar as notícias deste feed RSS.',
      details: err.message || 'Falha na conexão com o servidor de notícias.'
    });
  }
});

function parseRssXml(xml: string) {
  const cleanXml = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

  // Extract channel title
  const channelTitleMatch = cleanXml.match(/<channel[\s\S]*?<title>(.*?)<\/title>/i) || cleanXml.match(/<title>(.*?)<\/title>/i);
  const channelTitle = sanitizeText(channelTitleMatch?.[1] || 'Notícias em Tempo Real');

  // Extract items
  const items: any[] = [];
  const itemRegex = /<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi;
  let match;

  while ((match = itemRegex.exec(cleanXml)) !== null && items.length < 15) {
    const block = match[0];
    const title = sanitizeText(extractTag(block, 'title'));
    const link = extractTag(block, 'link') || extractAttribute(block, 'link', 'href');
    const descriptionRaw = extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content');
    const description = sanitizeText(descriptionRaw.replace(/<[^>]+>/g, ''));
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'dc:date');
    const imageUrl = extractImage(block, descriptionRaw);

    if (title) {
      items.push({
        title,
        link,
        description: description.slice(0, 280),
        pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        imageUrl: imageUrl || null
      });
    }
  }

  return {
    title: channelTitle,
    items
  };
}

function extractTag(xmlBlock: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = xmlBlock.match(regex);
  return m ? m[1].trim() : '';
}

function extractAttribute(xmlBlock: string, tagName: string, attrName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']+)["']`, 'i');
  const m = xmlBlock.match(regex);
  return m ? m[1].trim() : '';
}

function extractImage(xmlBlock: string, htmlContent: string): string | null {
  const mediaMatch = xmlBlock.match(/url=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i);
  if (mediaMatch) return mediaMatch[1];

  const enclosureMatch = xmlBlock.match(/<enclosure[^>]*url=["'](https?:\/\/[^"']+)["']/i);
  if (enclosureMatch) return enclosureMatch[1];

  const imgMatch = htmlContent.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  if (imgMatch) return imgMatch[1];

  return null;
}

function sanitizeText(str: string): string {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}
