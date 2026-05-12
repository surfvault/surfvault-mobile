import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../src/context/UserProvider';
import { useAuth } from '../../src/context/AuthProvider';
import { useSmartBack } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import {
  useRequestAccountDeletionMutation,
  useCancelAccountDeletionMutation,
  useUpdateUserEmailMutation,
  useCancelEmailChangeMutation,
  useResendEmailChangeMutation,
  useGetSelfQuery,
} from '../../src/store';

const PLANS: Record<string, string> = {
  'Starter': 'Starter',
  'Pro': 'Pro',
  'Ultimate': 'Ultimate',
  'Verified': 'Verified',
};

function getPlanName(chargebeeType: string | null | undefined): string {
  if (!chargebeeType) return 'Free';
  for (const key of Object.keys(PLANS)) {
    if (chargebeeType.startsWith(key)) return PLANS[key];
  }
  return 'Free';
}

function formatStorage(gb: number): string {
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
  return `${gb.toFixed(1)} GB`;
}

type Connection = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  canChangeEmail: boolean;
};

function getConnection(auth0Id: string | undefined | null): Connection {
  const id = auth0Id ?? '';
  if (id.startsWith('google-oauth2|')) return { label: 'Google', icon: 'logo-google', canChangeEmail: false };
  if (id.startsWith('apple|')) return { label: 'Apple', icon: 'logo-apple', canChangeEmail: false };
  if (id.startsWith('facebook|')) return { label: 'Facebook', icon: 'logo-facebook', canChangeEmail: false };
  return { label: 'Email & Password', icon: 'mail-outline', canChangeEmail: true };
}

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '—';
  }
}

