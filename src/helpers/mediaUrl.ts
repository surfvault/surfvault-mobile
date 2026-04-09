import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl ?? '';

/**
 * Extract the original S3 key from a thumbnail/preview URL or key string.
 * Handles:
 *   - Lambda URLs: ...?key=some/path  -> some/path
 *   - S3/CDN URLs: https://bucket.s3.amazonaws.com/some/path -> some/path
 *   - Raw keys: some/path -> some/path
 */
export function toOriginalKey(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey) return null;
  if (urlOrKey.includes('key=')) return decodeURIComponent(urlOrKey.split('key=')[1]);
  if (urlOrKey.includes('com/')) return urlOrKey.split('com/')[1];
  return urlOrKey;
}

/**
 * Build the Lambda watermark endpoint URL for a given S3 key.
 * This endpoint generates the watermark on-demand and returns the image.
 */
export function getWatermarkUrl(originalS3Key: string): string {
  return `${API_BASE_URL}/watermarked?key=${encodeURIComponent(originalS3Key)}`;
}
