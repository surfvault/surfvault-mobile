import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Platform,
  Dimensions,
  RefreshControl,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useUser } from '../../src/context/UserProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useViewableItems } from '../../src/hooks/useViewableItems';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import ProfileHeader from '../../src/components/ProfileHeader';
import {
  useGetUserQuery,
  useGetUserSessionsQuery,
  useFollowUserMutation,
  useGetAdsQuery,
  useGetAccessRequestQuery,
  useRequestAccessToUserMutation,
  useDeleteSessionMutation,
  useBlockUserMutation,
  useUnblockUserMutation,
  useGetUserBlocksQuery,
} from '../../src/store';
import ReportUserSheet from '../../src/components/ReportUserSheet';
import ActionSheet, { type ActionSheetOption } from '../../src/components/ActionSheet';
import SessionCard from '../../src/components/SessionCard';
import ScreenHeader from '../../src/components/ScreenHeader';
import SponsoredCard from '../../src/components/SponsoredCard';
import { useUserCoords } from '../../src/hooks/useUserCoords';
import { AccessBanner, PrivateGalleryCard, BlockedGalleryCard } from '../../src/components/PrivateGalleryGate';
import ContactUserSheet from '../../src/components/ContactUserSheet';
import UserSkeleton from '../../src/components/UserSkeleton';
import ShaperBoardsGrid from '../../src/components/ShaperBoardsGrid';
import ProfileFilmsGrid from '../../src/components/ProfileFilmsGrid';
import AdvertiserAdsGrid from '../../src/components/AdvertiserAdsGrid';
import FilmsGrid from '../../src/components/FilmsGrid';
import PaymentSheet, { hasPaymentChannels, acceptsDonations } from '../../src/components/PaymentSheet';
import { formatSessionDate } from '../../src/helpers/dateTime';
import { safeShare, openUrl } from '../../src/helpers/share';
import { youtubeUrl } from '../../src/helpers/socialLinks';

