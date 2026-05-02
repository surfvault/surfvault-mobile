import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { saveAuthToken } from '../store/apis/customBaseQuery';
import { store } from '../store';
import { rootApi } from '../store/apis/rootApi';
import { refreshAccessToken } from '../helpers/auth0Refresh';

// Per-account session blob persisted in secure-store. Each entry is one
// SurfVault profile (surfer / photographer / shaper) the user has signed in
// to on this device — their tokens, plus the lightweight profile fields
// needed to render the switcher without an extra round-trip.
//
// `status: 'expired'` means the most recent refresh-token call failed; the
// switcher shows a re-authenticate badge instead of swapping the bearer
// token blindly. We never silently drop an account — the user removes it
// explicitly from Manage Accounts.
export interface AccountSession {
  userId: string;
  handle: string | null;
  name: string | null;
  picture: string | null;
  userType: 'surfer' | 'photographer' | 'shaper' | null;
  email: string | null;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  status: 'ok' | 'expired';
  addedAt: number;
}

export interface LinkedAccountsState {
  accounts: AccountSession[];
  activeUserId: string | null;
}

interface LinkedAccountsContextType extends LinkedAccountsState {
  /** Add an account to the linked set (post-Auth0-login) and make it active. */
  addAccount: (
    creds: { accessToken: string; refreshToken: string; expiresAt: number },
    profile: Pick<AccountSession, 'userId' | 'handle' | 'name' | 'picture' | 'userType' | 'email'>
  ) => Promise<void>;
  /**
   * Make `userId` the active account: refresh its access token if needed,
   * write it into the bearer-token slot customBaseQuery reads, and reset
   * RTK Query so screens repopulate against the new identity.
   *
   * Returns true on success, false if the account is expired and needs re-auth.
   */
  switchTo: (userId: string) => Promise<boolean>;
  /** Remove an account from the linked set. If active, falls back to another. */
  removeAccount: (userId: string) => Promise<void>;
  /** Mark an account as needing re-authentication (refresh failed). */
  markExpired: (userId: string) => void;
  /** True while async work is in flight (initial hydrate, refresh, switch). */
  busy: boolean;
}

const LinkedAccountsContext = createContext<LinkedAccountsContextType>({
  accounts: [],
  activeUserId: null,
  addAccount: async () => {},
  switchTo: async () => false,
  removeAccount: async () => {},
  markExpired: () => {},
  busy: false,
});

const STORAGE_KEY = 'surfvault.linked_accounts';
const ACTIVE_USER_KEY = 'surfvault.active_user_id';
// Refresh proactively if the access token expires within this many ms. Keeps
// the first request after a switch from racing a 401.
const REFRESH_SKEW_MS = 60_000;

async function persist(state: LinkedAccountsState): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(state.accounts));
  if (state.activeUserId) {
    await SecureStore.setItemAsync(ACTIVE_USER_KEY, state.activeUserId);
  } else {
    await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
  }
}

async function hydrate(): Promise<LinkedAccountsState> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    const accounts: AccountSession[] = raw ? JSON.parse(raw) : [];
    const activeUserId = (await SecureStore.getItemAsync(ACTIVE_USER_KEY)) || null;
    // Defend against a deleted active account leaving a dangling pointer.
    const validActive = accounts.some((a) => a.userId === activeUserId) ? activeUserId : null;
    return { accounts, activeUserId: validActive };
  } catch {
    return { accounts: [], activeUserId: null };
  }
}

