import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { savePhotoToCameraRoll, checkMediaLibraryPermission } from '../helpers/saveToPhotos';

/**
 * Global "Save to camera roll" queue. Mirrors UploadContext: a screen-independent
 * download→save loop with a floating pill (SaveProgressPill) and a completion
 * notification, so the user can leave the originating page while it runs instead
 * of staring at a spinner.
 *
 * Tier-2 note: the per-file transfer engine lives in
 * `saveToPhotos.savePhotoToCameraRoll` (in-process while foregrounded). To add
 * true background saving (app backgrounded/closed) later, swap ONLY that
 * function's download half for a background URLSession — this queue, the pill,
 * and the notification stay exactly as-is.
 */
interface SaveState {
  total: number;
  completed: number;
  failed: number;
  isSaving: boolean;
  /** 0–1 byte progress of the file currently downloading. */
  fileFraction: number;
}

interface SaveContextType {
  save: SaveState | null;
  startSave: (photoIds: string[]) => Promise<void>;
  cancelSave: () => void;
}

const SaveContext = createContext<SaveContextType>({
  save: null,
  startSave: async () => {},
  cancelSave: () => {},
});

export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [save, setSave] = useState<SaveState | null>(null);
  const savingRef = useRef(false);
  const cancelledRef = useRef(false);

  const startSave = useCallback(async (photoIds: string[]) => {
    if (savingRef.current) {
      Alert.alert('Save in Progress', 'Please wait for the current save to finish.');
      return;
    }
    const ids = (photoIds ?? []).filter(Boolean);
    if (!ids.length) return;

    // Resolve permission up front so the user isn't surprised mid-queue.
    const granted = await checkMediaLibraryPermission();
    if (!granted) {
      Alert.alert('Permission needed', 'Allow photo library access to save to your camera roll.');
      return;
    }

    cancelledRef.current = false;
    savingRef.current = true;
    setSave({ total: ids.length, completed: 0, failed: 0, isSaving: true, fileFraction: 0 });

    // Run the queue async (non-blocking) so the caller's screen is free immediately.
    (async () => {
      let completed = 0;
      let failed = 0;

      for (const id of ids) {
        if (cancelledRef.current) break;
        const result = await savePhotoToCameraRoll(id, (f) => {
          setSave((prev) => (prev ? { ...prev, fileFraction: f } : prev));
        });
        if (result.success) completed += 1;
        else failed += 1;
        setSave((prev) => (prev ? { ...prev, completed, failed, fileFraction: 0 } : prev));
      }

      savingRef.current = false;

      if (cancelledRef.current) {
        setSave(null);
        return;
      }

      setSave((prev) => (prev ? { ...prev, isSaving: false } : prev));

      // Local notification so they don't have to babysit the pill.
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: failed === 0 ? 'Saved to camera roll' : 'Save finished',
            body:
              failed === 0
                ? `${completed} item${completed === 1 ? '' : 's'} saved to your camera roll.`
                : `${completed} saved, ${failed} failed.`,
          },
          trigger: null,
        });
      } catch {
        /* notifications may be denied — the pill still shows the result */
      }

      // Auto-dismiss the pill shortly after completion.
      setTimeout(() => setSave(null), 4000);
    })();
  }, []);

  const cancelSave = useCallback(() => {
    Alert.alert('Cancel Save', 'Items already saved will be kept. Stop saving the rest?', [
      { text: 'Keep Saving', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: () => { cancelledRef.current = true; } },
    ]);
  }, []);

  return (
    <SaveContext.Provider value={{ save, startSave, cancelSave }}>
      {children}
    </SaveContext.Provider>
  );
}

export const useSave = () => useContext(SaveContext);