export default function UserProfileScreen() {
  const { handle, view } = useLocalSearchParams<{ handle: string; view?: string }>();
  const router = useRouter();
  const { user: currentUser } = useUser();
  const requireAuth = useRequireAuth();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const { viewabilityConfig, onViewableItemsChanged, isItemViewable, screenFocused } = useViewableItems();
  const isDark = colorScheme === 'dark';

  const [activeTab, setActiveTab] = useState<'grid' | 'list' | 'films'>('grid');
  // Honor a ?view= deep-link (from the search profile-rail "See all"). 'films'
  // maps to the Films tab; anything else → grid. (No tagged tab on mobile.)
  useEffect(() => {
    setActiveTab(view === 'films' ? 'films' : 'grid');
  }, [handle, view]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const seenIdsRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const isFetchingMoreRef = useRef(false);

  const isSelf = currentUser?.handle === handle;

  // Block / report state. The ellipsis on the non-self profile header opens
  // the bottom ActionSheet (Share / Report / Block / Unblock). RTK Query
  // cache invalidation on the block mutation refetches feeds/follow lists/
  // conversations server-side.
  const [reportVisible, setReportVisible] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  // Off-platform pay/tip sheet, opened from the nav-bar pay icon (read-only view).
  const [payOpen, setPayOpen] = useState(false);
  const [blockUser, { isLoading: isBlocking }] = useBlockUserMutation();
  const [unblockUser, { isLoading: isUnblocking }] = useUnblockUserMutation();
  const { data: blocksData } = useGetUserBlocksQuery(undefined, { skip: isSelf });
  const blockedUsers = blocksData?.results?.blockedUsers ?? [];

  // Self-only: tile ellipsis confirms delete via the existing session
  // mutation. Mirrors the chrome of the shaper grid ellipsis.
  const [deleteSession] = useDeleteSessionMutation();
  const handleDeleteOwnSession = useCallback((sid: string, name?: string) => {
    if (!sid) return;
    Alert.alert(
      'Delete session?',
      `${name ? `"${name}"` : 'This session'} and all its photos will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Proactive: remove from the visible grid immediately, restore on
            // failure. Capturing inside the updater reads the live list.
            let prevSessions: any[] | null = null;
            setSessions((prev) => {
              prevSessions = prev;
              return prev.filter((s) => (s.session_id ?? s.id) !== sid);
            });
            const hadSeen = seenIdsRef.current.delete(sid);
            try {
              await deleteSession({ sessionId: sid, force: false }).unwrap();
            } catch (err: any) {
              if (prevSessions) setSessions(prevSessions);
              if (hadSeen) seenIdsRef.current.add(sid);
              Alert.alert('Delete failed', err?.data?.message || err?.message || 'Try again');
            }
          },
        },
      ],
    );
  }, [deleteSession]);

  // Profile data
  const { data: userData, isLoading, refetch: refetchUser } = useGetUserQuery({
    handle: handle ?? '',
    viewerId: currentUser?.id,
  });
  const profile = userData?.results?.photographer ?? userData?.results;

  // Sessions
  const { data: sessionsData, isFetching: sessionsFetching, refetch: refetchSessions } = useGetUserSessionsQuery(
    { handle: handle ?? '', selfFlag: isSelf, limit: 10, continuationToken },
    { skip: !profile }
  );

  // Access request (for private profiles). Force fresh reads on mount, focus,
  // reconnect, and every 10s — so approve/reject decisions made on another
  // device propagate without the viewer having to pull-to-refresh.
  const isPrivate = profile?.access === 'private' && !isSelf;
  const { data: accessData, refetch: refetchAccess } = useGetAccessRequestQuery(
    { photographerHandle: handle ?? '' },
    {
      skip: !currentUser || !isPrivate || !handle,
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }
  );
  const accessRequest = accessData?.results?.accessRequest;
  const isLocked = isPrivate && accessRequest?.access_status !== 'approved';

  useEffect(() => {
    if (!isPrivate) return;
    if (accessRequest?.access_status === 'approved') return;
    const id = setInterval(() => { refetchAccess(); }, 10000);
    return () => clearInterval(id);
  }, [isPrivate, accessRequest?.access_status, refetchAccess]);
  const [requestAccessToUser, { isLoading: isSendingRequest }] = useRequestAccessToUserMutation();
  const handleRequestAccess = useCallback(() => {
    if (!requireAuth()) return;
    if (!handle) return;
    if (accessRequest?.access_status === 'pending') return;
    requestAccessToUser({ photographerHandle: handle });
  }, [requireAuth, handle, accessRequest, requestAccessToUser]);

  // Local ads for empty-state treatment: if the photographer has zero sessions,
  // show local-to-viewer sponsored cards so the page never looks barren.
  const { lat: viewerLat, lon: viewerLon, hasCoords } = useUserCoords();
  const { data: adsData } = useGetAdsQuery({
    feed: true,
    lat: hasCoords && viewerLat != null ? viewerLat : undefined,
    lon: hasCoords && viewerLon != null ? viewerLon : undefined,
    placement: 'content',
    limit: 3,
  });
  const emptyStateAds = ((adsData?.results?.ads as any[]) || []).filter(
    (a) => a.placement_key === 'content'
  );

  useEffect(() => {
    const results = sessionsData?.results;
    if (!results) return;
    const sessionsList = results.sessions ?? [];
    const nextToken = results.continuationToken || '';
    hasMoreRef.current = Boolean(nextToken);

    if (!continuationToken) {
      // Initial load — replace all
      seenIdsRef.current = new Set();
      const unique = sessionsList.filter((s: any) => {
        const key = s.session_id ?? s.id;
        if (!key || seenIdsRef.current.has(key)) return false;
        seenIdsRef.current.add(key);
        return true;
      });
      setSessions(unique);
    } else {
      // Paginated load — append
      setSessions((prev) => {
        const newItems: any[] = [];
        for (const s of sessionsList) {
          const key = s.session_id ?? s.id;
          if (!key) continue;
          if (!seenIdsRef.current.has(key)) {
            seenIdsRef.current.add(key);
            newItems.push(s);
          }
        }
        return newItems.length ? prev.concat(newItems) : prev;
      });
    }
    isFetchingMoreRef.current = false;
  }, [sessionsData]);

  const handleLoadMore = useCallback(() => {
    if (!hasMoreRef.current || isFetchingMoreRef.current || sessionsFetching) return;
    const nextToken = sessionsData?.results?.continuationToken;
    if (!nextToken) return;
    isFetchingMoreRef.current = true;
    setContinuationToken(nextToken);
  }, [sessionsData, sessionsFetching]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    seenIdsRef.current = new Set();
    setContinuationToken('');
    try {
      await Promise.all([
        refetchUser(),
        refetchSessions(),
        isPrivate ? refetchAccess() : Promise.resolve(),
      ]);
    } catch {}
    setRefreshing(false);
  }, [refetchUser, refetchSessions, refetchAccess, isPrivate]);

  // Refetch latest access state whenever the screen regains focus — covers
  // cases where the owner approves/rejects from another device while we're
  // backgrounded or sitting on a different screen.
  useFocusEffect(
    useCallback(() => {
      if (isPrivate) refetchAccess();
    }, [isPrivate, refetchAccess])
  );

  // Follow
  const [followUser, { isLoading: isFollowLoading }] = useFollowUserMutation();
  const handleFollow = useCallback(() => {
    if (!requireAuth()) return;
    if (!profile?.id) return;
    const action = profile.isFollowing ? 'unfollow' : 'follow';
    followUser({ userId: profile.id, action });
  }, [profile, requireAuth, followUser]);

  // Message — open existing convo or compose sheet for a new one
  const [contactSheetVisible, setContactSheetVisible] = useState(false);

  // Share profile
  const handleShare = useCallback(async () => {
    const shareUrl = `https://app.surf-vault.com/${handle}`;
    await safeShare(
      Platform.OS === 'ios' ? { url: shareUrl } : { message: shareUrl }
    );
  }, [handle]);

  // Message
  const handleMessage = useCallback(() => {
    if (!requireAuth()) return;
    if (profile?.conversationId) {
      trackedPush(`/conversation/${profile.conversationId}` as any);
      return;
    }
    setContactSheetVisible(true);
  }, [requireAuth, profile, trackedPush]);

  const handleConversationStarted = useCallback((conversationId: string) => {
    trackedPush(`/conversation/${conversationId}` as any);
  }, [trackedPush]);

  // Source of truth: API flag (computed server-side in getUser). Fallback to
  // the local blocks list so optimistic states render correctly between the
  // block mutation and the profile refetch.
  const isBlocked = !!profile?.isBlockedByMe || (!!profile?.id && blockedUsers.some((b) => b.id === profile.id));

  const handleBlock = useCallback(() => {
    if (!profile?.id || !profile?.handle) return;
    Alert.alert(
      `Block @${profile.handle}?`,
      "They won't be able to message you or request access to your photos. You'll stop seeing their content. Existing conversations stay visible.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser({ userId: profile.id }).unwrap();
            } catch (e: any) {
              Alert.alert('Could not block', e?.data?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  }, [profile, blockUser]);

  const handleUnblock = useCallback(() => {
    if (!profile?.id || !profile?.handle) return;
    Alert.alert(
      `Unblock @${profile.handle}?`,
      "They'll be able to message you and you'll see their content again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await unblockUser({ userId: profile.id }).unwrap();
            } catch (e: any) {
              Alert.alert('Could not unblock', e?.data?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  }, [profile, unblockUser]);

  const handleMoreOptions = useCallback(() => {
    if (!requireAuth()) return;
    setActionSheetVisible(true);
  }, [requireAuth]);

  const UserProfileHeader = () => (
    <ProfileHeader
      profile={profile}
      isDark={isDark}
      isSelf={isSelf}
      isFollowing={profile?.isFollowing}
      isFollowLoading={isFollowLoading}
      currentBreakName={profile?.surf_break_name}
      // Hide Follow/Message when blocked — those actions would 403 server-side.
      // The unblock CTA in the BlockedGalleryCard + ellipsis menu carries the
      // single sensible action.
      onFollow={isBlocked ? undefined : handleFollow}
      onMessage={isBlocked ? undefined : handleMessage}
      // Share moved into the more-options ActionSheet on non-self profiles
      // so the header chrome stays minimal (Follow / Message / •••).
      onShare={isSelf ? handleShare : undefined}
      // When blocked, the only sensible action is Unblock — already exposed
      // on the BlockedGalleryCard below. Hide the ellipsis to avoid an empty
      // sheet duplicating the same CTA.
      onMoreOptions={isSelf || isBlocked ? undefined : handleMoreOptions}
      onViewStats={(tab) => {
        if (handle) trackedPush(`/follow-stats/${handle}?tab=${tab}` as any);
      }}
    />
  );

  // Social links — surfaced as rows in the more-options sheet (no longer
  // shown top-right in the header). Brand-colored glyphs; each opens the URL.
  const socialOptions = [
    profile?.instagram && {
      label: 'Instagram',
      icon: 'logo-instagram' as const,
      iconColor: '#ec4899',
      onPress: () => openUrl(`https://instagram.com/${String(profile.instagram).replace(/^@/, '')}`),
    },
    profile?.youtube && {
      label: 'YouTube',
      icon: 'logo-youtube' as const,
      iconColor: '#ef4444',
      onPress: () => { const u = youtubeUrl(profile.youtube as string); if (u) openUrl(u); },
    },
    profile?.website && {
      label: 'Website',
      icon: 'link-outline' as const,
      iconColor: '#3b82f6',
      onPress: () =>
        openUrl(String(profile.website).startsWith('http') ? profile.website : `https://${profile.website}`),
    },
  ].filter(Boolean) as ActionSheetOption[];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        left={
          <Pressable onPress={smartBack} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
            <Ionicons name="chevron-back" size={28} color={isDark ? '#fff' : '#000'} />
            <Text
              numberOfLines={1}
              style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#fff' : '#111827', flexShrink: 1 }}
            >
              {profile?.handle ?? handle}
            </Text>
          </Pressable>
        }
        right={
          !isSelf && hasPaymentChannels(profile) ? (
            <Pressable onPress={() => setPayOpen(true)} hitSlop={10} style={{ padding: 4 }}>
              {acceptsDonations(profile) ? (
                <FontAwesome5 name="mug-hot" size={22} color="#f59e0b" />
              ) : (
                <Ionicons name="cash-outline" size={24} color={isDark ? '#fff' : '#111827'} />
              )}
            </Pressable>
          ) : undefined
        }
      />
      <SafeAreaView style={[styles.flex, { backgroundColor: isDark ? '#000000' : '#ffffff' }]} edges={[]}>
        {isLoading ? (
          <UserSkeleton />
        ) : profile?.user_type === 'shaper' ? (
          // Shapers don't have surf sessions — render their board gallery
          // (using the new boards/board_photos schema). Grid/List tabs share
          // the same activeTab state used for non-shaper profiles since
          // both modes are 'grid' | 'list'. Tagged is intentionally skipped
          // here — it's only on the self-profile tab page (per spec).
          <FlatList
            data={[1] as const}
            keyExtractor={() => 'shaper-content'}
            renderItem={() => (
              <ShaperBoardsGrid
                handle={handle ?? ''}
                mode={activeTab === 'films' ? 'grid' : activeTab}
                isSelf={!!currentUser?.handle && handle === currentUser.handle}
              />
            )}
            ListHeaderComponent={
              <>
                <UserProfileHeader />
                <View style={[styles.tabBar, { borderBottomColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
                  <Pressable onPress={() => setActiveTab('grid')} style={[styles.tabBtn, activeTab === 'grid' && styles.tabBtnActive]}>
                    <Ionicons name={activeTab === 'grid' ? 'grid' : 'grid-outline'} size={22} color={activeTab === 'grid' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
                  </Pressable>
                  <Pressable onPress={() => setActiveTab('list')} style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}>
                    <Ionicons name={activeTab === 'list' ? 'list' : 'list-outline'} size={22} color={activeTab === 'list' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
                  </Pressable>
                </View>
              </>
            }
            showsVerticalScrollIndicator={false}
          />
        ) : profile?.user_type === 'advertiser' ? (
          // Advertisers don't have surf sessions — render their campaign
          // gallery. Backend gates the response: public viewers see only
          // approved+active; advertiser-self (matched via JWT) sees all
          // statuses with status pills.
          <FlatList
            data={[1] as const}
            keyExtractor={() => 'advertiser-content'}
            renderItem={() => (
              <AdvertiserAdsGrid
                handle={handle ?? ''}
                mode={activeTab === 'films' ? 'grid' : activeTab}
                isSelf={!!currentUser?.handle && handle === currentUser.handle}
              />
            )}
            ListHeaderComponent={
              <>
                <UserProfileHeader />
                <View style={[styles.tabBar, { borderBottomColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
                  <Pressable onPress={() => setActiveTab('grid')} style={[styles.tabBtn, activeTab === 'grid' && styles.tabBtnActive]}>
                    <Ionicons name={activeTab === 'grid' ? 'grid' : 'grid-outline'} size={22} color={activeTab === 'grid' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
                  </Pressable>
                  <Pressable onPress={() => setActiveTab('list')} style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}>
                    <Ionicons name={activeTab === 'list' ? 'list' : 'list-outline'} size={22} color={activeTab === 'list' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
                  </Pressable>
                </View>
              </>
            }
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <FlatList
            data={isBlocked || isLocked || activeTab === 'films' ? [] : sessions}
            keyExtractor={(item) => item.session_id ?? item.id}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            numColumns={isBlocked || isLocked ? 1 : (activeTab === 'grid' ? 3 : 1)}
            key={isBlocked ? 'blocked' : (isLocked ? 'locked' : (activeTab === 'grid' ? 'grid' : 'list'))}
            renderItem={({ item }) => {
              if (activeTab === 'grid') {
                const GAP = 1;
                const SIZE = (Dimensions.get('window').width - GAP * 2) / 3;
                return (
                  <Pressable
                    onPress={() => {
                      const sid = item.session_id ?? item.id;
                      if (sid) trackedPush(`/session/${sid}` as any);
                    }}
                    onLongPress={isSelf ? () => handleDeleteOwnSession(item.session_id ?? item.id, item.session_name) : undefined}
                    style={{ width: SIZE, height: SIZE * 1.3, margin: GAP / 2 }}
                  >
                    {item.thumbnail ? (
                      <Image source={{ uri: item.thumbnail }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : (
                      <View style={{ width: '100%', height: '100%', backgroundColor: isDark ? '#1f2937' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="image-outline" size={24} color={isDark ? '#374151' : '#d1d5db'} />
                      </View>
                    )}
                    {(item.session_date || item.surf_break_name) && (
                      <View style={styles.gridDate}>
                        {item.surf_break_name && !item.hide_location && (
                          <Text style={styles.gridDateText} numberOfLines={1}>{item.surf_break_name}</Text>
                        )}
                        {item.session_date && (
                          <Text style={[styles.gridDateText, { opacity: 0.75 }]}>
                            {formatSessionDate(item.session_date)}
                          </Text>
                        )}
                      </View>
                    )}
                    {/* Video thumbnail indicator — tile navigates, so a center
                        videocam badge (not a ▶). */}
                    {item.thumbnail_media_type === 'video' && (
                      <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        <View style={styles.gridVideoBadgeWrap}>
                          <View style={styles.gridVideoBadge}>
                            <Ionicons name="videocam" size={14} color="#fff" />
                          </View>
                        </View>
                      </View>
                    )}
                    {(() => {
                      const videoCount = item.video_count ?? 0;
                      // photo_count is TOTAL media; subtract videos to avoid double-counting.
                      const photoOnly = Math.max(0, (item.photo_count ?? 0) - videoCount);
                      if (photoOnly === 0 && videoCount === 0) return null;
                      return (
                        <View style={styles.gridPhotoBadge} pointerEvents="none">
                          {photoOnly > 0 && (
                            <>
                              <Ionicons name="images-outline" size={10} color="#fff" />
                              <Text style={styles.gridPhotoBadgeText}>{photoOnly}</Text>
                            </>
                          )}
                          {photoOnly > 0 && videoCount > 0 && <Text style={styles.gridPhotoBadgeText}> </Text>}
                          {videoCount > 0 && (
                            <>
                              <Ionicons name="videocam-outline" size={10} color="#fff" />
                              <Text style={styles.gridPhotoBadgeText}>{videoCount}</Text>
                            </>
                          )}
                        </View>
                      );
                    })()}
                    {isSelf && (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeleteOwnSession(item.session_id ?? item.id, item.session_name);
                        }}
                        hitSlop={6}
                        style={styles.gridEllipsisBtn}
                      >
                        <Ionicons name="ellipsis-horizontal" size={14} color="#fff" />
                      </Pressable>
                    )}
                  </Pressable>
                );
              }
              return <SessionCard session={item} hidePhotographer compact hideFavoriteBreak isViewable={isItemViewable(item.session_id ?? item.id)} />;
            }}
            ListHeaderComponent={
              <>
                <UserProfileHeader />
                {/* Grid / List tabs — hidden while gallery is locked or blocked */}
                {!isLocked && !isBlocked && (
                  <View style={[styles.tabBar, { borderBottomColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
                    <Pressable onPress={() => setActiveTab('grid')} style={[styles.tabBtn, activeTab === 'grid' && styles.tabBtnActive]}>
                      <Ionicons name={activeTab === 'grid' ? 'grid' : 'grid-outline'} size={22} color={activeTab === 'grid' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
                    </Pressable>
                    <Pressable onPress={() => setActiveTab('list')} style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}>
                      <Ionicons name={activeTab === 'list' ? 'list' : 'list-outline'} size={22} color={activeTab === 'list' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
                    </Pressable>
                    <Pressable onPress={() => setActiveTab('films')} style={[styles.tabBtn, activeTab === 'films' && styles.tabBtnActive]}>
                      <Ionicons name={activeTab === 'films' ? 'videocam' : 'videocam-outline'} size={22} color={activeTab === 'films' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
                    </Pressable>
                  </View>
                )}
                <AccessBanner isPrivate={isPrivate} accessRequest={accessRequest} scope="profile" />
                {activeTab === 'films' && !isLocked && !isBlocked && handle ? (
                  <ProfileFilmsGrid
                    handle={handle}
                    scope={isSelf ? 'mine' : undefined}
                    verifiedOnly={!isSelf}
                    emptyText="No films yet."
                  />
                ) : null}
              </>
            }
            ListEmptyComponent={
              isBlocked ? (
                <BlockedGalleryCard
                  handle={profile?.handle}
                  onUnblock={handleUnblock}
                  isUnblocking={isUnblocking}
                />
              ) : isLocked ? (
                <PrivateGalleryCard
                  scope="profile"
                  accessRequest={accessRequest}
                  onRequestAccess={handleRequestAccess}
                  isSending={isSendingRequest}
                />
              ) : sessionsData && !sessionsFetching ? (
                <View style={{ paddingVertical: 32, paddingHorizontal: 12 }}>
                  <View style={{ alignItems: 'center', paddingBottom: 24 }}>
                    <Text style={{ color: '#9ca3af' }}>No sessions yet</Text>
                  </View>
                  {emptyStateAds.length > 0 && (
                    <>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? '#fff' : '#111827', marginBottom: 2 }}>
                        Local businesses
                      </Text>
                      <Text style={{ fontSize: 12, color: isDark ? '#9ca3af' : '#6b7280', marginBottom: 16 }}>
                        Support the surf community near you
                      </Text>
                      {emptyStateAds.slice(0, 3).map((ad) => (
                        <SponsoredCard key={ad.id} ad={ad} placement="content" isViewable={screenFocused} />
                      ))}
                    </>
                  )}
                </View>
              ) : null
            }
            ListFooterComponent={
              <>
                {/* Surf films this user created / is tagged in. Self-hides when
                    empty so non-film profiles show nothing extra. Hidden while
                    the gallery is locked/blocked. */}
                {!isBlocked && !isLocked && handle ? (
                  <FilmsGrid handle={handle} title="Surf Films" hideWhenEmpty />
                ) : null}
                {sessionsFetching ? <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View> : null}
              </>
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          />
        )}
      </SafeAreaView>

      <ContactUserSheet
        visible={contactSheetVisible}
        user={profile ? { id: profile.id, handle: profile.handle } : null}
        onClose={() => setContactSheetVisible(false)}
        onSent={handleConversationStarted}
      />

      <ReportUserSheet
        visible={reportVisible}
        userId={profile?.id}
        userHandle={profile?.handle}
        onClose={() => setReportVisible(false)}
      />

      <PaymentSheet
        profile={profile}
        isDark={isDark}
        visible={payOpen}
        onClose={() => setPayOpen(false)}
      />

      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        header={{
          title: profile?.name ?? profile?.handle ?? 'User',
          subtitle: profile?.handle ? `@${profile.handle}` : undefined,
          imageUri: profile?.picture || undefined,
        }}
        sections={[
          {
            options: [{
              label: 'Share Profile',
              icon: 'share-outline',
              onPress: handleShare,
            }],
          },
          ...(socialOptions.length ? [{ options: socialOptions }] : []),
          ...(isBlocked
            ? [{
                options: [{
                  label: 'Unblock User',
                  icon: 'lock-open-outline' as const,
                  onPress: handleUnblock,
                }],
              }]
            : [{
                options: [
                  {
                    label: 'Report User',
                    icon: 'flag-outline' as const,
                    destructive: true,
                    onPress: () => setReportVisible(true),
                  },
                  {
                    label: 'Block User',
                    icon: 'ban-outline' as const,
                    destructive: true,
                    onPress: handleBlock,
                  },
                ],
              }]),
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profileWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },

  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rightColumn: { flex: 1, marginLeft: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingRight: 16 },
  statItem: { alignItems: 'flex-start' },
  statNumber: { fontSize: 15, fontWeight: '600' },
  statLabel: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  nameRowOuter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameAndDot: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  nameText: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  rolePill: { borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  rolePillText: { fontSize: 12 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  socialIcons: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 2 },

  bioText: { fontSize: 14, lineHeight: 19, marginBottom: 8 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  tagPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },

  statusNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
  },

  actionRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  iconBtn: { width: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  divider: { height: 1, marginBottom: 8 },
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 2 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#111827' },
  gridDate: {
    position: 'absolute', top: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
    maxWidth: '90%',
  },
  gridDateText: { fontSize: 9, fontWeight: '600', color: '#fff' },
  // Bottom-left photo count badge — same chrome as the shaper grid badge
  // so any user_type's profile tiles read consistently.
  gridPhotoBadge: {
    position: 'absolute', bottom: 4, left: 4,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  gridPhotoBadgeText: { fontSize: 10, fontWeight: '600', color: '#fff' },
  gridVideoBadgeWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  gridVideoBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Bottom-right ellipsis (self only). Matches shaper grid ellipsisBtn.
  gridEllipsisBtn: {
    position: 'absolute', bottom: 4, right: 4,
    width: 22, height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
});
