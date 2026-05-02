import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../src/context/UserProvider';
import { useAuth } from '../../src/context/AuthProvider';
import { useSmartBack } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import {
  useRequestAccountDeletionMutation,
  useCancelAccountDeletionMutation,
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

export default function AccountScreen() {
  const smartBack = useSmartBack();
  const isDark = useColorScheme() === 'dark';
  const { user } = useUser();
  const { logout } = useAuth();

  const [requestDeletion, { isLoading: isRequesting }] = useRequestAccountDeletionMutation();
  const [cancelDeletion, { isLoading: isCancelling }] = useCancelAccountDeletionMutation();

  const storageUsed = parseFloat(String(user?.current_storage ?? 0)) || 0;
  const storageLimit = parseFloat(String(user?.storage_limit ?? 15)) || 15;
  const storagePct = storageLimit > 0 ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;
  const photoCount = user?.photo_count ?? 0;
  const planName = getPlanName(user?.chargebee_subscription_type);
  const hasPendingDeletion = !!user?.deletion_requested_at;
  const deletionDate = user?.deletion_scheduled_for
    ? new Date(user.deletion_scheduled_for).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleCloseAccount = useCallback(() => {
    Alert.alert(
      'Close Your Account?',
      'Your account will be scheduled for permanent deletion in 30 days. During this time you can log back in to cancel.\n\n⚠️ Download any photos you want to keep before the 30 days are up. After that, all your photos, sessions, and data will be permanently deleted and cannot be recovered.\n\nYour subscription (if any) will be set to cancel at the end of your current billing period. If you cancel the deletion before then, your subscription will continue normally.',
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

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Storage Section */}
        <View style={[s.card, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0' }]}>
          <Text style={[s.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>Storage</Text>

          <View style={s.storageRow}>
            <Text style={[s.storageLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
              {photoCount.toLocaleString()} {photoCount === 1 ? 'photo' : 'photos'}
            </Text>
            <Text style={[s.storageValue, { color: isDark ? '#fff' : '#111827' }]}>
              {formatStorage(storageUsed)}
              <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', fontSize: 14 }}>
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
        </View>

        {/* Plan Section */}
        <View style={[s.card, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0' }]}>
          <Text style={[s.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>Plan</Text>

          <View style={s.planRow}>
            <Text style={[s.planName, { color: isDark ? '#fff' : '#111827' }]}>{planName}</Text>
            {planName !== 'Free' && (
              <View style={[s.planBadge, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}>
                <Text style={{ color: '#0ea5e9', fontSize: 12, fontWeight: '600' }}>Active</Text>
              </View>
            )}
          </View>

          <Text style={[s.planHint, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            Manage your subscription at app.surf-vault.com/plans
          </Text>
        </View>

        {/* Deletion Section */}
        <View style={[s.card, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0' }]}>
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
              <Text style={[s.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>Close Account</Text>
              <Text style={[s.closeHint, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
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
    marginBottom: 12,
  },
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
    gap: 8,
    marginBottom: 8,
  },
  planName: { fontSize: 18, fontWeight: '700' },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  planHint: { fontSize: 13 },
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
});
