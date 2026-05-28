import { useMemo } from 'react';
import { useUser } from '../context/UserProvider';

export type DistanceUnit = 'mi' | 'km';
export type ThemePref = 'system' | 'light' | 'dark';
// Where auto-granted downloads go when a surfer taps "Download" on a
// photographer's auto-grant session. 'ask' shows the destination picker.
// Only applies to the auto-grant flow — regular access requests have explicit
// Save-to-Vault / Save-to-Photos buttons instead.
export type AutoGrantDownloadDestination = 'vault' | 'camera_roll' | 'both' | 'ask';
const DOWNLOAD_DESTINATIONS: AutoGrantDownloadDestination[] = ['vault', 'camera_roll', 'both', 'ask'];

/**
 * Coerce a stored destination value, migrating the legacy boolean
 * `autoSaveApprovedToVault` (true → 'vault') and defaulting to 'ask'.
 */
function coerceDownloadDestination(raw: any): AutoGrantDownloadDestination {
  if (DOWNLOAD_DESTINATIONS.includes(raw?.autoGrantDownloadDestination)) {
    return raw.autoGrantDownloadDestination;
  }
  if (raw?.autoSaveApprovedToVault === true) return 'vault';
  return 'ask';
}

export interface NotificationPreferences {
  followers: boolean;
  favorites: boolean;
  tagged: boolean;
  messages: boolean;
}

export interface UserPreferences {
  units: DistanceUnit;
  theme: ThemePref;
  language: string;
  // Surfer-owned: default destination for auto-granted downloads.
  autoGrantDownloadDestination: AutoGrantDownloadDestination;
  // Photographer-owned: when true, surfers download originals from this
  // photographer's sessions without a manual access-request approval step.
  autoGrantMediaAccess: boolean;
  nearby: { breaksKm: number; photographersKm: number };
  notifications: NotificationPreferences;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  units: 'mi',
  theme: 'system',
  language: 'en',
  autoGrantDownloadDestination: 'ask',
  autoGrantMediaAccess: false,
  // Stored in km but chosen to be round in the default unit (miles):
  // 161 km ≈ 100 mi, 80 km ≈ 50 mi — so the default lands on a preset chip.
  nearby: { breaksKm: 161, photographersKm: 80 },
  notifications: { followers: true, favorites: true, tagged: true, messages: true },
};

// Client-side clamp bounds mirror the API (user/handler.ts + map/handler.ts).
export const NEARBY_BREAKS_MIN_KM = 10;
export const NEARBY_BREAKS_MAX_KM = 500;
export const NEARBY_PHOTOGRAPHERS_MIN_KM = 10;
export const NEARBY_PHOTOGRAPHERS_MAX_KM = 300;

const KM_PER_MILE = 1.60934;

/**
 * Coerce a possibly-partial/legacy stored preferences blob into a full, typed
 * object. Defensive against missing keys so older accounts (or a stale OTA
 * client) never read `undefined`.
 */
export function normalizePreferences(raw: any): UserPreferences {
  const r = raw && typeof raw === 'object' ? raw : {};
  const nearby = r.nearby && typeof r.nearby === 'object' ? r.nearby : {};
  const notif = r.notifications && typeof r.notifications === 'object' ? r.notifications : {};
  return {
    units: r.units === 'km' ? 'km' : 'mi',
    theme: r.theme === 'light' || r.theme === 'dark' ? r.theme : 'system',
    language: typeof r.language === 'string' ? r.language : 'en',
    autoGrantDownloadDestination: coerceDownloadDestination(r),
    autoGrantMediaAccess: r.autoGrantMediaAccess === true,
    nearby: {
      breaksKm: Number.isFinite(nearby.breaksKm) ? nearby.breaksKm : DEFAULT_PREFERENCES.nearby.breaksKm,
      photographersKm: Number.isFinite(nearby.photographersKm)
        ? nearby.photographersKm
        : DEFAULT_PREFERENCES.nearby.photographersKm,
    },
    notifications: {
      followers: notif.followers !== false,
      favorites: notif.favorites !== false,
      tagged: notif.tagged !== false,
      messages: notif.messages !== false,
    },
  };
}

export type PreferencesPatch = {
  units?: DistanceUnit;
  theme?: ThemePref;
  language?: string;
  autoGrantDownloadDestination?: AutoGrantDownloadDestination;
  autoGrantMediaAccess?: boolean;
  nearby?: Partial<UserPreferences['nearby']>;
  notifications?: Partial<NotificationPreferences>;
};

/**
 * Deep-merge a partial patch into a full preferences object. Used for the
 * optimistic cache update so the UI reflects a toggle before the round-trip.
 */
export function mergePreferences(current: any, patch: PreferencesPatch): UserPreferences {
  const base = normalizePreferences(current);
  const p = patch ?? {};
  return {
    units: p.units ?? base.units,
    theme: p.theme ?? base.theme,
    language: p.language ?? base.language,
    autoGrantDownloadDestination:
      p.autoGrantDownloadDestination && DOWNLOAD_DESTINATIONS.includes(p.autoGrantDownloadDestination)
        ? p.autoGrantDownloadDestination
        : base.autoGrantDownloadDestination,
    autoGrantMediaAccess:
      typeof p.autoGrantMediaAccess === 'boolean' ? p.autoGrantMediaAccess : base.autoGrantMediaAccess,
    nearby: { ...base.nearby, ...(p.nearby ?? {}) },
    notifications: { ...base.notifications, ...(p.notifications ?? {}) },
  };
}

/** Convert a kilometre distance to the user's chosen unit. */
export function kmToUnit(km: number, unit: DistanceUnit): number {
  return unit === 'mi' ? km / KM_PER_MILE : km;
}

/** Convert a value entered/stored in the user's unit back to kilometres. */
export function unitToKm(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? value * KM_PER_MILE : value;
}

/**
 * Format a kilometre distance for display in the user's unit. Sub-1-unit
 * distances render in metres/feet so "0 km" never shows for a close result.
 */
export function formatDistance(km: number, unit: DistanceUnit): string {
  if (!Number.isFinite(km) || km < 0) return '';
  const value = kmToUnit(km, unit);
  if (value >= 1) return `${Math.round(value)}${unit}`;
  if (unit === 'mi') {
    const feet = km * 3280.84;
    return `${Math.round(feet)}ft`;
  }
  return `${Math.round(km * 1000)}m`;
}

/** Read the active user's normalized preferences (defaults when logged out). */
export function useUserPreferences(): UserPreferences {
  const { user } = useUser();
  return useMemo(() => normalizePreferences((user as any)?.preferences), [user]);
}
