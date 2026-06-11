import Constants from 'expo-constants';

// Same base URL customBaseQuery uses. We fetch directly here (rather than via
// RTK Query) because these counts are for INACTIVE accounts — each request is
// authenticated with that account's own bearer, not the active session's.
const apiBaseUrl =
  Constants.expoConfig?.extra?.apiBaseUrl ?? 'https://dev-api.surf-vault.com';

export interface AccountBadge {
  messages: number;
  notifications: number;
}

/**
 * Best-effort unread counts (messages + notifications) for a single account,
 * given a valid access token. Network/parse failures resolve to zeros so a
 * flaky account never breaks the switcher.
 */
export async function fetchAccountBadge(accessToken: string): Promise<AccountBadge> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const get = (path: string) =>
    fetch(`${apiBaseUrl}${path}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  const [msg, notif] = await Promise.all([
    get('/conversations-unread'),
    // limit must be > 0 — the backend does `limit ? Number(limit) : 25`, so
    // limit=0 → SQL LIMIT 0 → an empty array → the notification count was
    // always 0. Fetch a small page of unread and count it.
    get('/notifications?read=false&filter=&limit=20&continuationToken='),
  ]);

  return {
    messages:
      Number(msg?.results?.unreadCount ?? msg?.results?.totalUnreadMessages ?? 0) || 0,
    notifications:
      notif?.results?.unreadCount ?? notif?.results?.notifications?.length ?? 0,
  };
}
