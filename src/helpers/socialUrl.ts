/**
 * Pull the handle out of an Instagram URL so we can render it as `@handle`
 * the same way user profiles do. Returns null if the URL isn't IG.
 */
export function extractInstagramHandle(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    const path = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return null;
    const handle = path.split('/')[0];
    return handle ? handle.replace(/^@/, '') : null;
  } catch {
    return null;
  }
}

/** Normalize a website URL by prefixing https:// when missing. */
export function normalizeWebsite(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}
