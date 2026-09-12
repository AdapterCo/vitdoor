import { prisma } from './prisma.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { HttpError } from './validation.js';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

let s3Client: S3Client | null = null;
if (
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  !process.env.R2_ACCOUNT_ID.includes('placeholder')
) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export function assertStorageConfiguration(): void {
  if (process.env.STORAGE_DRIVER !== 'r2') return;
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Configuração R2 incompleta. Variáveis ausentes: ${missing.join(', ')}`);
  if (process.env.NODE_ENV === 'production' && !process.env.R2_PUBLIC_URL!.startsWith('https://')) {
    throw new Error('R2_PUBLIC_URL deve usar HTTPS em produção.');
  }
}

export function localStoragePath(key: string, privateFile = false): string {
  if (key.includes('\\')) throw new Error('Caminho de arquivo inválido.');
  const root = path.resolve(process.cwd(), privateFile ? 'private' : 'uploads');
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Caminho de arquivo inválido.');
  return full;
}

export async function saveFile(file: Express.Multer.File, tenantId: string, mediaId: string): Promise<{ url: string; storagePath: string }> {
  const safeName = path.basename(file.originalname).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const filename = `${Date.now()}-${safeName || 'media'}`;
  const objectKey = `tenants/${tenantId}/media/${mediaId}/${filename}`;

  const bodyData = file.buffer || (file.path ? fs.createReadStream(file.path) : null);
  if (!bodyData) throw new Error('Dados do arquivo de mídia inválidos.');

  if (s3Client && process.env.R2_BUCKET_NAME) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: objectKey,
          Body: bodyData,
          ContentLength: file.size,
          ContentType: file.mimetype,
          ContentDisposition: 'inline',
          CacheControl: 'public, max-age=31536000, immutable'
        })
      );
      const publicUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');
      return { url: `${publicUrl}/${objectKey.split('/').map(encodeURIComponent).join('/')}`, storagePath: objectKey };
    } catch (err) {
      if (process.env.NODE_ENV === 'production' && process.env.STORAGE_DRIVER === 'r2') {
        throw err;
      }
      console.warn('R2 Upload failed, falling back to local storage:', err);
    }
  }

  if (process.env.STORAGE_DRIVER === 'r2') {
    throw new Error('R2 foi selecionado, mas suas credenciais não estão configuradas.');
  }

  // Local storage fallback
  const localFilePath = path.join(uploadDir, filename);
  if (file.buffer) {
    await fs.promises.writeFile(localFilePath, file.buffer);
  } else if (file.path) {
    await fs.promises.copyFile(file.path, localFilePath);
  }
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
  const url = `${publicBaseUrl}/uploads/${encodeURIComponent(filename)}`;
  return { url, storagePath: filename };
}

export async function saveScreenshot(buffer: Buffer, mimeType: 'image/jpeg' | 'image/png', tenantId: string, screenId: string): Promise<{ url: string; storagePath: string }> {
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  const filename = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const objectKey = `tenants/${tenantId}/screenshots/${screenId}/${filename}`;
  if (s3Client && process.env.R2_BUCKET_NAME) {
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: objectKey,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'private, no-store',
      ContentDisposition: 'inline'
    }));
    return { url: `${process.env.R2_PUBLIC_URL!.replace(/\/$/, '')}/${objectKey.split('/').map(encodeURIComponent).join('/')}`, storagePath: objectKey };
  }
  if (process.env.STORAGE_DRIVER === 'r2') throw new Error('R2 foi selecionado, mas suas credenciais não estão configuradas.');
  const localPath = path.join(uploadDir, filename);
  await fs.promises.writeFile(localPath, buffer);
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
  return { url: `${publicBaseUrl}/uploads/${encodeURIComponent(filename)}`, storagePath: filename };
}

/** Both existing player transports persist the image before confirming success. */
export async function persistScreenshot(buffer: Buffer, mimeType: 'image/jpeg' | 'image/png', tenantId: string, screenId: string, commandId: string) {
  const command = await prisma.remoteCommand.findFirst({ where: { commandId, screenId, tenantId, action: 'TAKE_SCREENSHOT' } });
  if (!command || !['PENDING', 'SENT'].includes(command.status) || command.expiresAt <= new Date()) throw new HttpError(409, 'Comando de captura inválido ou finalizado.');
  const stored = await saveScreenshot(buffer, mimeType, tenantId, screenId);
  const capturedAt = new Date();
  try {
    await prisma.$transaction(async tx => {
      const result = await tx.remoteCommand.updateMany({ where: { commandId, screenId, tenantId, status: { in: ['PENDING', 'SENT'] }, expiresAt: { gt: new Date() } }, data: { status: 'SUCCEEDED', success: true, message: 'Screenshot recebido.', completedAt: capturedAt } });
      if (!result.count) throw new HttpError(409, 'Comando já finalizado.');
      await tx.screen.update({ where: { id: screenId }, data: { lastScreenshotUrl: stored.url, screenshotPath: stored.storagePath } });
      // The URL and storage path are committed together with the command.
    });
  } catch (error) {
    await deleteStoredFile(stored.storagePath).catch(() => console.error('Failed to remove unregistered screenshot'));
    throw error;
  }
  return { ...stored, capturedAt };
}

/** Only resolve legacy objects belonging to the already-authorized screen. No arbitrary URL fetch. */
export function legacyScreenshotLocation(screen: { id: string; tenantId: string; lastScreenshotUrl?: string | null }): { kind: 'r2' | 'local'; key: string } | null {
  if (!screen.lastScreenshotUrl) return null;
  let url: URL;
  try { url = new URL(screen.lastScreenshotUrl); } catch { return null; }
  if (url.username || url.password || url.search || url.hash) return null;
  const roots = [
    { kind: 'r2' as const, base: process.env.R2_PUBLIC_URL, prefix: `tenants/${screen.tenantId}/screenshots/${screen.id}/` },
    { kind: 'local' as const, base: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/uploads` : undefined, prefix: '' }
  ];
  for (const root of roots) {
    if (!root.base) continue;
    const base = new URL(root.base.replace(/\/$/, '') + '/');
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) continue;
    let key: string;
    try { key = decodeURIComponent(url.pathname.slice(base.pathname.length)); } catch { continue; }
    if (!key.startsWith(root.prefix)) continue;
    const filename = key.slice(root.prefix.length);
    if (/^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/i.test(filename)) return { kind: root.kind, key };
  }
  return null;
}

