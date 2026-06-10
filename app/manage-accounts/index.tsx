import { useCallback, useEffect, useRef, useState } from 'react';
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
import UserTypeBadge from '../../src/components/UserTypeBadge';
import { getAuthToken } from '../../src/store/apis/customBaseQuery';
import { useGetLinkedAccountsQuery } from '../../src/store';

const MAX_LINKED_ACCOUNTS = 5;

// Display row: a merge of the SERVER link graph (getLinkedAccounts) and this
// device's local switcher. `switchable` = this device holds a usable token.
type Row = {
  userId: string;
  handle: string | null;
  name: string | null;
  picture: string | null;
  email: string | null;
  userType: 'surfer' | 'photographer' | 'shaper' | null;
  verified: boolean;
  switchable: boolean;
};

// Manage Accounts. The list is sourced from the SERVER link graph merged with
// this device's local switcher, so every account you've ever linked shows up —
// permanently, on any device, regardless of sign-out (the DB link survives;
// only refresh tokens are per-device). Switchable rows tap to switch; rows
// linked server-side but without a token here show "Sign in to switch" (one
// Auth0 login re-establishes the token). "Unlink" drops the bidirectional
// server link.
export default function ManageAccountsScreen() {
  const isDark = useColorScheme() === 'dark';
  const smartBack = useSmartBack();
  const { login } = useAuth();
  const { accounts, activeUserId, switchTo, removeAccount, busy, patchAccount } = useLinkedAccounts();
  const [adding, setAdding] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const refreshedRef = useRef<Set<string>>(new Set());

  // Server-side link graph for the active account — the persistent source of
  // truth. Invalidated by link/unlink, and reset (refetched under the new
  // bearer) whenever switchTo resets the RTK cache.
  const { data: linkedData } = useGetLinkedAccountsQuery({}, { skip: !activeUserId });

  // Refresh persisted display fields for each switchable account so the
  // switcher doesn't render stale values.
  useEffect(() => {
    const apiBase = Constants.expoConfig?.extra?.apiBaseUrl ?? '';
    accounts.forEach((acct) => {
      if (acct.status !== 'ok' || !acct.accessToken) return;
      if (refreshedRef.current.has(acct.userId)) return;
      refreshedRef.current.add(acct.userId);
      (async () => {
        try {
          const res = await fetch(`${apiBase}/user/self`, {
            headers: { Authorization: `Bearer ${acct.accessToken}` },
          });
          if (!res.ok) return;
          const json = await res.json();
          const u = json?.results?.user ?? json?.results;
          if (!u?.id) return;
          await patchAccount(acct.userId, {
            verified: !!u.verified,
            handle: u.handle ?? acct.handle,
            name: u.name ?? acct.name,
            picture: u.picture ?? acct.picture,
            userType: u.user_type ?? acct.userType,
          });
        } catch {
          // best-effort
        }
      })();
    });
  }, [accounts, patchAccount]);

  // ---- Merge server link graph with the local switcher ------------------
  const linkedServer: any[] = (linkedData as any)?.results?.accounts ?? [];
  const rowsById = new Map<string, Row>();
  for (const a of accounts) {
    rowsById.set(a.userId, {
      userId: a.userId,
      handle: a.handle,
      name: a.name,
      picture: a.picture,
      email: a.email,
      userType: a.userType,
      verified: a.verified,
      switchable: a.status === 'ok' && !!a.refreshToken,
    });
  }
  for (const sv of linkedServer) {
    const ex = rowsById.get(sv.id);
    rowsById.set(sv.id, {
      userId: sv.id,
      handle: sv.handle ?? ex?.handle ?? null,
      name: sv.name ?? ex?.name ?? null,
      picture: sv.picture ?? ex?.picture ?? null,
      email: ex?.email ?? sv.email ?? null,
      userType: sv.user_type ?? ex?.userType ?? null,
      verified: ex?.verified ?? false,
      switchable: ex?.switchable ?? false,
    });
  }
  const mergedRows = [...rowsById.values()].sort((a, b) => {
    if (a.userId === activeUserId) return -1;
    if (b.userId === activeUserId) return 1;
    return (a.handle || a.name || '').localeCompare(b.handle || b.name || '');
  });
  const linkedCount = mergedRows.filter((r) => r.userId !== activeUserId).length;
  const atCap = linkedCount >= MAX_LINKED_ACCOUNTS;

  const handleAddAccount = useCallback(async () => {
    setAdding(true);
    const previousUserId = activeUserId;
    try {
      const newUserId = await login();
      if (!newUserId) {
        Alert.alert('Sign-in cancelled');
        return;
      }
      if (!previousUserId || previousUserId === newUserId) return; // no sibling to link
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
  }, [activeUserId, login]);

  const handleSwitch = useCallback(
    async (userId: string) => {
      if (userId === activeUserId) return;
      setBusyUserId(userId);
      try {
        const ok = await switchTo(userId);
        if (!ok) {
          Alert.alert('Session expired', 'Use "Sign in to switch" on this account.');
        }
      } finally {
        setBusyUserId(null);
      }
    },
    [activeUserId, switchTo]
  );

  // No usable token on this device (fresh device / signed out / expired):
  // re-establish it with one Auth0 login. login_hint targets the right account.
  const handleSignInToSwitch = useCallback(
    async (row: Row) => {
      setBusyUserId(row.userId);
      try {
        await login({ loginHint: row.email ?? undefined });
      } finally {
        setBusyUserId(null);
      }
    },
    [login]
  );

  const handleUnlink = useCallback(
    (userId: string, label: string) => {
      Alert.alert(
        'Unlink account?',
        `This removes the link between your accounts everywhere — not just this device. You can re-link any time with Add account.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unlink',
            style: 'destructive',
            onPress: async () => {
              setBusyUserId(userId);
              try {
                const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl ?? '';
                const token = await getAuthToken();
                if (token) {
                  // Server-side symmetric unlink (drops both directions).
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
          without re-entering your password. Linked accounts stay linked across devices until
          you unlink them.
        </Text>

        {mergedRows.length === 0 ? (
          <Text style={[s.empty, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            No linked accounts yet.
          </Text>
        ) : (
          mergedRows.map((acct) => {
            const isActive = acct.userId === activeUserId;
            const label = acct.handle ? `@${acct.handle}` : (acct.name ?? acct.email ?? 'Account');
            const rowBusy = busyUserId === acct.userId;
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
                  onPress={() =>
                    isActive ? undefined : acct.switchable ? handleSwitch(acct.userId) : handleSignInToSwitch(acct)
                  }
                  disabled={busy || rowBusy || isActive}
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
                  <View style={{ flex: 1, marginLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.label, { color: isDark ? '#fff' : '#111827', flexShrink: 1 }]} numberOfLines={1}>
                      {label}
                    </Text>
                    {(acct.userType === 'surfer' || acct.userType === 'photographer' || acct.userType === 'shaper') && (
                      <UserTypeBadge userType={acct.userType} isVerified={!!acct.verified} size={18} />
                    )}
                  </View>
                  {rowBusy ? (
                    <ActivityIndicator size="small" color="#0ea5e9" />
                  ) : isActive ? (
                    <Ionicons name="checkmark-circle" size={22} color="#0ea5e9" />
                  ) : acct.switchable ? (
                    <Ionicons name="ellipse-outline" size={20} color={isDark ? '#4b5563' : '#cbd5e1'} />
                  ) : (
                    <View style={[s.signInPill, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}>
                      <Text style={[s.signInText, { color: isDark ? '#7dd3fc' : '#0369a1' }]}>Sign in to switch</Text>
                    </View>
                  )}
                </Pressable>
                {!isActive && (
                  <Pressable
                    onPress={() => handleUnlink(acct.userId, label)}
                    disabled={busy || rowBusy}
                    style={s.removeBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    <Text style={s.removeText}>Unlink account</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}

        <Pressable
          onPress={handleAddAccount}
          disabled={adding || atCap}
          style={[
            s.addBtn,
            {
              backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe',
              opacity: atCap ? 0.5 : 1,
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
        {atCap && (
          <Text style={[s.capNote, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            You've linked the maximum of {MAX_LINKED_ACCOUNTS} accounts. Unlink one to add another.
          </Text>
        )}
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
  signInPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  signInText: { fontSize: 12, fontWeight: '600' },
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
  capNote: { fontSize: 12, textAlign: 'center', marginTop: 8 },
});
