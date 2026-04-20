import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import ActionSheet, { type ActionSheetOption } from '../../src/components/ActionSheet';
import { Ionicons } from '@expo/vector-icons';
import {
  useGetNotificationsQuery,
  useMarkNotificationsAsReadMutation,
  useUpdateAccessRequestMutation,
} from '../../src/store';

const ACCESS_LENGTHS = [
  '1 week',
  '2 weeks',
  '1 month',
  '3 months',
  '6 months',
  '1 year',
  'Unlimited',
];

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getNotifIcon = (type: string): { name: string; color: string } => {
  switch (type) {
    case 'uploadCompleted': return { name: 'cloud-done-outline', color: '#22c55e' };
    case 'photographerUpload': return { name: 'camera-outline', color: '#0ea5e9' };
    case 'surfBreakUpload': return { name: 'location-outline', color: '#0ea5e9' };
    case 'taggedInSurfSession': return { name: 'pricetag-outline', color: '#8b5cf6' };
    case 'photographerActive': return { name: 'pulse-outline', color: '#10b981' };
    case 'newFollower': return { name: 'person-add-outline', color: '#f59e0b' };
    case 'userAccessRequest': return { name: 'lock-open-outline', color: '#ef4444' };
    case 'userAccessRequestApproval': return { name: 'checkmark-circle-outline', color: '#22c55e' };
    case 'welcomeUser': return { name: 'hand-right-outline', color: '#0ea5e9' };
    default: return { name: 'notifications-outline', color: '#6b7280' };
  }
};

const getNotifTitle = (n: any): string => {
  switch (n.resource_type) {
    case 'uploadCompleted': return 'Upload Completed';
    case 'photographerUpload': return n.resource_user?.handle ?? 'Photographer Upload';
    case 'surfBreakUpload': return n.resource_surfbreak?.name?.replaceAll('_', ' ') ?? 'Surf Break Upload';
    case 'taggedInSurfSession': return 'Photos Available';
    case 'photographerActive': return n.resource_user?.handle ?? 'Photographer Active';
    case 'newFollower': return 'New Follower';
    case 'userAccessRequest': return 'Access Request';
    case 'userAccessRequestApproval': return 'Access Approved';
    case 'welcomeUser': return 'Welcome to SurfVault';
    default: return 'Notification';
  }
};

