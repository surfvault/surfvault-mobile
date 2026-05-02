import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth0 } from 'react-native-auth0';
import Constants from 'expo-constants';
import { setTokenRefresher, getAuthToken } from '../store/apis/customBaseQuery';
import { useLinkedAccounts, AccountSession } from './LinkedAccountsContext';
import { refreshAccessToken } from '../helpers/auth0Refresh';
import { getOrCreateDeviceId } from '../helpers/deviceId';

// AuthProvider preserves the `useAuth()` shape the rest of the app already
// consumes ({ isAuthenticated, isLoading, login, logout, token }) while
// delegating the actual session state to LinkedAccountsContext. The split:
//
//   - LinkedAccountsContext owns the *list* of signed-in profiles + which is
//     active. It also owns the bearer token customBaseQuery reads.
//   - AuthProvider owns the bridge to react-native-auth0 (the only thing
//     that can pop the OS WebAuthSession to authorize a brand-new account)
//     and the lifecycle wiring (initial hydrate, 401 refresher, logout cleanup).
//
// `login()` here always means "run Auth0 authorize and add the resulting
// account to the linked set" — works for both first sign-in and subsequent
// add-account from Manage Accounts. The Manage Accounts page wraps it with
// the extra `/user/linked-accounts` POST that records the affiliation.

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * Run Auth0 authorize, then push the new credentials into LinkedAccountsContext.
   * The new account becomes active. Resolves to the new userId on success.
   */
  login: () => Promise<string | null>;
  /**
   * Sign out of the *active* account only. Other linked accounts on this
   * device stay registered and reachable via the switcher. When the last
   * account is removed, also clears the underlying Auth0 Keychain entry so
   * the next authorize() forces a fresh login.
   */
  logout: () => Promise<void>;
  token: string | null;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  login: async () => null,
  logout: async () => {},
  token: null,
});

