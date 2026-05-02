import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import ScreenHeader from '../../src/components/ScreenHeader';
import { useSmartBack } from '../../src/context/NavigationContext';
import { useAuth } from '../../src/context/AuthProvider';
import { useLinkedAccounts } from '../../src/context/LinkedAccountsContext';
import { getAuthToken } from '../../src/store/apis/customBaseQuery';

const MAX_LINKED_ACCOUNTS = 5;

// The Manage Accounts page is the v1 surface for linking, switching, and
// removing sibling profiles. It deliberately stays simple: each row shows
// the cached profile from LinkedAccountsContext (no network round-trip), and
// any state-changing action goes through the context plus a single API call
// where needed.
export default function ManageAccountsScreen() {
  const isDark = useColorScheme() === 'dark';
  const smartBack = useSmartBack();
  const { login } = useAuth();
  const { accounts, activeUserId, switchTo, removeAccount, busy } = useLinkedAccounts();
  const [adding, setAdding] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Add account flow:
  //   1. Remember the currently-active user — that's the side already in
  //      the switcher; the new account becomes the other side of the link.
  //   2. login() runs Auth0 authorize and addAccount() in LinkedAccountsContext.
  //      addAccount switches active to the new user and writes its access
  //      token into the auth_token slot.
  //   3. Call POST /user/linked-accounts with previousUserId=<step 1>. The
  //      bearer token in flight is the new user's, which is exactly what
  //      the server expects (proof of ownership for the new side).
  // If step 3 fails (e.g. network), the local linked set is correct but the
  // server doesn't know about the link — surface a retry.
  const handleAddAccount = useCallback(async () => {
    if (accounts.length >= MAX_LINKED_ACCOUNTS) {
      Alert.alert(
        'Limit reached',
        `You can link up to ${MAX_LINKED_ACCOUNTS} accounts on this device.`
      );
      return;
    }
    setAdding(true);
    const previousUserId = activeUserId;
    try {
      const newUserId = await login();
      if (!newUserId) {
        Alert.alert('Sign-in cancelled');
        return;
      }
      if (!previousUserId || previousUserId === newUserId) {
        // First-ever sign-in OR the user re-authenticated as the same
        // identity (e.g. expired badge) — there's no sibling to link, just
        // the standard "you're now signed in" outcome.
        return;
      }
      const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl ?? '';
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`${apiBaseUrl}/user/linked-accounts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ previousUserId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        Alert.alert('Could not link accounts', body?.message ?? 'Please try again.');
      }
    } finally {
      setAdding(false);
    }
  }, [accounts.length, activeUserId, login]);

  const handleSwitch = useCallback(
    async (userId: string) => {
      if (userId === activeUserId) return;
      setBusyUserId(userId);
      try {
        const ok = await switchTo(userId);
        if (!ok) {
          // Refresh failed — the LinkedAccountsContext has already marked
          // this account expired, which renders the re-authenticate badge.
          Alert.alert(
            'Session expired',
            'Tap "Re-authenticate" on this account to sign in again.'
          );
          return;
        }
        // Stay on the page — user can confirm via the active checkmark.
      } finally {
        setBusyUserId(null);
      }
    },
    [activeUserId, switchTo]
  );

  // Removal does TWO things: tells the server to drop the affiliation row,
  // then drops the account from local state. We DELETE first so a network
  // failure leaves the user able to retry; if we cleared local state first
  // and the API call failed, the user would lose access to make the request.
  const handleRemove = useCallback(
    (userId: string, label: string) => {
      Alert.alert(
        'Remove account?',
        `${label} will be removed from this device's switcher. You can add it back any time by signing in again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setBusyUserId(userId);
              try {
                const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl ?? '';
                const token = await getAuthToken();
                if (token) {
                  // Server-side unlink. The bearer is the active user's token,
                  // and the server enforces symmetric delete (drops both
                  // (active,target) and (target,active) rows).
                  await fetch(`${apiBaseUrl}/user/linked-accounts/${userId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                  }).catch(() => {});
                }
                await removeAccount(userId);
              } finally {
                setBusyUserId(null);
              }
            },
          },
        ]
      );
    },
    [removeAccount]
  );

  // Re-authenticate flow for an expired account: just call login() — Auth0
  // will pick up the stored SSO session if it's alive, or prompt fresh
  // credentials if not. addAccount() upserts on userId, so this transparently
  // refreshes the row without changing the order in the list.
  const handleReauth = useCallback(async () => {
    setAdding(true);
    try {
      await login();
    } finally {
      setAdding(false);
    }
  }, [login]);

  return (
    <View style={[s.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <ScreenHeader
        title="Manage Accounts"
        left={
          <Pressable onPress={smartBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={isDark ? '#fff' : '#000'} />
          </Pressable>
        }
      />

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <Text style={[s.helper, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
          Sign in once and switch between your surfer, photographer, and shaper profiles
          without re-entering your password.
        </Text>

        {accounts.length === 0 ? (
          <Text style={[s.empty, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            No linked accounts yet.
          </Text>
        ) : (
          accounts
            .slice()
            .sort((a, b) => a.addedAt - b.addedAt)
            .map((acct) => {
              const isActive = acct.userId === activeUserId;
              const isExpired = acct.status === 'expired';
              const label = acct.handle ? `@${acct.handle}` : (acct.name ?? acct.email ?? 'Account');
              return (
                <View
                  key={acct.userId}
                  style={[
                    s.card,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                      borderColor: isActive
                        ? '#0ea5e9'
                        : isDark
                          ? 'rgba(255,255,255,0.1)'
                          : '#e2e8f0',
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => (isExpired ? handleReauth() : handleSwitch(acct.userId))}
                    disabled={busy || busyUserId === acct.userId}
                    style={s.row}
                  >
                    {acct.picture ? (
                      <Image source={{ uri: acct.picture }} style={s.avatar} />
                    ) : (
                      <View
                        style={[
                          s.avatar,
                          { backgroundColor: isDark ? '#1f2937' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
                        ]}
                      >
                        <Text style={{ color: isDark ? '#9ca3af' : '#6b7280', fontWeight: '700' }}>
                          {(acct.handle ?? acct.name ?? '?').slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[s.label, { color: isDark ? '#fff' : '#111827' }]}>{label}</Text>
                      <Text style={[s.sublabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                        {acct.userType ?? '—'}
                      </Text>
                    </View>
                    {busyUserId === acct.userId ? (
                      <ActivityIndicator size="small" color="#0ea5e9" />
                    ) : isExpired ? (
                      <View style={s.badge}>
                        <Text style={s.badgeText}>Re-authenticate</Text>
                      </View>
                    ) : isActive ? (
                      <Ionicons name="checkmark-circle" size={22} color="#0ea5e9" />
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() => handleRemove(acct.userId, label)}
                    disabled={busy || busyUserId === acct.userId}
                    style={s.removeBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    <Text style={s.removeText}>Remove from this device</Text>
                  </Pressable>
                </View>
              );
            })
        )}

        <Pressable
          onPress={handleAddAccount}
          disabled={adding || accounts.length >= MAX_LINKED_ACCOUNTS}
          style={[
            s.addBtn,
            {
              backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe',
              opacity: accounts.length >= MAX_LINKED_ACCOUNTS ? 0.5 : 1,
            },
          ]}
        >
          {adding ? (
            <ActivityIndicator size="small" color="#0ea5e9" />
          ) : (
            <>
              <Ionicons name="add" size={20} color="#0ea5e9" />
              <Text style={s.addText}>Add account</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  helper: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  label: { fontSize: 15, fontWeight: '600' },
  sublabel: { fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  badge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { color: '#92400e', fontSize: 12, fontWeight: '600' },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(239,68,68,0.2)',
  },
  removeText: { color: '#ef4444', fontSize: 13, fontWeight: '500' },
  addBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600' },
});
