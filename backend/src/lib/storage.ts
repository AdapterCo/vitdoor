import { prisma } from './prisma.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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
  if (process.env.NODE_ENV === 'production') {
    for (const name of ['CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_PURGE_TOKEN']) if (!process.env[name]?.trim()) missing.push(name);
  }
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

export async function saveFile(file: Express.Multer.File, tenantId: string, mediaId: string): Promise<{ url: string; storagePath: string; cleanupId: string }> {
  const safeName = path.basename(file.originalname).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'media';
  const objectKey = `tenants/${tenantId}/media/${mediaId}/${crypto.randomUUID()}-${safeName}`;
  const r2 = process.env.STORAGE_DRIVER === 'r2';
  const bucket = process.env.R2_BUCKET_NAME;
  if (r2 && (!s3Client || !bucket)) throw new Error('Storage R2 não configurado.');
  const storagePath = r2 ? `r2:${bucket}:${objectKey}` : `local:${objectKey}`;
  const baseUrl = (r2 ? process.env.R2_PUBLIC_URL! : `${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/uploads`).replace(/\/$/, '');
  const url = `${baseUrl}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  // Durable compensation is registered before touching object storage.
  const cleanup = await prisma.storageDeletion.create({ data: { storagePath, publicUrl: url, nextAttemptAt: new Date(Date.now() + 3600_000) } });
  if (r2) {
    await s3Client!.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: file.buffer || fs.createReadStream(file.path), ContentLength: file.size, ContentType: file.mimetype, ContentDisposition: 'inline', CacheControl: 'public, max-age=86400' }), { abortSignal: AbortSignal.timeout(120_000) });
  } else {
    const destination = localStoragePath(objectKey);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    if (file.buffer) await fs.promises.writeFile(destination, file.buffer, { flag: 'wx' });
    else await fs.promises.copyFile(file.path, destination, fs.constants.COPYFILE_EXCL);
  }
  return { url, storagePath, cleanupId: cleanup.id };
}

export async function saveScreenshot(buffer: Buffer, mimeType: 'image/jpeg' | 'image/png', tenantId: string, screenId: string): Promise<{ url: string; storagePath: string; cleanupId: string }> {
  const key = `screenshots/${tenantId}/${screenId}/${crypto.randomUUID()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
  const storagePath = `private:${key}`;
  const cleanup = await prisma.storageDeletion.create({ data: { storagePath, nextAttemptAt: new Date(Date.now() + 3600_000) } });
  const destination = localStoragePath(key, true);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await fs.promises.writeFile(destination, buffer, { flag: 'wx' });
  return { url: `${(process.env.PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/$/, '')}/api/screens/${screenId}/screenshot?v=${Date.now()}`, storagePath, cleanupId: cleanup.id };
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
