// Legacy FS API: createDownloadResumable gives a per-file byte-progress
// callback (the new File API does not), which the global save queue uses to
// show a live % for big clips.
import * as LegacyFS from 'expo-file-system/legacy';
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
 * Check (and prompt if needed) for media library permission.
 * Call before entering photo selection mode so users don't
 * select photos only to be denied at save time.
 */
export async function checkMediaLibraryPermission(): Promise<boolean> {
  return ensurePermissions();
}

/**
 * Save a single photo (original quality) to the device's camera roll.
 *
 * 1. Fetches a presigned URL for the original from the API
 * 2. Downloads to a temp file
 * 3. Saves to the camera roll via MediaLibrary
 * 4. Cleans up the temp file
 */
export async function savePhotoToCameraRoll(
  photoId: string,
  onProgress?: (fraction: number) => void,
): Promise<{ success: boolean; error?: string }> {
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

    // The temp file MUST carry the real extension — iOS MediaLibrary infers
    // photo vs video from it, so saving a clip's mp4 bytes as ".jpg" fails with
    // "Couldn't open file". Prefer the backend-provided filename (normalized,
    // handles legacy ".quicktime"); fall back to the S3 key's extension, then jpg.
    const extFrom = (name?: string): string | null => {
      if (!name || !name.includes('.')) return null;
      const e = name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '');
      return e || null;
    };
    const ext =
      extFrom(data.results?.fileName) ||
      extFrom(presignedUrl.split('?')[0]) ||
      'jpg';

    // Download to a temp file with byte progress. (This is the Tier-1 transfer
    // engine — in-process while the app is foreground. To add true background
    // saving later, swap ONLY this download half for a background URLSession
    // (react-native-background-downloader); the queue/pill/notification stay.)
    const fileUri = `${LegacyFS.cacheDirectory}surfvault_${photoId}_${Date.now()}.${ext}`;
    const dl = LegacyFS.createDownloadResumable(presignedUrl, fileUri, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    });
    const downloaded = await dl.downloadAsync();

    if (!downloaded?.uri) {
      return { success: false, error: 'Download failed' };
    }

    // Save to camera roll. saveToLibraryAsync works for photos but can fail for
    // videos on iOS ("This video couldn't be saved to the Camera Roll album").
    // createAssetAsync (needs full library access, which we request) is more
    // reliable for video — fall back to it when the simple save throws.
    try {
      await MediaLibrary.saveToLibraryAsync(downloaded.uri);
    } catch {
      await MediaLibrary.createAssetAsync(downloaded.uri);
    }

    // Clean up temp file
    try { await LegacyFS.deleteAsync(downloaded.uri, { idempotent: true }); } catch {}

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
