import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import { useUser } from '../../src/context/UserProvider';
import { adPlansUrl } from '../../src/helpers/adTiers';
import ScreenHeader from '../../src/components/ScreenHeader';
import ActionSheet, { type ActionSheetOption } from '../../src/components/ActionSheet';
import ApproveAccessRequestSheet from '../../src/components/ApproveAccessRequestSheet';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  useApproveAdminAdMutation,
  useGetAdminAdQuery,
  useGetNotificationsQuery,
  useMarkNotificationsAsReadMutation,
  useRejectAdminAdMutation,
  useUpdateAccessRequestMutation,
} from '../../src/store';
import UserAvatar from '../../src/components/UserAvatar';

// Pre-defined rejection reasons surfaced inline from the notification card.
// Mirrors the web admin Campaigns tab so advertisers see consistent
// rejection language regardless of which surface the admin used. The "Other"
// option opens a free-text field so admins can write a custom reason; the
// advertiser sees whichever reason was chosen on their campaign.
const NOTIFICATIONS_PAGE_SIZE = 25;

const CAMPAIGN_REJECT_REASON_TEMPLATES = [
  { label: 'NSFW or inappropriate', template: "Contains inappropriate content for the SurfVault audience." },
  { label: 'Off-topic for surf community', template: "Not relevant to surfing or the SurfVault community." },
  { label: 'Broken or unsafe link', template: "The destination link is broken, redirects unexpectedly, or doesn't load." },
  { label: 'Scam or misleading', template: "The claim or offer appears misleading or unverifiable." },
  { label: 'Creative quality', template: "Image quality is too low or the creative is hard to read at the placement size." },
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
    case 'taggedInFilm': return { name: 'film-outline', color: '#8b5cf6' };
    case 'photographerActive': return { name: 'pulse-outline', color: '#10b981' };
    case 'newBoard': return { name: 'hammer-outline', color: '#f59e0b' };
    case 'newFollower': return { name: 'person-add-outline', color: '#f59e0b' };
    case 'userAccessRequest': return { name: 'lock-open-outline', color: '#ef4444' };
    case 'userAccessRequestApproval': return { name: 'checkmark-circle-outline', color: '#22c55e' };
    case 'photoDownloaded': return { name: 'download-outline', color: '#0ea5e9' };
    case 'adApproved': return { name: 'megaphone-outline', color: '#22c55e' };
    case 'adRejected': return { name: 'megaphone-outline', color: '#ef4444' };
    case 'creditPackPurchased': return { name: 'cash-outline', color: '#fbbf24' };
    case 'paymentFailed': return { name: 'card-outline', color: '#ef4444' };
    default: return { name: 'notifications-outline', color: '#6b7280' };
  }
};

// Live thumbnail for a campaign-submission card. Resolves the ad's CURRENT
// thumbnail via the admin single-ad query rather than trusting the snapshot
// URL frozen in the notification's body_metadata at submission time — so if
// the advertiser swaps the creative, the card reflects it. Falls back to the
// stored URL while the query is in flight (or if it fails / ad is gone).
function CampaignThumb({
  adId,
  fallbackUrl,
  style,
}: {
  adId?: string;
  fallbackUrl?: string;
  style: any;
}) {
  const { data } = useGetAdminAdQuery({ adId: adId! }, { skip: !adId });
  const ad = (data as any)?.results?.ad;
  let liveUrl: string | null = null;
  if (ad) {
    const media: any[] = Array.isArray(ad.media) ? ad.media : [];
    if (ad.thumbnail_ad_media_id) {
      liveUrl = media.find((m) => m.id === ad.thumbnail_ad_media_id)?.s3_key ?? null;
    }
    if (!liveUrl && media.length) {
      liveUrl = [...media].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.s3_key ?? null;
    }
    if (!liveUrl) liveUrl = ad.media_url ?? null;
  }
  const uri = liveUrl ?? fallbackUrl ?? null;
  if (!uri) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="megaphone-outline" size={18} color="#9ca3af" />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} contentFit="cover" />;
}

