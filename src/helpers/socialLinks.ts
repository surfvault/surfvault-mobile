// Normalize a user-entered YouTube value into a valid URL. Users paste all sorts
// of things — a full channel URL, a handle, "@handle", or a bare channel id — so
// we never blindly prepend "youtube.com/@" (which turned a pasted URL into
// youtube.com/@https://…). Mirror of web src/helpers/socialLinks.js.
export function youtubeUrl(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  // Already a full URL → use as-is.
  if (/^https?:\/\//i.test(s)) return s;
  // youtube.com/… or youtu.be/… missing only the scheme.
  if (/^(www\.)?youtube\.com\//i.test(s) || /^youtu\.be\//i.test(s)) return `https://${s}`;
  const handle = s.replace(/^@/, '');
  // Channel id (UC + 22 chars).
  if (/^UC[A-Za-z0-9_-]{22}$/.test(handle)) return `https://www.youtube.com/channel/${handle}`;
  // Otherwise treat it as a handle.
  return `https://www.youtube.com/@${handle}`;
}
