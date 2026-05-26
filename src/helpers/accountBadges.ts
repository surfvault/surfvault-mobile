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
    // limit=0 → backend returns just the unread set; we count its length, the
    // same signal the tab-bar bell badge uses.
    get('/notifications?read=false&filter=&limit=0&continuationToken='),
  ]);

  return {
    messages:
      Number(msg?.results?.unreadCount ?? msg?.results?.totalUnreadMessages ?? 0) || 0,
    notifications: notif?.results?.notifications?.length ?? 0,
  };
}
