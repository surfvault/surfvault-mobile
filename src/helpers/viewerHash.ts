import * as SecureStore from 'expo-secure-store';
import { generateUUID } from './uuid';

const ANON_KEY = 'sv_anon_id';

let cachedAnonId: string | null = null;

/**
 * Returns a stable viewer hash for session-view tracking.
 * - Logged-in users: their user ID
 * - Guests: a persistent random UUID stored in SecureStore
 */
export async function getViewerHash(userId?: string | null): Promise<string> {
  if (userId) return userId;
  if (cachedAnonId) return cachedAnonId;

  const existing = await SecureStore.getItemAsync(ANON_KEY);
  if (existing) {
    cachedAnonId = existing;
    return existing;
  }

  const fresh = generateUUID();
  await SecureStore.setItemAsync(ANON_KEY, fresh);
  cachedAnonId = fresh;
  return fresh;
}
