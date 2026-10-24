import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Post media storage in our own S3 (the `s3` SeaweedFS container; any S3-compatible works).
 * Local disk keeps a working copy for platforms that take file uploads (Telegram/X/LinkedIn);
 * the bucket is anonymously readable, giving Meta (Instagram, Threads) a public URL
 * without exposing the panel itself.
 */
export function s3Enabled() {
  return !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_PUBLIC_URL);
}

let client: S3Client | undefined;
function s3() {
  client ??= new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT, // MinIO / R2 style endpoints
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  return client;
}

let bucketReady: Promise<void> | undefined;
export function ensureBucket() {
  bucketReady ??= (async () => {
    const Bucket = process.env.S3_BUCKET!;
    try {
      await s3().send(new HeadBucketCommand({ Bucket }));
    } catch {
      await s3().send(new CreateBucketCommand({ Bucket }));
    }
  })().catch((e) => {
    bucketReady = undefined; // retry on next call
    throw e;
  });
  return bucketReady;
}

export async function mirrorToS3(key: string, body: Buffer, contentType: string) {
  if (!s3Enabled()) return;
  await ensureBucket();
  await s3().send(
    new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `media/${key}`, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }),
  );
}

export function s3PublicUrl(key: string) {
  return `${process.env.S3_PUBLIC_URL!.replace(/\/$/, '')}/media/${encodeURIComponent(key)}`;
}
