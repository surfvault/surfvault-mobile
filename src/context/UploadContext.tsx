import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Alert } from 'react-native';
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
    });

    // Run upload loop async (non-blocking)
    (async () => {
      let completed = 0;

      for (const file of files) {
        if (cancelledRef.current) break;

        try {
          // Upload to S3
          const response = await fetch(file.uri);
          const blob = await response.blob();

          await fetch(file.presignedUrl, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': file.type },
          });

          // Finalize immediately after upload
          await finalize(uploadId, [file.uploadFileId]);

          completed++;
          setUpload((prev) =>
            prev ? { ...prev, completed } : null
          );
        } catch (error) {
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
