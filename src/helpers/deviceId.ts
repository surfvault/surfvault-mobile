import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Stable per-install identifier used to key user_devices rows on the server.
// Generated once on first launch and persisted in expo-secure-store so it
// survives logout, account switching, and account unlink. A new id is minted
// only on uninstall+reinstall — which is the desired behavior, since the old
// install's push token will never be valid again anyway.
//
// Not a security primitive — it's an opaque label the server uses to dedup
// rows in user_devices. UUIDv4 generated with Math.random is sufficient for
// collision avoidance across the user base.
const DEVICE_ID_KEY = 'surfvault.device_id';

let cached: string | null = null;

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }
  const fresh = uuidv4();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
  cached = fresh;
  return fresh;
}

export function getDevicePlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}