async function fetchSelfWithToken(accessToken: string): Promise<{
  id: string;
  handle: string | null;
  name: string | null;
  picture: string | null;
  user_type: 'surfer' | 'photographer' | 'shaper' | null;
  email: string | null;
} | null> {
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl ?? '';
  try {
    const res = await fetch(`${apiBaseUrl}/user/self`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const user = json?.results?.user ?? json?.results;
    if (!user?.id) return null;
    return {
      id: user.id,
      handle: user.handle ?? null,
      name: user.name ?? null,
      picture: user.picture ?? null,
      user_type: user.user_type ?? null,
      email: user.email ?? null,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    authorize,
    clearCredentials,
    getCredentials,
    isLoading: auth0Loading,
  } = useAuth0();

  const linked = useLinkedAccounts();
  const [bootstrapping, setBootstrapping] = useState(true);
  // Bootstrap must run exactly once. switchTo()/addAccount() inside it toggle
  // `linked.busy`, which would otherwise re-fire this effect and infinite-loop
  // (and keep the splash up forever).
  const bootstrapRan = useRef(false);
  // Latest activeUserId — closures in tokenRefresher need a non-stale read.
  const activeUserIdRef = useRef<string | null>(null);
  activeUserIdRef.current = linked.activeUserId;
  const accountsRef = useRef<AccountSession[]>([]);
  accountsRef.current = linked.accounts;

  // -------------------- INITIAL BOOTSTRAP --------------------
  // Three cases:
  //   (a) LinkedAccountsContext already has an active account → switchTo() it
  //       so its bearer token is fresh and customBaseQuery is populated.
  //   (b) Empty context BUT react-native-auth0 has a saved session (existing
  //       single-account user upgrading to a multi-account build) → migrate:
  //       getCredentials → fetch self → addAccount.
  //   (c) Empty context AND no Auth0 session → fully signed-out, do nothing.
  useEffect(() => {
    if (auth0Loading || linked.busy) return;
    if (bootstrapRan.current) return;
    bootstrapRan.current = true;
    // No cancelled guard here. switchTo()/addAccount() inside the IIFE flip
    // linked.busy mid-flight, which would re-fire this effect — bootstrapRan
    // makes that re-fire a no-op (early return), but a cleanup-driven
    // cancelled flag would also prevent setBootstrapping(false) from ever
    // settling, leaving the splash on top of the content forever.
    (async () => {
      try {
        if (linked.activeUserId) {
          // (a) Promote the persisted active account: refreshes token + writes
          //     to auth_token slot.
          await linked.switchTo(linked.activeUserId);
          return;
        }
        if (linked.accounts.length === 0) {
          // (b/c) Try to inherit an existing single-session login.
          try {
            const creds = await getCredentials();
            if (creds?.accessToken && creds?.refreshToken) {
              const profile = await fetchSelfWithToken(creds.accessToken);
              if (profile) {
                await linked.addAccount(
                  {
                    accessToken: creds.accessToken,
                    refreshToken: creds.refreshToken,
                    expiresAt: creds.expiresAt
                      ? new Date(creds.expiresAt).getTime()
                      : Date.now() + 3600_000,
                  },
                  {
                    userId: profile.id,
                    handle: profile.handle,
                    name: profile.name,
                    picture: profile.picture,
                    userType: profile.user_type,
                    email: profile.email,
                  }
                );
              }
            }
          } catch {
            // No saved session — that's case (c), nothing to do.
          }
        }
      } finally {
        setBootstrapping(false);
      }
    })();
    // We deliberately depend only on the loading flags. Re-running on every
    // accounts change would create a feedback loop with addAccount above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth0Loading, linked.busy]);

  // -------------------- 401 REFRESH HANDLER --------------------
  // customBaseQuery calls this when a request comes back 401. We refresh
  // the *active* account's access token via /oauth/token and update the
  // context — no re-render of the calling component required.
  useEffect(() => {
    setTokenRefresher(async () => {
      const activeId = activeUserIdRef.current;
      if (!activeId) return null;
      const account = accountsRef.current.find((a) => a.userId === activeId);
      if (!account || account.status === 'expired') return null;
      const refreshed = await refreshAccessToken(account.refreshToken);
      if (!refreshed) {
        linked.markExpired(activeId);
        return null;
      }
      // Re-add to update the stored access/refresh and bump auth_token.
      await linked.addAccount(
        {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
        },
        {
          userId: account.userId,
          handle: account.handle,
          name: account.name,
          picture: account.picture,
          userType: account.userType,
          email: account.email,
        }
      );
      return refreshed.accessToken;
    });
  }, [linked]);

  // -------------------- LOGIN --------------------
  const login = useCallback(async (): Promise<string | null> => {
    try {
      const audience = Constants.expoConfig?.extra?.auth0Audience;
      await authorize({
        audience,
        scope: 'openid profile email offline_access',
        // Force the account-picker so adding a sibling profile actually shows
        // Auth0's login form rather than silently re-using the SSO cookie.
        additionalParameters: { prompt: 'login' },
      });
      const creds = await getCredentials();
      if (!creds?.accessToken || !creds?.refreshToken) return null;
      const profile = await fetchSelfWithToken(creds.accessToken);
      if (!profile) return null;
      await linked.addAccount(
        {
          accessToken: creds.accessToken,
          refreshToken: creds.refreshToken,
          expiresAt: creds.expiresAt ? new Date(creds.expiresAt).getTime() : Date.now() + 3600_000,
        },
        {
          userId: profile.id,
          handle: profile.handle,
          name: profile.name,
          picture: profile.picture,
          userType: profile.user_type,
          email: profile.email,
        }
      );
      return profile.id;
    } catch (e) {
      console.error('Login failed:', e);
      return null;
    }
  }, [authorize, getCredentials, linked]);

  // -------------------- LOGOUT (active account only) --------------------
  const logout = useCallback(async () => {
    const activeId = activeUserIdRef.current;
    if (!activeId) return;
    try {
      // Unregister this device's row for the active account so it stops
      // receiving pushes for that profile. Other linked accounts on this
      // device keep their rows.
      const authToken = await getAuthToken();
      if (authToken) {
        try {
          const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl ?? '';
          const deviceId = await getOrCreateDeviceId();
          fetch(`${apiBaseUrl}/user/unregister-device`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId }),
          }).catch(() => {});
        } catch {
          // best-effort
        }
      }
      // Drop the active account from the linked set; LinkedAccountsContext
      // promotes the next-most-recent or clears state entirely.
      const willBeEmpty = accountsRef.current.length <= 1;
      await linked.removeAccount(activeId);
      if (willBeEmpty) {
        // Last account on this device — clear the Auth0 Keychain entry so
        // the next authorize() doesn't silently inherit the prior session.
        try {
          await clearCredentials();
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.error('Logout failed:', e);
    }
  }, [clearCredentials, linked]);

  const activeAccount = linked.accounts.find((a) => a.userId === linked.activeUserId);
  const isAuthenticated = !!activeAccount && activeAccount.status === 'ok';
  const isLoading = auth0Loading || linked.busy || bootstrapping;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        login,
        logout,
        token: activeAccount?.accessToken ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
