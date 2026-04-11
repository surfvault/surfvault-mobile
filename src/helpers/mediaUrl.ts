import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl ?? '';
const ENV = Constants.expoConfig?.extra?.environment ?? 'dev';
const WATERMARK_BUCKET = `${ENV === 'prod' ? 'prod' : 'dev'}-surf-watermark`;

/**
 * Extract the original S3 key from a thumbnail/preview URL or key string.
 */
export function toOriginalKey(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey) return null;
  if (urlOrKey.includes('key=')) return decodeURIComponent(urlOrKey.split('key=')[1]);
  if (urlOrKey.includes('com/')) return urlOrKey.split('com/')[1];
  return urlOrKey;
}

/**
 * Build the Lambda watermark endpoint URL for a given S3 key.
 * Generates the watermark on-demand, stores in S3 (7-day TTL), returns 302 redirect.
 */
export function getWatermarkUrl(originalS3Key: string): string {
  return `${API_BASE_URL}/watermarked?key=${encodeURIComponent(originalS3Key)}`;
}

/**
 * Build a direct S3 URL to the cached watermarked photo.
 * Watermark keys mirror the preview key with .jpg extension.
 */
export function getDirectWatermarkUrl(originalS3Key: string): string {
  if (!originalS3Key) return '';
  const watermarkKey = originalS3Key.replace(/\.[^.]+$/, '.jpg');
  const encoded = encodeURIComponent(watermarkKey).replace(/%2F/g, '/');
  return `https://${WATERMARK_BUCKET}.s3.amazonaws.com/${encoded}`;
}
