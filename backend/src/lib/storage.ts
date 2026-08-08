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

export async function saveFile(file: Express.Multer.File): Promise<{ url: string; storagePath: string }> {
  const filename = `${Date.now()}-${path.basename(file.originalname).replace(/\s+/g, '_')}`;
  
  if (s3Client && process.env.R2_BUCKET_NAME) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: filename,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );
      const url = `${process.env.R2_PUBLIC_URL}/${filename}`;
      return { url, storagePath: filename };
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
