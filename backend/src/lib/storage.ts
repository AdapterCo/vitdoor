import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

export async function saveFile(file: Express.Multer.File, tenantId: string, mediaId: string): Promise<{ url: string; storagePath: string }> {
  const safeName = path.basename(file.originalname).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const filename = `${Date.now()}-${safeName || 'media'}`;
  const objectKey = `tenants/${tenantId}/media/${mediaId}/${filename}`;
  
  if (s3Client && process.env.R2_BUCKET_NAME) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: objectKey,
          Body: file.buffer,
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
  fs.writeFileSync(localFilePath, file.buffer);
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
  const url = `${publicBaseUrl}/uploads/${encodeURIComponent(filename)}`;
  return { url, storagePath: filename };
}
