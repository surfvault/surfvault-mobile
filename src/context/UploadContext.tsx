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

    await fetch(`${API_BASE_URL}/media/upload/${uploadId}/finalize`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uploadFileIds }),
    });
  }, []);

  const complete = useCallback(async (uploadId: string) => {
    const token = await getAuthToken();
    if (!token) return;

    await fetch(`${API_BASE_URL}/media/upload/${uploadId}/complete`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
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
      isUploading: true,
      error: null,
      bytesProgress: 0,
      etaMs: null,
    });

    // Run upload loop async (non-blocking)
    (async () => {
      let completed = 0;

      for (const file of files) {
        if (cancelledRef.current) break;

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
                prev ? { ...prev, bytesProgress: (completed + frac) / files.length, etaMs } : null
              );
            }
          );
          currentTaskRef.current = task;
          const result = await task.uploadAsync();
          currentTaskRef.current = null;
          if (!result || result.status < 200 || result.status >= 300) {
            throw new Error(`Upload failed: HTTP ${result?.status ?? 'no response'}`);
          }

          // Finalize immediately after upload
          await finalize(uploadId, [file.uploadFileId]);

          completed++;
          setUpload((prev) =>
            prev ? { ...prev, completed, bytesProgress: completed / files.length, etaMs: null } : null
          );
        } catch (error) {
          currentTaskRef.current = null;
          console.error(`Upload failed for ${file.name}:`, error);
          // Continue to next file on error
        }
      }

      // Complete the upload session
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
