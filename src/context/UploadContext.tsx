import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Alert } from 'react-native';
// Legacy FS API exposes createUploadTask, which streams a file from disk to S3
// (no loading a 2GB clip into a JS blob) AND reports byte progress.
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { getAuthToken } from '../store/apis/customBaseQuery';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl ?? '';

interface UploadFile {
  name: string;
  uri: string;
  type: string;
  uploadFileId: string;
  presignedUrl: string;
}

interface UploadState {
  uploadId: string;
  sessionName: string;
  completed: number;
  total: number;
  // Files that exhausted their retries — surfaced so a partial upload isn't
  // silently incomplete (F1/F2).
  failed: number;
  isUploading: boolean;
  error: string | null;
  // Smoothed 0–1 progress (finished files + the in-flight file's byte fraction)
  // and a live ETA in ms. Lets the pill show a real % + countdown for a single
  // large clip instead of sitting at 0/1 the whole time.
  bytesProgress?: number;
  etaMs?: number | null;
}

interface UploadContextType {
  upload: UploadState | null;
  startUpload: (params: {
    uploadId: string;
    sessionName: string;
    files: UploadFile[];
  }) => void;
  cancelUpload: () => void;
}

const UploadContext = createContext<UploadContextType>({
  upload: null,
  startUpload: () => {},
  cancelUpload: () => {},
});

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [upload, setUpload] = useState<UploadState | null>(null);
  const cancelledRef = useRef(false);
  const uploadingRef = useRef(false);
  const currentTaskRef = useRef<LegacyFileSystem.UploadTask | null>(null);

  const finalize = useCallback(async (uploadId: string, uploadFileIds: string[]) => {
    const token = await getAuthToken();
    if (!token || uploadFileIds.length === 0) return;

    const res = await fetch(`${API_BASE_URL}/media/upload/${uploadId}/finalize`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uploadFileIds }),
    });
    // fetch only rejects on network errors, NOT on 4xx/5xx. Without this check
    // a failed finalize left the file on S3 but unrecorded + uncounted while
    // the UI showed success (F2). Throw so the caller's retry kicks in.
    if (!res.ok) throw new Error(`finalize failed: HTTP ${res.status}`);
  }, []);

  const complete = useCallback(async (uploadId: string) => {
    const token = await getAuthToken();
    if (!token) return;

    const res = await fetch(`${API_BASE_URL}/media/upload/${uploadId}/complete`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`complete failed: HTTP ${res.status}`);
  }, []);

  const startUpload = useCallback(({ uploadId, sessionName, files }: {
    uploadId: string;
    sessionName: string;
    files: UploadFile[];
  }) => {
    if (uploadingRef.current) {
      Alert.alert('Upload in Progress', 'Please wait for the current upload to finish.');
      return;
    }

    cancelledRef.current = false;
    uploadingRef.current = true;

    setUpload({
      uploadId,
      sessionName,
      completed: 0,
      total: files.length,
      failed: 0,
      isUploading: true,
      error: null,
      bytesProgress: 0,
      etaMs: null,
    });

    // Each file's PUT+finalize is retried up to this many times (with backoff)
    // before it's counted as a terminal failure. Was 0 — a transient blip
    // silently dropped the photo with no retry and no surfaced error (F1/F2).
    const MAX_ATTEMPTS = 3;

    // Run upload loop async (non-blocking)
    (async () => {
      let completed = 0;
      let failed = 0;

      for (const file of files) {
        if (cancelledRef.current) break;

        let ok = false;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS && !cancelledRef.current; attempt++) {
          try {
            // Stream the file straight from disk to S3 (no 2GB JS blob) and
            // report byte progress so the pill can show a live % + ETA.
            const startedAt = Date.now();
            const task = LegacyFileSystem.createUploadTask(
              file.presignedUrl,
              file.uri,
              {
                httpMethod: 'PUT',
                uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
                headers: { 'Content-Type': file.type },
              },
              ({ totalBytesSent, totalBytesExpectedToSend }) => {
                if (totalBytesExpectedToSend <= 0) return;
                const frac = totalBytesSent / totalBytesExpectedToSend;
                const elapsed = Date.now() - startedAt;
                let etaMs: number | null = null;
                if (totalBytesSent > 0 && elapsed > 750 && totalBytesSent < totalBytesExpectedToSend) {
                  etaMs = (totalBytesExpectedToSend - totalBytesSent) / (totalBytesSent / elapsed);
                }
                setUpload((prev) =>
                  prev ? { ...prev, bytesProgress: (completed + failed + frac) / files.length, etaMs } : null
                );
              }
            );
            currentTaskRef.current = task;
            const result = await task.uploadAsync();
            currentTaskRef.current = null;
            if (!result || result.status < 200 || result.status >= 300) {
              throw new Error(`Upload failed: HTTP ${result?.status ?? 'no response'}`);
            }

            // Finalize immediately after upload (throws on non-2xx now)
            await finalize(uploadId, [file.uploadFileId]);
            ok = true;
            break;
          } catch (error) {
            currentTaskRef.current = null;
            if (cancelledRef.current) break;
            if (attempt < MAX_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
            } else {
              console.error(`Upload failed for ${file.name} after ${MAX_ATTEMPTS} attempts:`, error);
            }
          }
        }

        if (ok) {
          completed++;
        } else if (!cancelledRef.current) {
          failed++;
        }
        setUpload((prev) =>
          prev
            ? { ...prev, completed, failed, bytesProgress: (completed + failed) / files.length, etaMs: null }
            : null
        );
      }

      // Complete the upload session (best-effort — photos are already finalized
      // + counted; a failed complete only misses the status flip + notification)
      try {
        await complete(uploadId);
      } catch (error) {
        console.error('Failed to complete upload:', error);
      }

      uploadingRef.current = false;

      if (cancelledRef.current) {
        setUpload(null);
      } else {
        setUpload((prev) =>
          prev ? { ...prev, isUploading: false } : null
        );
        // Auto-dismiss after 3 seconds
        setTimeout(() => setUpload(null), 3000);
      }
    })();
  }, [finalize, complete]);

  const cancelUpload = useCallback(() => {
    Alert.alert(
      'Cancel Upload',
      'Photos already uploaded will be kept. Stop uploading remaining photos?',
      [
        { text: 'Keep Uploading', style: 'cancel' },
        {
          text: 'Stop Upload',
          style: 'destructive',
          onPress: () => {
            cancelledRef.current = true;
            // Abort the in-flight transfer too, so a single large clip stops
            // immediately instead of finishing before the between-files check.
            currentTaskRef.current?.cancelAsync?.().catch(() => { /* ignore */ });
            currentTaskRef.current = null;
          },
        },
      ]
    );
  }, []);

  return (
    <UploadContext.Provider value={{ upload, startUpload, cancelUpload }}>
      {children}
    </UploadContext.Provider>
  );
}

export const useUpload = () => useContext(UploadContext);
