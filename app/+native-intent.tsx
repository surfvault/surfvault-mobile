// Translates incoming Universal Link / App Link URLs (from app.surf-vault.com
// and share.surf-vault.com) into in-app Expo Router paths. Runs natively before
// the router mounts, so a tapped web link lands on the matching screen.
//
// Web URL shapes (see surfvault-web App.js) and their app-route targets:
//   /s/:sessionId            -> /session/:sessionId
//   /access/:requestId       -> /access/:requestId
//   /:handle/boards/:boardId -> /board/:boardId
//   /:country/:region/:break -> /break/:country/:region/:break
//   /:handle                 -> /user/:handle   (unless a reserved word)
// Anything else (web-only pages with no app equivalent) falls back to the
// home tab rather than dead-ending on an unmatched route.

// Single-segment web paths that are real pages, NOT user handles. Mirrors the
// fixed routes declared before `/:handle` in the web router so we resolve the
// handle-vs-reserved-word ambiguity the same way the web app does.
const RESERVED_FIRST_SEGMENTS = new Set([
  's',
  'access',
  'board',
  'session',
  'user',
  'break',
  'conversation',
  'discover',
  'map',
  'surf-breaks',
  'surf-photographers',
  'plans',
  'reports',
  'admin',
  'messages',
  'notifications',
  'favorites',
  'manage-accounts',
  'upload',
  'campaigns',
  'wave-of-the-day',
  'download',
  'verify-email-change',
]);

const HOME = '/(tabs)';

// Pull the pathname out of either a full URL or a leading-slash path, without
// relying on the global `URL` (incomplete under Hermes).
function extractPathname(raw: string): string {
  let s = raw;
  const schemeIdx = s.indexOf('://');
  if (schemeIdx !== -1) {
    const afterHost = s.slice(schemeIdx + 3);
    const slashIdx = afterHost.indexOf('/');
    s = slashIdx === -1 ? '/' : afterHost.slice(slashIdx);
  }
  // Drop query string and fragment.
  s = s.split('?')[0].split('#')[0];
  return s;
}

function toAppPath(rawPath: string): string {
  const pathname = extractPathname(rawPath);

  const segs = pathname
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  if (segs.length === 0) return HOME;

  // /s/:sessionId  (also the share.surf-vault.com short link)
  if (segs[0] === 's' && segs[1]) return `/session/${segs[1]}`;

  // /access/:requestId  (same shape on web and app)
  if (segs[0] === 'access' && segs[1]) return `/access/${segs[1]}`;

  // /:handle/boards/:boardId
  if (segs.length === 3 && segs[1] === 'boards') return `/board/${segs[2]}`;

  // /:country/:region/:surfBreak
  if (segs.length === 3) return `/break/${segs[0]}/${segs[1]}/${segs[2]}`;

  // /:handle  (only when not a reserved fixed route)
  if (segs.length === 1 && !RESERVED_FIRST_SEGMENTS.has(segs[0])) {
    return `/user/${segs[0]}`;
  }

  return HOME;
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return toAppPath(path);
}