export async function readStoredScreenshot(screen: { id: string; tenantId: string; screenshotPath?: string | null; lastScreenshotUrl?: string | null }): Promise<{ buffer: Buffer; mime: string }> {
  let buffer: Buffer;
  if (screen.screenshotPath?.startsWith('private:')) {
    const key = screen.screenshotPath.slice(8);
    if (!key.startsWith(`screenshots/${screen.tenantId}/${screen.id}/`)) throw new HttpError(404, 'Captura não encontrada.');
    buffer = await fs.promises.readFile(localStoragePath(key, true)).catch(error => { if (error.code === 'ENOENT') throw new HttpError(404, 'Arquivo de captura ausente. Solicite uma nova captura e confira o volume privado do backend.'); throw error; });
  } else if (/^data:image\/(jpeg|png);base64,/.test(screen.lastScreenshotUrl || '')) {
    const value = screen.lastScreenshotUrl!;
    if (value.length > 3 * 1024 * 1024 || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(value)) throw new HttpError(415, 'Captura antiga inválida.');
    buffer = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
  } else {
    const legacy = legacyScreenshotLocation(screen);
    if (!legacy) throw new HttpError(404, 'Captura não disponível. Solicite uma nova captura.');
    if (legacy.kind === 'local') {
      buffer = await fs.promises.readFile(localStoragePath(legacy.key)).catch(error => { if (error.code === 'ENOENT') throw new HttpError(404, 'Captura antiga não encontrada. Solicite uma nova captura.'); throw error; });
    } else {
      if (!s3Client || !process.env.R2_BUCKET_NAME) throw new HttpError(503, 'Armazenamento da captura temporariamente indisponível.');
      const result = await s3Client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: legacy.key }), { abortSignal: AbortSignal.timeout(15000) }).catch(error => { if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) throw new HttpError(404, 'Captura antiga não encontrada no R2. Solicite uma nova captura.'); throw error; });
      if (!result.Body || (result.ContentLength || 0) > 2 * 1024 * 1024) throw new HttpError(415, 'Captura inválida.');
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) { size += chunk.length; if (size > 2 * 1024 * 1024) { (result.Body as any).destroy?.(); throw new HttpError(415, 'Captura excede o limite.'); } chunks.push(Buffer.from(chunk)); }
      buffer = Buffer.concat(chunks);
    }
  }
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (buffer.length > 2 * 1024 * 1024 || (!png && !jpeg)) throw new HttpError(415, 'Captura inválida. Solicite uma nova captura.');
  return { buffer, mime: png ? 'image/png' : 'image/jpeg' };
}

export async function deleteStoredFile(storagePath?: string | null): Promise<void> {
  if (!storagePath) return;
  if (storagePath.startsWith('r2:') || storagePath.startsWith('tenants/')) {
    const parts = storagePath.split(':');
    const bucket = parts[0] === 'r2' ? parts[1] : process.env.R2_BUCKET_NAME;
    const key = parts[0] === 'r2' ? parts.slice(2).join(':') : storagePath;
    if (!s3Client || !bucket) throw new Error('Credenciais necessárias para excluir objeto R2.');
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(15_000) });
    return;
  }
  const privateFile = storagePath.startsWith('private:');
  const key = storagePath.replace(/^(local|private):/, '');
  await fs.promises.unlink(localStoragePath(key, privateFile)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
}

/** Purga a URL pública se as credenciais opcionais da zona estiverem presentes.
 * Sem purge, uma cópia já cacheada pela CDN pode sobreviver ao DeleteObject. */
export async function purgePublicUrl(publicUrl?: string | null): Promise<void> {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  const token = process.env.CLOUDFLARE_PURGE_TOKEN?.trim();
  if (!publicUrl || !zoneId || !token) return;
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: [publicUrl] })
  });
  if (!response.ok) throw new Error(`Falha ao purgar mídia da Cloudflare (${response.status}).`);
}
