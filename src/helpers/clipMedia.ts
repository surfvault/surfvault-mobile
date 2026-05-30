// Shared client-side video-clip caps (mobile). Mirror surfvault-api/shared/media.ts.
// The picker is the PRIMARY gate; the backend is the safety net. Used by ad
// campaigns + shaper boards (and future surf sessions).

export const MAX_CLIP_SECONDS = 120;
export const MAX_CLIP_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_CLIP_GB = +(MAX_CLIP_BYTES / 1024 ** 3).toFixed(1);