export default function AccountScreen() {
  const smartBack = useSmartBack();
  const isDark = useColorScheme() === 'dark';
  const { user } = useUser();
  const { logout } = useAuth();

  const [requestDeletion, { isLoading: isRequesting }] = useRequestAccountDeletionMutation();
  const [cancelDeletion, { isLoading: isCancelling }] = useCancelAccountDeletionMutation();
  const [updateEmail, { isLoading: isUpdatingEmail }] = useUpdateUserEmailMutation();
  const [cancelEmailChange, { isLoading: isCancellingEmail }] = useCancelEmailChangeMutation();
  const [resendEmailChange, { isLoading: isResendingEmail }] = useResendEmailChangeMutation();

  // Reuse the already-active getSelf subscription from _layout.tsx — RTK
  // Query dedupes the request and gives us the refetch handle for pull-to-
  // refresh.
  const { refetch: refetchSelf } = useGetSelfQuery(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchSelf();
    } finally {
      setRefreshing(false);
    }
  }, [refetchSelf]);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');

  const storageUsed = parseFloat(String(user?.current_storage ?? 0)) || 0;
  const storageLimit = parseFloat(String(user?.storage_limit ?? 15)) || 15;
  const storagePct = storageLimit > 0 ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;
  const photoCount = (user?.photo_count as number | undefined) ?? 0;
  const planName = getPlanName(user?.chargebee_subscription_type as string | undefined);
  const hasPendingDeletion = !!user?.deletion_requested_at;
  const deletionDate = user?.deletion_scheduled_for
    ? new Date(user.deletion_scheduled_for as string).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const connection = useMemo(() => getConnection(user?.auth0_id as string | undefined), [user?.auth0_id]);
  const email = (user?.email as string | undefined) ?? '';
  const pendingEmail = (user?.pending_email as string | undefined) ?? '';
  const hasPendingEmail = !!pendingEmail;
  const memberSince = formatDate(user?.created_at as string | undefined);

  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc';
  const cardBorder = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';
  const primaryText = isDark ? '#fff' : '#111827';
  const subText = isDark ? '#9ca3af' : '#6b7280';
  const mutedText = isDark ? '#6b7280' : '#9ca3af';
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb';

  const openEmailModal = useCallback(() => {
    setEmailDraft(email);
    setEmailModalOpen(true);
  }, [email]);

  const handleSaveEmail = useCallback(async () => {
    const next = emailDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (next === email.toLowerCase()) {
      setEmailModalOpen(false);
      return;
    }
    try {
      await updateEmail({ email: next }).unwrap();
      setEmailModalOpen(false);
      Alert.alert(
        'Check Your Inbox',
        `We sent a verification link to ${next}. Click it to confirm the change.\n\nUntil you confirm, you'll keep signing in with ${email}.`
      );
    } catch (e: any) {
      const msg = e?.data?.message || 'Failed to update email. Please try again.';
      Alert.alert('Error', msg);
    }
  }, [emailDraft, email, updateEmail]);

  const handleCancelEmailChange = useCallback(() => {
    Alert.alert(
      'Cancel email change?',
      `Your sign-in email will stay as ${email}.`,
      [
        { text: 'Keep pending', style: 'cancel' },
        {
          text: 'Cancel change',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelEmailChange().unwrap();
            } catch {
              Alert.alert('Error', 'Failed to cancel. Please try again.');
            }
          },
        },
      ]
    );
  }, [email, cancelEmailChange]);

  const handleResendEmailChange = useCallback(async () => {
    try {
      await resendEmailChange().unwrap();
      Alert.alert('Sent', `Verification link resent to ${pendingEmail}.`);
    } catch (e: any) {
      const msg = e?.data?.message || 'Failed to resend. Please try again.';
      Alert.alert('Error', msg);
    }
  }, [resendEmailChange, pendingEmail]);

  const handleCloseAccount = useCallback(() => {
    Alert.alert(
      'Close Your Account?',
      'Your account will be scheduled for permanent deletion in 30 days. During this time you can log back in to cancel.\n\nDownload any photos you want to keep before the 30 days are up. After that, all your photos, sessions, and data will be permanently deleted and cannot be recovered.\n\nYour subscription (if any) will be set to cancel at the end of your current billing period. If you cancel the deletion before then, your subscription will continue normally.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await requestDeletion({}).unwrap();
              await logout();
            } catch (e) {
              Alert.alert('Error', 'Failed to close account. Please try again.');
            }
          },
        },
      ]
    );
  }, [requestDeletion, logout]);

  const handleCancelDeletion = useCallback(async () => {
    try {
      await cancelDeletion({}).unwrap();
      Alert.alert('Deletion Cancelled', 'Your account has been restored.');
    } catch (e) {
      Alert.alert('Error', 'Failed to cancel deletion. Please try again.');
    }
  }, [cancelDeletion]);

  return (
    <View style={[s.container, { backgroundColor: isDark ? '#000000' : '#fff' }]}>
      <ScreenHeader
        title="Account"
        left={
          <Pressable onPress={smartBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={isDark ? '#fff' : '#000'} />
          </Pressable>
        }
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={isDark ? '#fff' : '#000'}
          />
        }
      >
        {/* Account Details */}
        <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[s.sectionTitle, { color: primaryText }]}>Account details</Text>

          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { color: subText }]}>Name</Text>
            <Text style={[s.detailValue, { color: primaryText }]} numberOfLines={1}>
              {(user?.name as string | undefined) || '—'}
            </Text>
          </View>

          <View style={[s.divider, { backgroundColor: dividerColor }]} />

          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { color: subText }]}>Email</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={[s.detailValue, { color: primaryText }]} numberOfLines={1}>
                {email || '—'}
              </Text>
              {connection.canChangeEmail && !hasPendingEmail && (
                <Pressable onPress={openEmailModal} hitSlop={6} style={{ marginTop: 4 }}>
                  <Text style={s.linkBtn}>Update email</Text>
                </Pressable>
              )}
              {!connection.canChangeEmail && (
                <Text style={[s.detailHint, { color: mutedText }]}>
                  Managed by {connection.label}
                </Text>
              )}
            </View>
          </View>

          {hasPendingEmail && (
            <View
              style={[
                s.pendingBanner,
                {
                  backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb',
                  borderColor: isDark ? 'rgba(245,158,11,0.3)' : '#fde68a',
                },
              ]}
            >
              <Ionicons name="mail-unread-outline" size={18} color="#f59e0b" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[s.pendingTitle, { color: isDark ? '#fbbf24' : '#92400e' }]}>
                  Verify new email
                </Text>
                <Text style={[s.pendingText, { color: isDark ? '#d4a574' : '#a16207' }]}>
                  We sent a confirmation link to {pendingEmail}. Click it to switch. Until then you'll keep signing in with your current email.
                </Text>
                <View style={s.pendingActions}>
                  <Pressable onPress={handleResendEmailChange} disabled={isResendingEmail} hitSlop={6}>
                    {isResendingEmail ? (
                      <ActivityIndicator size="small" color="#0ea5e9" />
                    ) : (
                      <Text style={s.linkBtn}>Resend</Text>
                    )}
                  </Pressable>
                  <Text style={[s.pendingDot, { color: mutedText }]}>·</Text>
                  <Pressable onPress={handleCancelEmailChange} disabled={isCancellingEmail} hitSlop={6}>
                    {isCancellingEmail ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <Text style={[s.linkBtn, { color: '#ef4444' }]}>Cancel change</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          <View style={[s.divider, { backgroundColor: dividerColor }]} />

          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { color: subText }]}>Sign-in method</Text>
            <View style={s.connectionPill}>
              <Ionicons name={connection.icon} size={14} color={primaryText} />
              <Text style={[s.connectionText, { color: primaryText }]}>{connection.label}</Text>
            </View>
          </View>

          <View style={[s.divider, { backgroundColor: dividerColor }]} />

          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { color: subText }]}>Member since</Text>
            <Text style={[s.detailValue, { color: primaryText }]}>{memberSince}</Text>
          </View>
        </View>

        {/* Storage + Plan */}
        <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[s.sectionTitle, { color: primaryText }]}>Storage & plan</Text>

          <View style={s.storageRow}>
            <Text style={[s.storageLabel, { color: subText }]}>
              {photoCount.toLocaleString()} {photoCount === 1 ? 'photo' : 'photos'}
            </Text>
            <Text style={[s.storageValue, { color: primaryText }]}>
              {formatStorage(storageUsed)}
              <Text style={{ color: mutedText, fontSize: 14 }}>
                {' '}/ {formatStorage(storageLimit)}
              </Text>
            </Text>
          </View>

          <View style={[s.storageBar, { backgroundColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
            <View
              style={[
                s.storageBarFill,
                { width: `${storagePct}%`, backgroundColor: storagePct > 90 ? '#f59e0b' : '#0ea5e9' },
              ]}
            />
          </View>

          <View style={[s.divider, { backgroundColor: dividerColor, marginTop: 16, marginBottom: 14 }]} />

          <View style={s.planRow}>
            <Text style={[s.detailLabel, { color: subText }]}>Plan</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[s.planName, { color: primaryText }]}>{planName}</Text>
              {planName !== 'Free' && (
                <View style={[s.planBadge, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}>
                  <Text style={{ color: '#0ea5e9', fontSize: 12, fontWeight: '600' }}>Active</Text>
                </View>
              )}
            </View>
          </View>

          <Text style={[s.planHint, { color: mutedText }]}>
            Manage your subscription at app.surf-vault.com/plans
          </Text>
        </View>

        {/* Deletion Section */}
        <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {hasPendingDeletion ? (
            <>
              <View style={[s.warningBanner, { backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb', borderColor: isDark ? 'rgba(245,158,11,0.3)' : '#fde68a' }]}>
                <Ionicons name="warning-outline" size={20} color="#f59e0b" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[s.warningTitle, { color: isDark ? '#fbbf24' : '#92400e' }]}>
                    Account Scheduled for Deletion
                  </Text>
                  <Text style={[s.warningText, { color: isDark ? '#d4a574' : '#a16207' }]}>
                    Your account and all data will be permanently deleted on {deletionDate}. Download any photos you want to keep before then.
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={handleCancelDeletion}
                disabled={isCancelling}
                style={[s.cancelBtn, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color="#0ea5e9" />
                ) : (
                  <Text style={s.cancelBtnText}>Cancel Deletion</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[s.sectionTitle, { color: primaryText }]}>Close Account</Text>
              <Text style={[s.closeHint, { color: mutedText }]}>
                Closing your account schedules it for permanent deletion after 30 days. You can log in during that window to cancel. Be sure to download any photos you want to keep before the 30 days are up — after that, all photos, sessions, and data will be permanently deleted.
              </Text>

              <Pressable
                onPress={handleCloseAccount}
                disabled={isRequesting}
                style={[s.closeBtn, { borderColor: isDark ? 'rgba(239,68,68,0.4)' : '#fecaca' }]}
              >
                {isRequesting ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <Text style={s.closeBtnText}>Close Account</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>

      {/* Update email modal */}
      <Modal visible={emailModalOpen} animationType="slide" transparent onRequestClose={() => setEmailModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalBackdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEmailModalOpen(false)} />
          <View style={[s.modalCard, { backgroundColor: isDark ? '#0b0b0b' : '#fff', borderColor: cardBorder }]}>
            <Text style={[s.modalTitle, { color: primaryText }]}>Update email</Text>
            <Text style={[s.modalHint, { color: subText }]}>
              We'll send a verification link to the new address. Your current email stays active until you confirm.
            </Text>

            <TextInput
              value={emailDraft}
              onChangeText={setEmailDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={mutedText}
              style={[
                s.input,
                {
                  color: primaryText,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                  borderColor: cardBorder,
                },
              ]}
            />

            <View style={s.modalActions}>
              <Pressable onPress={() => setEmailModalOpen(false)} style={[s.modalBtn, { backgroundColor: 'transparent' }]}>
                <Text style={[s.modalBtnText, { color: subText }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveEmail}
                disabled={isUpdatingEmail}
                style={[s.modalBtn, { backgroundColor: '#0ea5e9' }]}
              >
                {isUpdatingEmail ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[s.modalBtnText, { color: '#fff', fontWeight: '600' }]}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 15, fontWeight: '500', maxWidth: 220, textAlign: 'right' },
  detailHint: { fontSize: 12, marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  linkBtn: { color: '#0ea5e9', fontSize: 13, fontWeight: '600' },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  pendingTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  pendingText: { fontSize: 12, lineHeight: 17 },
  pendingActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  pendingDot: { fontSize: 14 },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectionText: { fontSize: 14, fontWeight: '500' },
  storageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  storageLabel: { fontSize: 13 },
  storageValue: { fontSize: 20, fontWeight: '700' },
  storageBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  storageBarFill: {
    height: 6,
    borderRadius: 3,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planName: { fontSize: 16, fontWeight: '700' },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  planHint: { fontSize: 12 },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  warningTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  warningText: { fontSize: 13 },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600' },
  closeHint: { fontSize: 13, marginBottom: 16, lineHeight: 19 },
  closeBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  closeBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  modalHint: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  modalBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { fontSize: 14 },
});
