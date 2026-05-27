import { Alert, Linking } from 'react-native';
import { adPlansUrl } from './adTiers';

type StorageUser = { current_storage?: number | string | null; storage_limit?: number | string | null } | null | undefined;

export type StorageCheckResult = {
  hasSpace: boolean;
  totalSizeGB: number;
  currentGB: number;
  limitGB: number;
  remainingGB: number;
};

/**
 * Check whether the user has enough storage for an upload.
 * Sizes are compared in GB (matches how current_storage / storage_limit are stored).
 */
export function checkStorageCapacity(user: StorageUser, totalBytes: number): StorageCheckResult {
  const totalSizeGB = totalBytes / (1024 * 1024 * 1024);
  const currentGB = Number(user?.current_storage ?? 0);
  const limitGB = Number(user?.storage_limit ?? 15);
  const remainingGB = Math.max(0, limitGB - currentGB);
  const hasSpace = totalSizeGB + currentGB <= limitGB;
  return { hasSpace, totalSizeGB, currentGB, limitGB, remainingGB };
}

const formatGB = (gb: number): string => (gb < 0.01 ? '0 MB' : gb < 1 ? `${(gb * 1024).toFixed(0)} MB` : `${gb.toFixed(2)} GB`);

/**
 * Show a storage-limit alert with a "Manage plan" CTA that opens the web
 * checkout handoff (storage plans are managed on the web — billing strategy).
 * Pass the user's email for login pre-fill on the handoff.
 */
export function showStorageLimitAlert(check: StorageCheckResult, opts?: { email?: string | null }) {
  const needed = formatGB(check.totalSizeGB);
  const remaining = formatGB(check.remainingGB);
  Alert.alert(
    'Storage Full',
    `This upload needs ${needed}, but you only have ${remaining} remaining. Free up space by deleting photos, or upgrade your storage plan.`,
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Manage plan',
        onPress: () => { Linking.openURL(adPlansUrl(opts?.email)).catch(() => {}); },
      },
    ],
  );
}