// Approve/Reject actions (or a decided pill) for a campaign-submission card.
// The notification row has no decision flag — the source of truth is the ad's
// status — so this queries the ad live. Local `localDecided` gives instant
// feedback right after a tap; otherwise the live status keeps the card correct
// across reloads and on the OTHER notification when an ad is resubmitted.
function CampaignActions({
  adId,
  localDecided,
  busy,
  isDark,
  onApprove,
  onReject,
}: {
  adId?: string;
  localDecided?: 'approved' | 'rejected';
  busy: boolean;
  isDark: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { data, isError } = useGetAdminAdQuery({ adId: adId! }, { skip: !adId });
  const status = (data as any)?.results?.ad?.status as string | undefined;
  const decided =
    localDecided
    ?? (status === 'approved' || status === 'paused' ? 'approved'
      : status === 'rejected' ? 'rejected'
      : undefined);

  // 404 = the ad was deleted out from under the notification. No actions.
  if (!localDecided && adId && isError) {
    return (
      <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : '#f1f5f9' }]}>
        <Ionicons name="trash-outline" size={14} color={isDark ? '#94a3b8' : '#64748b'} />
        <Text style={[s.statusPillText, { color: isDark ? '#94a3b8' : '#64748b' }]}>No longer available</Text>
      </View>
    );
  }

  if (decided === 'approved') {
    return (
      <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#ecfdf5' }]}>
        <Ionicons name="checkmark-circle" size={14} color="#10b981" />
        <Text style={[s.statusPillText, { color: '#059669' }]}>Approved</Text>
      </View>
    );
  }
  if (decided === 'rejected') {
    return (
      <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2' }]}>
        <Ionicons name="close-circle" size={14} color="#ef4444" />
        <Text style={[s.statusPillText, { color: '#dc2626' }]}>Rejected</Text>
      </View>
    );
  }
  return (
    <View style={[s.actionRow, { gap: 8 }]}>
      <Pressable
        onPress={onApprove}
        disabled={busy}
        style={[s.approveBtn, { opacity: busy ? 0.6 : 1 }]}
      >
        <Ionicons name="checkmark-circle" size={14} color="#fff" />
        <Text style={s.approveBtnText}>Approve</Text>
      </Pressable>
      <Pressable
        onPress={onReject}
        disabled={busy}
        style={[s.rejectBtn, { opacity: busy ? 0.6 : 1, borderColor: isDark ? 'rgba(239,68,68,0.35)' : '#fecaca' }]}
      >
        <Ionicons name="close-circle" size={14} color="#ef4444" />
        <Text style={s.rejectBtnText}>Reject</Text>
      </Pressable>
    </View>
  );
}

const getNotifTitle = (n: any): string => {
  switch (n.resource_type) {
    case 'uploadCompleted': return 'Upload Completed';
    case 'photographerUpload': return n.resource_user?.handle ?? 'Photographer Upload';
    case 'surfBreakUpload': return n.resource_surfbreak?.name?.replaceAll('_', ' ') ?? 'Surf Break Upload';
    case 'taggedInSurfSession': return 'Photos Available';
    case 'taggedInFilm': return 'Tagged in a Film';
    case 'photographerActive': return n.resource_user?.handle ?? 'Photographer Active';
    case 'newBoard': return n.resource_user?.handle ?? 'New Board';
    case 'newFollower': return 'New Follower';
    case 'userAccessRequest': return 'Access Request';
    case 'userAccessRequestApproval': return 'Access Approved';
    case 'photoDownloaded': return n.metadata_user?.handle ?? 'Photos Downloaded';
    case 'adApproved': return 'Campaign Approved';
    case 'adRejected': return 'Campaign Rejected';
    case 'newCampaignSubmission': return 'Ad Request';
    case 'creditPackPurchased': return 'Credits Added';
    case 'paymentFailed': return 'Payment Failed';
    default: return 'Notification';
  }
};