export default function NotificationsScreen() {
  const router = useRouter();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useGetNotificationsQuery(
    { read: '' as any, filter: '', limit: 25, continuationToken: '' },
    { refetchOnMountOrArgChange: true }
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);
  const [markAsRead, { isLoading: marking }] = useMarkNotificationsAsReadMutation();
  const [updateAccessRequest, { isLoading: processingAccess }] = useUpdateAccessRequestMutation();

  // Access-request action sheets: first picks Approve/Reject, second picks a duration on approve.
  const [accessTarget, setAccessTarget] = useState<{ requestId: string; notificationId: string; handle: string } | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [durationSheetVisible, setDurationSheetVisible] = useState(false);

  const notifications = data?.results?.notifications ?? [];
  const unread = useMemo(() => notifications.filter((n: any) => !n.is_read), [notifications]);
  const read = useMemo(() => notifications.filter((n: any) => !!n.is_read), [notifications]);

  const sections = useMemo(() => {
    const s: any[] = [];
    if (unread.length > 0) s.push({ title: 'Unread', data: unread });
    if (read.length > 0) s.push({ title: 'Earlier', data: read });
    return s;
  }, [unread, read]);

  const markAllRead = useCallback(async () => {
    if (unread.length === 0) return;
    await markAsRead({ notificationIds: unread.map((n: any) => n.id) });
  }, [unread, markAsRead]);

  const openAccessRequestSheet = useCallback((n: any) => {
    const status = n.resource_user_access_request?.access_status;
    // Already decided — no-op (status pill is rendered on the card)
    if (status === 'approved' || status === 'rejected') return;
    const handle = n.body?.split(' has ')?.[0] ?? n.metadata_user?.handle ?? '';
    setAccessTarget({ requestId: n.resource_id, notificationId: n.id, handle });
    setActionSheetVisible(true);
  }, []);

  const handleReject = useCallback(async () => {
    if (!accessTarget) return;
    setActionSheetVisible(false);
    try {
      await updateAccessRequest({
        requestId: accessTarget.requestId,
        action: 'reject',
        accessLength: undefined,
      }).unwrap();
      await markAsRead({ notificationIds: [accessTarget.notificationId] });
    } catch {
      Alert.alert('Error', 'Failed to reject access request.');
    } finally {
      setAccessTarget(null);
    }
  }, [accessTarget, updateAccessRequest, markAsRead]);

  const handleApproveWithDuration = useCallback(async (accessLength: string) => {
    if (!accessTarget) return;
    setDurationSheetVisible(false);
    try {
      await updateAccessRequest({
        requestId: accessTarget.requestId,
        action: 'approve',
        accessLength,
      }).unwrap();
      await markAsRead({ notificationIds: [accessTarget.notificationId] });
    } catch {
      Alert.alert('Error', 'Failed to approve access request.');
    } finally {
      setAccessTarget(null);
    }
  }, [accessTarget, updateAccessRequest, markAsRead]);

  const handleNotifPress = useCallback((n: any) => {
    // Access requests open an action sheet, never navigate / auto-mark as read.
    if (n.resource_type === 'userAccessRequest') {
      openAccessRequestSheet(n);
      return;
    }

    // Mark as read
    if (!n.is_read) markAsRead({ notificationIds: [n.id] });

    // Navigate based on type
    switch (n.resource_type) {
      case 'photographerUpload':
      case 'photographerActive': {
        const handle = n.resource_user?.handle;
        if (handle) trackedPush(`/user/${handle}` as any);
        break;
      }
      case 'surfBreakUpload': {
        const sb = n.resource_surfbreak;
        if (sb) trackedPush(`/break/${sb.country_code}/${sb.region || '0'}/${sb.surf_break_identifier}` as any);
        break;
      }
      case 'uploadCompleted': {
        const sessionId = n.resource_upload_session?.id;
        if (sessionId) trackedPush(`/session/${sessionId}` as any);
        break;
      }
      case 'taggedInSurfSession': {
        const sessionId = n.resource_surfsession?.id;
        if (sessionId) trackedPush(`/session/${sessionId}` as any);
        break;
      }
      case 'newFollower': {
        const handle = n.metadata_user?.handle;
        if (handle) trackedPush(`/user/${handle}` as any);
        break;
      }
      case 'userAccessRequestApproval': {
        const handle = n.metadata_user?.handle;
        if (handle) trackedPush(`/user/${handle}` as any);
        break;
      }
    }
  }, [router, markAsRead, openAccessRequestSheet]);

  const actionSheetOptions: ActionSheetOption[] = useMemo(() => ([
    {
      label: 'Approve',
      icon: 'checkmark-circle',
      onPress: () => {
        setActionSheetVisible(false);
        setDurationSheetVisible(true);
      },
    },
    {
      label: 'Reject',
      icon: 'close-circle',
      destructive: true,
      onPress: handleReject,
    },
  ]), [handleReject]);

  const durationSheetOptions: ActionSheetOption[] = useMemo(
    () =>
      ACCESS_LENGTHS.map((length) => ({
        label: length,
        icon: length === 'Unlimited' ? 'infinite-outline' : 'time-outline',
        onPress: () => handleApproveWithDuration(length),
      })),
    [handleApproveWithDuration]
  );

  const renderNotification = ({ item }: { item: any }) => {
    const icon = getNotifIcon(item.resource_type);
    const title = getNotifTitle(item);
    const isUnread = !item.is_read;
    const accessStatus =
      item.resource_type === 'userAccessRequest'
        ? item.resource_user_access_request?.access_status
        : null;

    return (
      <Pressable
        onPress={() => handleNotifPress(item)}
        style={[
          s.notifRow,
          { borderBottomColor: isDark ? '#1f2937' : '#f3f4f6' },
          isUnread && { backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff' },
        ]}
      >
        <View style={[s.notifIcon, { backgroundColor: icon.color + '18' }]}>
          <Ionicons name={icon.name as any} size={20} color={icon.color} />
        </View>
        <View style={s.notifContent}>
          <View style={s.notifTopRow}>
            <Text style={[s.notifTitle, isUnread && s.notifTitleUnread, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[s.notifDate, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
              {formatDate(item.created_at)}
            </Text>
          </View>
          <Text style={[s.notifBody, { color: isDark ? '#9ca3af' : '#6b7280' }]} numberOfLines={2}>
            {item.body}
          </Text>
          {accessStatus === 'approved' && (
            <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#ecfdf5' }]}>
              <Ionicons name="checkmark-circle" size={14} color="#10b981" />
              <Text style={[s.statusPillText, { color: '#059669' }]}>Accepted</Text>
            </View>
          )}
          {accessStatus === 'rejected' && (
            <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2' }]}>
              <Ionicons name="close-circle" size={14} color="#ef4444" />
              <Text style={[s.statusPillText, { color: '#dc2626' }]}>Rejected</Text>
            </View>
          )}
          {item.resource_type === 'userAccessRequest' && (!accessStatus || accessStatus === 'pending') && (
            <View style={s.actionRow}>
              <Pressable
                onPress={() => handleNotifPress(item)}
                disabled={processingAccess}
                style={[s.primaryActionBtn, { opacity: processingAccess ? 0.6 : 1 }]}
              >
                <Text style={s.primaryActionText}>Approve / Reject</Text>
              </Pressable>
            </View>
          )}
        </View>
        {isUnread && <View style={s.unreadDot} />}
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Notifications"
        left={
          <Pressable onPress={smartBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color="#007AFF" />
          </Pressable>
        }
        right={unread.length > 0 ? (
          <Pressable onPress={markAllRead} disabled={marking} hitSlop={8}>
            <Text style={{ fontSize: 15, color: '#0ea5e9', fontWeight: '600' }}>
              {marking ? 'Marking...' : 'Read All'}
            </Text>
          </Pressable>
        ) : undefined}
      />
      <SafeAreaView style={[s.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={[]}>
        {isLoading ? (
          <View style={s.loadingWrap}><ActivityIndicator size="large" /></View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderNotification}
            renderSectionHeader={({ section }) => (
              <View style={[s.sectionHeader, { backgroundColor: isDark ? '#030712' : '#fff' }]}>
                <Text style={[s.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>
                  {section.title}
                </Text>
                <Text style={[s.sectionCount, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
                  {section.data.length}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="notifications-off-outline" size={48} color={isDark ? '#374151' : '#d1d5db'} />
                <Text style={[s.emptyTitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                  No notifications yet
                </Text>
              </View>
            }
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            stickySectionHeadersEnabled
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => { setActionSheetVisible(false); setAccessTarget(null); }}
        title={accessTarget?.handle ? `${accessTarget.handle}'s access request` : 'Access request'}
        options={actionSheetOptions}
      />
      <ActionSheet
        visible={durationSheetVisible}
        onClose={() => { setDurationSheetVisible(false); setAccessTarget(null); }}
        title="How long should they have access?"
        options={durationSheetOptions}
      />
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionCount: { fontSize: 13 },
  notifRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notifIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  notifContent: { flex: 1, marginLeft: 12 },
  notifTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notifTitle: { fontSize: 14, flex: 1, marginRight: 8 },
  notifTitleUnread: { fontWeight: '700' },
  notifDate: { fontSize: 12 },
  notifBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6', marginLeft: 8,
  },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
    marginTop: 6,
  },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  primaryActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  primaryActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
