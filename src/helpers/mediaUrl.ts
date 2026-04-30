import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl ?? '';
const ENV = Constants.expoConfig?.extra?.environment ?? 'dev';
const WATERMARK_BUCKET = `${ENV === 'prod' ? 'prod' : 'dev'}-surf-watermark`;
const BOARDS_BUCKET = `${ENV === 'prod' ? 'prod' : 'dev'}-surf-boards`;

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
 * Preview/watermark keys always use .jpg extension regardless of original format.
 */
export function getDirectWatermarkUrl(originalS3Key: string): string {
  if (!originalS3Key) return '';
  const watermarkKey = originalS3Key.replace(/\.[^.]+$/, '.jpg');
  const encoded = encodeURIComponent(watermarkKey).replace(/%2F/g, '/');
  return `https://${WATERMARK_BUCKET}.s3.amazonaws.com/${encoded}`;
}

/**
 * Build the public URL for a board photo (shaper portfolio). The boards
 * bucket is public-read by policy — these photos are intentionally
 * unwatermarked since shapers want their work shown.
 *
 * Accepts either a bare s3_key (e.g. "<boardId>/<uuid>.jpeg") or a full URL
 * (returned as-is, in case the API ever starts handing back full URLs).
 */
export function getBoardPhotoUrl(s3KeyOrUrl: string | null | undefined): string | null {
  if (!s3KeyOrUrl) return null;
  if (s3KeyOrUrl.startsWith('http')) return s3KeyOrUrl;
  const encoded = encodeURIComponent(s3KeyOrUrl).replace(/%2F/g, '/');
  return `https://${BOARDS_BUCKET}.s3.amazonaws.com/${encoded}`;
}