export default function NotificationsScreen() {
  const router = useRouter();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const { user } = useUser();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [refreshing, setRefreshing] = useState(false);

  // Growing-window pagination: fetch the most-recent N, grow N on scroll-end.
  const [notificationsLimit, setNotificationsLimit] = useState(NOTIFICATIONS_PAGE_SIZE);
  const { data, isLoading, isFetching, refetch } = useGetNotificationsQuery(
    { read: '' as any, filter: '', limit: notificationsLimit, continuationToken: '' },
    { refetchOnMountOrArgChange: true }
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setNotificationsLimit(NOTIFICATIONS_PAGE_SIZE);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const hasMoreNotifications = !!data?.results?.continuationToken;
  const loadMoreNotifications = useCallback(() => {
    if (hasMoreNotifications && !isFetching) {
      setNotificationsLimit((n) => n + NOTIFICATIONS_PAGE_SIZE);
    }
  }, [hasMoreNotifications, isFetching]);
  const [markAsRead, { isLoading: marking }] = useMarkNotificationsAsReadMutation();
  const [updateAccessRequest, { isLoading: processingAccess }] = useUpdateAccessRequestMutation();
  const [approveAdminAd, { isLoading: approvingCampaign }] = useApproveAdminAdMutation();
  const [rejectAdminAd, { isLoading: rejectingCampaign }] = useRejectAdminAdMutation();

  // Campaign-submission inline approve/reject state. `decidedCampaignIds`
  // tracks which notification rows have been acted on so the buttons get
  // replaced with a "Approved" / "Rejected" pill until refetch.
  const [campaignRejectTarget, setCampaignRejectTarget] = useState<{
    adId: string;
    notificationId: string;
    headline: string;
  } | null>(null);
  const [campaignRejectSheetVisible, setCampaignRejectSheetVisible] = useState(false);
  const [decidedCampaigns, setDecidedCampaigns] = useState<Record<string, 'approved' | 'rejected'>>({});
  // Custom ("Other") rejection-reason modal. Snapshots the target separately
  // from campaignRejectTarget so the ActionSheet closing (which clears the
  // target) doesn't wipe it out before the admin finishes typing.
  const [campaignCustom, setCampaignCustom] = useState<{ adId: string; notificationId: string; headline: string } | null>(null);
  const [campaignCustomReason, setCampaignCustomReason] = useState('');

  const approveCampaignSubmission = useCallback(async (n: any) => {
    const adId = n.body_metadata?.adId ?? n.resource_id;
    const headline = n.body_metadata?.headline ?? 'Campaign';
    if (!adId) return;
    try {
      await approveAdminAd({ adId }).unwrap();
      setDecidedCampaigns((prev) => ({ ...prev, [n.id]: 'approved' }));
      if (!n.is_read) await markAsRead({ notificationIds: [n.id] });
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || `Failed to approve "${headline}"`);
    }
  }, [approveAdminAd, markAsRead]);

  const openCampaignRejectSheet = useCallback((n: any) => {
    const adId = n.body_metadata?.adId ?? n.resource_id;
    if (!adId) return;
    setCampaignRejectTarget({
      adId,
      notificationId: n.id,
      headline: n.body_metadata?.headline ?? 'Campaign',
    });
    setCampaignRejectSheetVisible(true);
  }, []);

  const submitCampaignReject = useCallback(async (template: string) => {
    const target = campaignRejectTarget;
    if (!target) return;
    try {
      await rejectAdminAd({ adId: target.adId, rejectionReason: template }).unwrap();
      setDecidedCampaigns((prev) => ({ ...prev, [target.notificationId]: 'rejected' }));
      await markAsRead({ notificationIds: [target.notificationId] });
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || `Failed to reject "${target.headline}"`);
    } finally {
      setCampaignRejectTarget(null);
    }
  }, [campaignRejectTarget, rejectAdminAd, markAsRead]);

  // "Other" → snapshot the target and open the free-text modal. Snapshotting
  // here means the ActionSheet's onClose (which nulls campaignRejectTarget)
  // can't wipe the target while the admin types.
  const openCustomReject = useCallback(() => {
    const t = campaignRejectTarget;
    setCampaignRejectSheetVisible(false);
    if (!t) return;
    setCampaignCustom(t);
    setCampaignCustomReason('');
  }, [campaignRejectTarget]);

  const submitCustomReject = useCallback(async () => {
    const target = campaignCustom;
    const reason = campaignCustomReason.trim();
    if (!target) return;
    if (!reason) {
      Alert.alert('Add a reason', 'Write what the advertiser should fix.');
      return;
    }
    try {
      await rejectAdminAd({ adId: target.adId, rejectionReason: reason }).unwrap();
      setDecidedCampaigns((prev) => ({ ...prev, [target.notificationId]: 'rejected' }));
      await markAsRead({ notificationIds: [target.notificationId] });
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || `Failed to reject "${target.headline}"`);
    } finally {
      setCampaignCustom(null);
      setCampaignCustomReason('');
    }
  }, [campaignCustom, campaignCustomReason, rejectAdminAd, markAsRead]);

  const campaignRejectOptions: ActionSheetOption[] = useMemo(() => [
    ...CAMPAIGN_REJECT_REASON_TEMPLATES.map((r) => ({
      label: r.label,
      icon: 'close-circle-outline' as const,
      destructive: true,
      onPress: () => {
        setCampaignRejectSheetVisible(false);
        // ActionSheet animates out, then runs onPress ~250ms later — but the
        // template is captured in this closure so it's fine.
        submitCampaignReject(r.template);
      },
    })),
    {
      label: 'Other (write a reason)',
      icon: 'create-outline' as const,
      onPress: openCustomReject,
    },
  ],
  [submitCampaignReject, openCustomReject]);

  // Access-request action sheets: first picks Approve/Reject, second picks a duration on approve.
  const [accessTarget, setAccessTarget] = useState<{ requestId: string; notificationId: string; handle: string } | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [durationSheetVisible, setDurationSheetVisible] = useState(false);
  const durationSheetVisibleRef = useRef(false);
  useEffect(() => { durationSheetVisibleRef.current = durationSheetVisible; }, [durationSheetVisible]);

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
    const handle = n.metadata_user?.handle ?? '';
    setAccessTarget({ requestId: n.resource_id, notificationId: n.id, handle });
    setActionSheetVisible(true);
  }, []);

  // Snapshot `accessTarget` on each handler call because ActionSheet's animated
  // close runs its parent onClose after a delay, and we don't want that to
  // invalidate state mid-operation.
  const handleReject = useCallback(async () => {
    const target = accessTarget;
    if (!target) return;
    try {
      await updateAccessRequest({
        requestId: target.requestId,
        action: 'reject',
        accessLength: undefined,
      }).unwrap();
      await markAsRead({ notificationIds: [target.notificationId] });
    } catch {
      Alert.alert('Error', 'Failed to reject access request.');
    } finally {
      setAccessTarget(null);
    }
  }, [accessTarget, updateAccessRequest, markAsRead]);

  const handleApproveWithDuration = useCallback(async (accessLength: string) => {
    const target = accessTarget;
    if (!target) throw new Error('No access target');
    try {
      await updateAccessRequest({
        requestId: target.requestId,
        action: 'approve',
        accessLength,
      }).unwrap();
      await markAsRead({ notificationIds: [target.notificationId] });
      setDurationSheetVisible(false);
      setAccessTarget(null);
    } catch (err) {
      Alert.alert('Error', 'Failed to approve access request.');
      throw err;
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
      case 'photographerActive':
      case 'newBoard': {
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
      case 'taggedInFilm': {
        // resource_id IS the film id.
        if (n.resource_id) trackedPush(`/film/${n.resource_id}` as any);
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
      case 'photoDownloaded': {
        // Open the (auto-granted) access request so the photographer sees who
        // downloaded which photos. Fall back to the session (resource_id).
        const requestId = n.body_metadata?.accessRequestId;
        if (requestId) trackedPush(`/access/${requestId}` as any);
        else if (n.resource_id) trackedPush(`/session/${n.resource_id}` as any);
        break;
      }
      case 'newCampaignSubmission': {
        // Admin taps the card to review the submitted campaign read-only;
        // Approve/Reject stays on the notification card (back navigation).
        const adId = n.body_metadata?.adId ?? n.resource_id;
        if (adId) trackedPush(`/campaign/${adId}/review` as any);
        break;
      }
      case 'paymentFailed': {
        // Billing is web-only — hand off to the plans page to update the card.
        Linking.openURL(adPlansUrl((user as any)?.email)).catch(() => {});
        break;
      }
    }
  }, [router, markAsRead, openAccessRequestSheet, user]);

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


  const renderNotification = ({ item }: { item: any }) => {
    const icon = getNotifIcon(item.resource_type);
    const title = getNotifTitle(item);
    const isUnread = !item.is_read;
    const accessStatus =
      item.resource_type === 'userAccessRequest'
        ? item.resource_user_access_request?.access_status
        : null;

    // Prefer the actor's avatar when the notification involves a user.
    // resource_user covers uploads/active/newBoard; metadata_user covers
    // newFollower/userAccessRequestApproval (where the resource itself is
    // the request/follow, not a user).
    const actor = item.resource_user ?? item.metadata_user ?? null;
    const showAvatar = !!actor?.picture || !!actor?.handle;

    return (
      <Pressable
        onPress={() => handleNotifPress(item)}
        style={[
          s.notifRow,
          { borderBottomColor: isDark ? '#1f2937' : '#f3f4f6' },
          isUnread && { backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff' },
        ]}
      >
        {item.resource_type === 'newCampaignSubmission' ? (
          <CampaignThumb
            adId={item.body_metadata?.adId ?? item.resource_id}
            fallbackUrl={item.body_metadata?.mediaUrl}
            style={s.notifIconImage}
          />
        ) : showAvatar ? (
          <UserAvatar
            uri={actor.picture}
            name={actor.name ?? actor.handle}
            size={40}
            verified={!!actor.verified}
            userType={actor.user_type}
          />
        ) : (
          <View style={[s.notifIcon, { backgroundColor: icon.color + '18' }]}>
            <Ionicons name={icon.name as any} size={20} color={icon.color} />
          </View>
        )}
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

          {item.resource_type === 'newCampaignSubmission' && (
            <CampaignActions
              adId={item.body_metadata?.adId ?? item.resource_id}
              localDecided={decidedCampaigns[item.id]}
              busy={approvingCampaign || rejectingCampaign}
              isDark={isDark}
              onApprove={() => approveCampaignSubmission(item)}
              onReject={() => openCampaignRejectSheet(item)}
            />
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
            <Ionicons name="chevron-back" size={28} color={isDark ? '#fff' : '#000'} />
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
      <SafeAreaView style={[s.container, { backgroundColor: isDark ? '#000000' : '#fff' }]} edges={[]}>
        {isLoading ? (
          <View style={s.loadingWrap}><ActivityIndicator size="large" /></View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderNotification}
            renderSectionHeader={({ section }) => (
              <View style={[s.sectionHeader, { backgroundColor: isDark ? '#000000' : '#fff' }]}>
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
            onEndReached={loadMoreNotifications}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              hasMoreNotifications && isFetching && !refreshing ? (
                <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View>
              ) : null
            }
          />
        )}
      </SafeAreaView>

      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => {
          setActionSheetVisible(false);
          // Only clear the target if the user isn't chaining into the duration sheet.
          // ActionSheet runs onClose after every option press via an animated close,
          // so we rely on handlers to null the target when work completes.
          if (!durationSheetVisible) {
            // Defer clearing to next tick so an option's onPress (scheduled 250ms
            // after close) still has the target it needs.
            setTimeout(() => {
              if (!durationSheetVisibleRef.current) setAccessTarget(null);
            }, 400);
          }
        }}
        title={accessTarget?.handle ? `${accessTarget.handle}'s access request` : 'Access request'}
        options={actionSheetOptions}
      />
      <ApproveAccessRequestSheet
        visible={durationSheetVisible}
        handle={accessTarget?.handle ?? null}
        onClose={() => { setDurationSheetVisible(false); setAccessTarget(null); }}
        onConfirm={handleApproveWithDuration}
      />

      <ActionSheet
        visible={campaignRejectSheetVisible}
        onClose={() => {
          setCampaignRejectSheetVisible(false);
          setTimeout(() => setCampaignRejectTarget(null), 400);
        }}
        title={campaignRejectTarget?.headline
          ? `Reject "${campaignRejectTarget.headline}"`
          : 'Reject campaign'}
        options={campaignRejectOptions}
      />

      <Modal
        visible={!!campaignCustom}
        transparent
        animationType="fade"
        onRequestClose={() => setCampaignCustom(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.customOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCampaignCustom(null)} />
          <View style={[s.customCard, { backgroundColor: isDark ? '#111827' : '#fff' }]}>
            <Text style={[s.customTitle, { color: isDark ? '#fff' : '#111827' }]}>
              Reason for rejection
            </Text>
            <Text style={[s.customSubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
              The advertiser sees this on their campaign so they know what to fix.
            </Text>
            <TextInput
              autoFocus
              value={campaignCustomReason}
              onChangeText={setCampaignCustomReason}
              multiline
              maxLength={500}
              placeholder="Tell the advertiser exactly what to change…"
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
              style={[
                s.customInput,
                {
                  backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
                  color: isDark ? '#fff' : '#111827',
                },
              ]}
            />
            <View style={s.customBtnRow}>
              <Pressable
                onPress={() => setCampaignCustom(null)}
                disabled={rejectingCampaign}
                style={s.customCancelBtn}
              >
                <Text style={[s.customCancelText, { color: isDark ? '#9ca3af' : '#6b7280' }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitCustomReject}
                disabled={rejectingCampaign}
                style={[s.customRejectBtn, { opacity: rejectingCampaign ? 0.6 : 1 }]}
              >
                {rejectingCampaign ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.customRejectText}>Reject</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  notifIconImage: {
    width: 40, height: 40, borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  approveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rejectBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  customOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  customCard: {
    borderRadius: 16,
    padding: 18,
  },
  customTitle: { fontSize: 16, fontWeight: '700' },
  customSubtitle: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  customInput: {
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  customBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  customCancelBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  customCancelText: { fontSize: 14, fontWeight: '600' },
  customRejectBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    minWidth: 80,
    alignItems: 'center',
  },
  customRejectText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
