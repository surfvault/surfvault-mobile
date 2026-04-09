import { Paths, File as ExpoFile, downloadAsync } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import Constants from 'expo-constants';
import { getAuthToken } from '../store/apis/customBaseQuery';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl ?? '';

/**
 * Request media library write permissions.
 * Returns true if granted.
 */
async function ensurePermissions(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Save a single photo (original quality) to the device's camera roll.
 *
 * 1. Fetches a presigned URL for the original from the API
 * 2. Downloads to a temp file
 * 3. Saves to the camera roll via MediaLibrary
 * 4. Cleans up the temp file
 */
export async function savePhotoToCameraRoll(photoId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check permissions
    const hasPermission = await ensurePermissions();
    if (!hasPermission) {
      return { success: false, error: 'Photo library permission denied' };
    }

    // Get auth token
    const token = await getAuthToken();
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    // Fetch presigned URL from API
    const response = await fetch(`${API_BASE_URL}/media/photo/${photoId}/download-url`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { success: false, error: body.message ?? `Failed to get download URL (${response.status})` };
    }

    const data = await response.json();
    const presignedUrl = data.results?.url;
    if (!presignedUrl) {
      return { success: false, error: 'No download URL returned' };
    }

    // Download to temp file
    const tempFile = new ExpoFile(Paths.cache, `surfvault_${photoId}_${Date.now()}.jpg`);
    const download = await downloadAsync(presignedUrl, tempFile.uri);

    if (download.status !== 200) {
      return { success: false, error: `Download failed (${download.status})` };
    }

    // Save to camera roll
    await MediaLibrary.saveToLibraryAsync(download.uri);

    // Clean up temp file
    try { tempFile.delete(); } catch {}

    return { success: true };
  } catch (error: any) {
    console.error('savePhotoToCameraRoll error:', error);
    return { success: false, error: error.message ?? 'Unknown error' };
  }
}

/**
 * Save multiple photos to the camera roll sequentially.
 * Calls onProgress after each photo completes.
 */
export async function savePhotosToCameraRoll(
  photoIds: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<{ saved: number; failed: number; errors: string[] }> {
  const hasPermission = await ensurePermissions();
  if (!hasPermission) {
    return { saved: 0, failed: photoIds.length, errors: ['Photo library permission denied'] };
  }

  let saved = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < photoIds.length; i++) {
    const result = await savePhotoToCameraRoll(photoIds[i]);
    if (result.success) {
      saved++;
    } else {
      failed++;
      if (result.error) errors.push(result.error);
    }
    onProgress?.(i + 1, photoIds.length);
  }

  return { saved, failed, errors };
}