export function LinkedAccountsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LinkedAccountsState>({ accounts: [], activeUserId: null });
  const [busy, setBusy] = useState(true);
  // useRef so callbacks don't capture stale state — context callers may fire
  // multiple operations in quick succession (add + switch on add-account).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Hydrate on mount.
  useEffect(() => {
    (async () => {
      const initial = await hydrate();
      setState(initial);
      setBusy(false);
    })();
  }, []);

  const writeState = useCallback(async (next: LinkedAccountsState) => {
    setState(next);
    stateRef.current = next;
    await persist(next);
  }, []);

  // Ensure the access token for `account` is fresh enough to use for the next
  // request. Returns the (possibly-rotated) account or `null` if the refresh
  // token is dead — caller marks expired in that case.
  const refreshIfNeeded = useCallback(
    async (account: AccountSession): Promise<AccountSession | null> => {
      if (account.status === 'expired') return null;
      if (account.expiresAt - Date.now() > REFRESH_SKEW_MS && account.accessToken) {
        return account;
      }
      const refreshed = await refreshAccessToken(account.refreshToken);
      if (!refreshed) return null;
      return {
        ...account,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        status: 'ok',
      };
    },
    []
  );

  const switchTo = useCallback(
    async (userId: string): Promise<boolean> => {
      setBusy(true);
      try {
        const account = stateRef.current.accounts.find((a) => a.userId === userId);
        if (!account) return false;
        const fresh = await refreshIfNeeded(account);
        if (!fresh) {
          // Mark expired and leave activeUserId where it was so the user can
          // see the badge and decide to re-auth.
          const accounts = stateRef.current.accounts.map((a) =>
            a.userId === userId ? { ...a, status: 'expired' as const } : a
          );
          await writeState({ ...stateRef.current, accounts });
          return false;
        }
        const accounts = stateRef.current.accounts.map((a) => (a.userId === userId ? fresh : a));
        await writeState({ accounts, activeUserId: userId });
        await saveAuthToken(fresh.accessToken);
        // Drop every cached query so screens refetch under the new identity.
        // Without this, the previous account's home feed / messages / etc.
        // would still be on screen until each query naturally re-fired.
        store.dispatch(rootApi.util.resetApiState());
        return true;
      } finally {
        setBusy(false);
      }
    },
    [refreshIfNeeded, writeState]
  );

  const addAccount = useCallback(
    async (
      creds: { accessToken: string; refreshToken: string; expiresAt: number },
      profile: Pick<AccountSession, 'userId' | 'handle' | 'name' | 'picture' | 'userType' | 'email'>
    ) => {
      const session: AccountSession = {
        ...profile,
        accessToken: creds.accessToken,
        refreshToken: creds.refreshToken,
        expiresAt: creds.expiresAt,
        status: 'ok',
        addedAt: Date.now(),
      };
      // Replace if same userId already present (re-auth of a previously
      // expired account); otherwise append.
      const others = stateRef.current.accounts.filter((a) => a.userId !== profile.userId);
      const next: LinkedAccountsState = {
        accounts: [...others, session],
        activeUserId: profile.userId,
      };
      await writeState(next);
      await saveAuthToken(creds.accessToken);
      // Fresh identity → drop stale RTK Query cache.
      store.dispatch(rootApi.util.resetApiState());
    },
    [writeState]
  );

  const removeAccount = useCallback(
    async (userId: string) => {
      setBusy(true);
      try {
        const remaining = stateRef.current.accounts.filter((a) => a.userId !== userId);
        const wasActive = stateRef.current.activeUserId === userId;
        let nextActive = stateRef.current.activeUserId;
        if (wasActive) {
          // Pick the next-most-recently-added account as the new active.
          const fallback = remaining.length > 0 ? [...remaining].sort((a, b) => b.addedAt - a.addedAt)[0] : null;
          nextActive = fallback?.userId ?? null;
        }
        await writeState({ accounts: remaining, activeUserId: nextActive });
        if (wasActive) {
          if (nextActive) {
            // Promote the fallback by running it through switchTo so its token
            // is freshened and customBaseQuery is wired up correctly.
            await switchTo(nextActive);
          } else {
            // No accounts left — fully signed-out state.
            await SecureStore.deleteItemAsync('auth_token');
            store.dispatch(rootApi.util.resetApiState());
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [switchTo, writeState]
  );

  const markExpired = useCallback(
    (userId: string) => {
      const accounts = stateRef.current.accounts.map((a) =>
        a.userId === userId ? { ...a, status: 'expired' as const } : a
      );
      writeState({ ...stateRef.current, accounts });
    },
    [writeState]
  );

  const value = useMemo<LinkedAccountsContextType>(
    () => ({
      accounts: state.accounts,
      activeUserId: state.activeUserId,
      addAccount,
      switchTo,
      removeAccount,
      markExpired,
      busy,
    }),
    [state, addAccount, switchTo, removeAccount, markExpired, busy]
  );

  return <LinkedAccountsContext.Provider value={value}>{children}</LinkedAccountsContext.Provider>;
}

export const useLinkedAccounts = () => useContext(LinkedAccountsContext);
