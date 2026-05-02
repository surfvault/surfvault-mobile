import Constants from 'expo-constants';

// Direct Auth0 /oauth/token call using a stored refresh token.
//
// Why we don't use react-native-auth0's getCredentials():
//   - The library binds to a single Keychain entry — only one Auth0 session
//     can be "current" at a time. Multi-account switching needs to pull a
//     fresh access token for an account that ISN'T currently in the
//     library's slot.
//   - Hitting /oauth/token directly with the per-account refresh token (we
//     stash these in expo-secure-store via LinkedAccountsContext) sidesteps
//     the limitation cleanly. Keychain-backed secure-store is the right place
//     for refresh tokens on mobile — same threat model the lib uses.
//
// Refresh-token rotation is enabled in the Auth0 tenant config, so the
// response usually carries a NEW refresh_token. Caller MUST persist whatever
// is returned to keep the chain alive.
export interface Auth0RefreshResult {
  accessToken: string;
  refreshToken: string;   // may be the same as the input if rotation is off
  expiresAt: number;      // epoch ms
}

export async function refreshAccessToken(refreshToken: string): Promise<Auth0RefreshResult | null> {
  const auth0Domain: string = Constants.expoConfig?.extra?.auth0Domain ?? '';
  const auth0ClientId: string = Constants.expoConfig?.extra?.auth0ClientId ?? '';
  if (!auth0Domain || !auth0ClientId || !refreshToken) return null;

  try {
    const res = await fetch(`https://${auth0Domain}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: auth0ClientId,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      // 403 invalid_grant => the refresh token has been revoked / expired.
      // Caller surfaces this as a re-auth badge in the switcher.
      console.warn('Auth0 refresh failed', res.status);
      return null;
    }
    const json = await res.json();
    if (!json.access_token) return null;
    return {
      accessToken: json.access_token,
      // Rotation may not return a new one; reuse the previous in that case.
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: Date.now() + (json.expires_in ?? 0) * 1000,
    };
  } catch (e) {
    console.warn('Auth0 refresh threw:', e);
    return null;
  }
}
