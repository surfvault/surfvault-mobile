import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Share,
  StyleSheet,
  useColorScheme,
  Platform,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../src/context/UserProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import ProfileHeader from '../../src/components/ProfileHeader';
import {
  useGetUserQuery,
  useGetUserSessionsQuery,
  useFollowUserMutation,
  useGetAdsQuery,
  useGetAccessRequestQuery,
  useRequestAccessToUserMutation,
} from '../../src/store';
import SessionCard from '../../src/components/SessionCard';
import ScreenHeader from '../../src/components/ScreenHeader';
import SponsoredCard from '../../src/components/SponsoredCard';
import { useUserCoords } from '../../src/hooks/useUserCoords';
import { AccessBanner, PrivateGalleryCard } from '../../src/components/PrivateGalleryGate';
import ContactUserSheet from '../../src/components/ContactUserSheet';
import UserSkeleton from '../../src/components/UserSkeleton';

export default function UserProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const { user: currentUser } = useUser();
  const requireAuth = useRequireAuth();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [activeTab, setActiveTab] = useState<'grid' | 'list'>('grid');
  const [sessions, setSessions] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const seenIdsRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const isFetchingMoreRef = useRef(false);

  const isSelf = currentUser?.handle === handle;

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
    await Share.share(
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

  const UserProfileHeader = () => (
    <ProfileHeader
      profile={profile}
      isDark={isDark}
      isSelf={isSelf}
      isFollowing={profile?.isFollowing}
      isFollowLoading={isFollowLoading}
      currentBreakName={profile?.surf_break_name}
      onFollow={handleFollow}
      onMessage={handleMessage}
      onShare={handleShare}
      onViewStats={(tab) => {
        if (handle) trackedPush(`/follow-stats/${handle}?tab=${tab}` as any);
      }}
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        left={
          <Pressable onPress={smartBack} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="chevron-back" size={28} color="#007AFF" />
            <Text style={{ fontSize: 17, color: '#007AFF' }}>{profile?.handle ?? handle}</Text>
          </Pressable>
        }
      />
      <SafeAreaView style={[styles.flex, { backgroundColor: isDark ? '#030712' : '#ffffff' }]} edges={[]}>
        {isLoading ? (
          <UserSkeleton />
        ) : (
          <FlatList
            data={isLocked ? [] : sessions}
            keyExtractor={(item) => item.session_id ?? item.id}
            numColumns={isLocked ? 1 : (activeTab === 'grid' ? 3 : 1)}
            key={isLocked ? 'locked' : (activeTab === 'grid' ? 'grid' : 'list')}
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
                            {new Date(item.session_date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Text>
                        )}
                      </View>
                    )}
                  </Pressable>
                );
              }
              return <SessionCard session={item} hidePhotographer />;
            }}
            ListHeaderComponent={
              <>
                <UserProfileHeader />
                {/* Grid / List tabs — hidden while gallery is locked */}
                {!isLocked && (
                  <View style={[styles.tabBar, { borderBottomColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
                    <Pressable onPress={() => setActiveTab('grid')} style={[styles.tabBtn, activeTab === 'grid' && styles.tabBtnActive]}>
                      <Ionicons name={activeTab === 'grid' ? 'grid' : 'grid-outline'} size={22} color={activeTab === 'grid' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
                    </Pressable>
                    <Pressable onPress={() => setActiveTab('list')} style={[styles.tabBtn, activeTab === 'list' && styles.tabBtnActive]}>
                      <Ionicons name={activeTab === 'list' ? 'list' : 'list-outline'} size={22} color={activeTab === 'list' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
                    </Pressable>
                  </View>
                )}
                <AccessBanner isPrivate={isPrivate} accessRequest={accessRequest} scope="profile" />
              </>
            }
            ListEmptyComponent={
              isLocked ? (
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
                        <SponsoredCard key={ad.id} ad={ad} placement="content" />
                      ))}
                    </>
                  )}
                </View>
              ) : null
            }
            ListFooterComponent={
              sessionsFetching ? <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View> : null
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
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
    maxWidth: '90%',
  },
  gridDateText: { fontSize: 9, fontWeight: '600', color: '#fff' },
});
