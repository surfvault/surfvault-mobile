import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  RefreshControl,
  ScrollView,
  Pressable,
  StyleSheet,
  useColorScheme,
  Platform,
  Linking,
  ActivityIndicator,
  Keyboard,
  Dimensions,
  KeyboardAvoidingView,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTrackedPush } from '../../src/context/NavigationContext';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../src/context/UserProvider';
import { useAuth } from '../../src/context/AuthProvider';
import { useKeyboardVisible } from '../../src/hooks/useKeyboardVisible';
import {
  useGetUserQuery,
  useGetUserSessionsQuery,
  useGetUserFavoritesQuery,
  useGetSurfBreaksQuery,
  useUpdateUserMetaDataMutation,
  useUpdateUserFavoritesMutation,
  useGetNotificationsQuery,
  useDeleteSessionMutation,
} from '../../src/store';
import { useTabBar } from '../../src/context/TabBarContext';
import ProfileHeader from '../../src/components/ProfileHeader';
import SessionCard from '../../src/components/SessionCard';
import ActionSheet from '../../src/components/ActionSheet';
import type { ActionSheetSection } from '../../src/components/ActionSheet';
import ProfileSkeleton from '../../src/components/ProfileSkeleton';

const formatCount = (n: number): string => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
};

export default function ProfileScreen() {
  const router = useRouter();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { visible: kbVisible, height: kbHeight } = useKeyboardVisible();
  const { user } = useUser();
  const { isAuthenticated, login, logout } = useAuth();
  const [updateMeta] = useUpdateUserMetaDataMutation();
  const { setTabBarVisible } = useTabBar();

  const [activeTab, setActiveTab] = useState<'grid' | 'list' | 'favorites'>('grid');
  const [menuVisible, setMenuVisible] = useState(false);

  // Session long-press action sheet
  const [sessionSheetVisible, setSessionSheetVisible] = useState(false);
  const [sessionSheetItem, setSessionSheetItem] = useState<any>(null);
  const [deleteSession] = useDeleteSessionMutation();

  const confirmAndDeleteSession = (sid: string, name: string, photoCount?: number) => {
    Alert.alert(
      'Delete Session',
      `This will permanently delete "${name}" and everything associated with it:\n\n` +
        `• All photos${photoCount ? ` (${photoCount})` : ''} and their originals from storage\n` +
        `• All photo groups and assignments\n` +
        `• All tagged users\n` +
        `• All access requests\n` +
        `• All related notifications\n\n` +
        `This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => runDelete(sid, name, false),
        },
      ],
    );
  };

  const runDelete = async (sid: string, name: string, force: boolean) => {
    try {
      await deleteSession({ sessionId: sid, force }).unwrap();
      Alert.alert('Deleted', 'Session deleted successfully.');
    } catch (err: any) {
      const data = err?.data;
      if (err?.status === 409 && data?.code === 'UNFULFILLED_ACCESS_REQUESTS') {
        const requests = data.results?.unfulfilledRequests ?? [];
        const names = requests
          .map((r: any) => {
            const display =
              r.firstName || r.lastName
                ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()
                : `@${r.handle}`;
            return `• ${display} (${r.photoCount} photo${r.photoCount === 1 ? '' : 's'})`;
          })
          .join('\n');
        const count = requests.length;
        Alert.alert(
          'Undelivered access requests',
          `${count === 1 ? '1 surfer has' : `${count} surfers have`} approved access to this session but haven't saved to their vault or downloaded yet. Deleting now may leave them with nothing.\n\n${names}`,
          [
            { text: 'Keep Session', style: 'cancel' },
            {
              text: 'Delete Anyway',
              style: 'destructive',
              onPress: () => runDelete(sid, name, true),
            },
          ],
        );
        return;
      }
      Alert.alert('Error', 'Failed to delete session.');
    }
  };

  // Fetch public profile data for follower/following counts
  const { data: publicProfileData } = useGetUserQuery(
    { handle: user?.handle ?? '', viewerId: user?.id },
    { skip: !user?.handle }
  );
  const publicProfile = publicProfileData?.results?.photographer;

  // Merge self data with public profile counts
  const profileWithCounts = user ? {
    ...user,
    followersCount: publicProfile?.followersCount ?? user?.follower_count ?? 0,
    followingCount: publicProfile?.followingCount ?? user?.following_count ?? 0,
    surfBreaksCount: publicProfile?.surfBreaksCount ?? user?.my_spots?.length ?? 0,
  } : user;

  const storageUsed = parseFloat(String(user?.current_storage ?? 0)) || 0;
  const storageLimit = parseFloat(String(user?.storage_limit ?? 15)) || 15;

  // Break selector
  const [showBreakSearch, setShowBreakSearch] = useState(false);
  const [breakSearch, setBreakSearch] = useState('');
  const [debouncedBreakSearch, setDebouncedBreakSearch] = useState('');
  const breakDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breakSearchInputRef = useRef<any>(null);

  const { data: breaksData, isFetching: searchingBreaks } = useGetSurfBreaksQuery(
    { search: debouncedBreakSearch, limit: 10, continuationToken: '' },
    { skip: debouncedBreakSearch.length < 2 }
  );
  const breakResults = breaksData?.results?.breaks ?? breaksData?.results?.surfBreaks ?? [];

  const currentBreakName = (user as any)?.surf_break_name ?? (user as any)?.surfBreakName;

  // Status note editor
  const STATUS_NOTE_MAX = 150;
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteText, setNoteText] = useState('');
  const noteInputRef = useRef<any>(null);

  const handleOpenNoteEditor = useCallback(() => {
    setNoteText((user?.status_note as string) ?? '');
    setShowNoteEditor(true);
    setTabBarVisible(false);
    setTimeout(() => noteInputRef.current?.focus(), 100);
  }, [user, setTabBarVisible]);

  const handleSaveNote = useCallback(async () => {
    await updateMeta({ metaData: { status_note: noteText.trim() || '' } });
    setShowNoteEditor(false);
    setTabBarVisible(true);
    Keyboard.dismiss();
  }, [noteText, updateMeta, setTabBarVisible]);

  const handleClearNote = useCallback(async () => {
    await updateMeta({ metaData: { status_note: '' } });
    setShowNoteEditor(false);
    setTabBarVisible(true);
    setNoteText('');
    Keyboard.dismiss();
  }, [updateMeta, setTabBarVisible]);

  const handleCloseNoteEditor = useCallback(() => {
    setShowNoteEditor(false);
    setTabBarVisible(true);
    Keyboard.dismiss();
  }, [setTabBarVisible]);

  const handleBreakSearchInput = useCallback((text: string) => {
    setBreakSearch(text);
    if (breakDebounceRef.current) clearTimeout(breakDebounceRef.current);
    breakDebounceRef.current = setTimeout(() => setDebouncedBreakSearch(text), 400);
  }, []);

  const handleSelectBreak = useCallback(async (brk: any) => {
    setShowBreakSearch(false);
    setTabBarVisible(true);
    setBreakSearch('');
    setDebouncedBreakSearch('');
    Keyboard.dismiss();
    await updateMeta({ metaData: { surf_break_id: brk.id } });
  }, [updateMeta, setTabBarVisible]);

  const handleOpenBreakSearch = useCallback(() => {
    setShowBreakSearch(true);
    setTabBarVisible(false);
    setTimeout(() => breakSearchInputRef.current?.focus(), 100);
  }, [setTabBarVisible]);

  // Notifications count
  const { data: notifData } = useGetNotificationsQuery(
    { read: false, filter: '', limit: 0, continuationToken: '' },
    { skip: !isAuthenticated }
  );
  const unreadNotifCount = isAuthenticated
    ? (notifData?.results?.notifications?.length ?? 0)
    : 0;

  // Favorites
  const { data: favoritesData } = useGetUserFavoritesQuery({} as any, { skip: !isAuthenticated });
  const [updateFavorite] = useUpdateUserFavoritesMutation();
  const favorites = isAuthenticated ? (favoritesData?.results?.favorites ?? []) : [];

  // Sessions
  const [sessions, setSessions] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const seenIdsRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const isFetchingMoreRef = useRef(false);

  const [refreshing, setRefreshing] = useState(false);

  const { data: sessionsData, isFetching, refetch: refetchSessions } = useGetUserSessionsQuery(
    { handle: user?.handle ?? '', selfFlag: true, limit: 10, continuationToken },
    { skip: !user?.handle }
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setContinuationToken('');
    await refetchSessions();
    setRefreshing(false);
  }, [refetchSessions]);

  // Reset sessions list when the current user changes (logout/login/switch user)
  useEffect(() => {
    seenIdsRef.current = new Set();
    setSessions([]);
    setContinuationToken('');
  }, [user?.id]);

  useEffect(() => {
    const results = sessionsData?.results;
    if (!results) return;
    const list = results.sessions ?? [];
    const nextToken = results.continuationToken || '';
    hasMoreRef.current = Boolean(nextToken);

    if (!continuationToken) {
      // Initial load — replace all
      seenIdsRef.current = new Set();
      const unique = list.filter((s: any) => {
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
        for (const s of list) {
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
    if (!hasMoreRef.current || isFetchingMoreRef.current || isFetching) return;
    const nextToken = sessionsData?.results?.continuationToken;
    if (!nextToken) return;
    isFetchingMoreRef.current = true;
    setContinuationToken(nextToken);
  }, [sessionsData, isFetching]);

  const handleToggleActive = useCallback(async () => {
    if (!user) return;
    await updateMeta({ metaData: { active: !user.active } });
  }, [user, updateMeta]);

  const handleMenu = useCallback(() => setMenuVisible(true), []);

  const menuSections: ActionSheetSection[] = [
    {
      options: [
        {
          label: 'Edit Profile',
          icon: 'create-outline',
          onPress: () => trackedPush('/edit-profile'),
        },
        {
          label: 'Share Profile',
          icon: 'share-outline',
          onPress: () => {
            const shareUrl = `https://app.surf-vault.com/${user?.handle}`;
            Share.share(Platform.OS === 'ios' ? { url: shareUrl } : { message: shareUrl });
          },
        },
      ],
    },
    {
      options: [
        {
          label: 'Manage Favorites',
          icon: 'heart-outline',
          onPress: () => trackedPush('/manage-favorites'),
        },
        {
          label: 'Account',
          icon: 'person-circle-outline',
          onPress: () => trackedPush('/account'),
        },
        {
          label: 'Settings',
          icon: 'settings-outline',
          onPress: () => Linking.openSettings(),
        },
      ],
    },
    {
      options: [
        {
          label: 'Sign Out',
          icon: 'log-out-outline',
          destructive: true,
          onPress: logout,
        },
      ],
    },
  ];

  const handleSessionLongPress = useCallback((item: any) => {
    setSessionSheetItem(item);
    setSessionSheetVisible(true);
  }, []);

  // Authenticated but user data hasn't loaded yet (Auth0 → getSelf window).
  // Render a skeleton so we never flash empty placeholders ("@", 0 counts,
  // empty storage bar) while the real data arrives.
  if (isAuthenticated && !user?.handle) {
    return <ProfileSkeleton />;
  }

  // Not logged in
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={['top']}>
        <View style={s.emptyWrap}>
          <View style={s.emptyIconRow}>
            <View style={[s.emptyIconCircle, { backgroundColor: isDark ? '#1f2937' : '#f0f9ff' }]}>
              <Ionicons name="person-outline" size={24} color="#0ea5e9" />
            </View>
            <View style={[s.emptyIconCircle, { backgroundColor: isDark ? '#1f2937' : '#fef3c7' }]}>
              <Ionicons name="stats-chart-outline" size={24} color="#f59e0b" />
            </View>
            <View style={[s.emptyIconCircle, { backgroundColor: isDark ? '#1f2937' : '#f5f3ff' }]}>
              <Ionicons name="settings-outline" size={24} color="#8b5cf6" />
            </View>
          </View>
          <Text style={[s.emptyTitle, { color: isDark ? '#fff' : '#111827' }]}>Your SurfVault</Text>
          <Text style={[s.emptySubtitle, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            Manage your profile, track session analytics, and customize your settings
          </Text>
          <Pressable onPress={login} style={s.signInBtn}>
            <Text style={s.signInText}>Sign In to Get Started</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const sessionSheetSections: ActionSheetSection[] = sessionSheetItem ? [
    {
      options: [
        {
          label: 'Share',
          icon: 'share-outline' as const,
          onPress: () => {
            const sid = sessionSheetItem.session_id ?? sessionSheetItem.id;
            Share.share(Platform.OS === 'ios' ? { url: `https://share.surf-vault.com/s/${sid}` } : { message: `https://share.surf-vault.com/s/${sid}` });
          },
        },
        ...(sessionSheetItem.surf_break_is_favorited != null ? [{
          label: (sessionSheetItem.surf_break_is_favorited ? 'Unfavorite Break' : 'Favorite Break') as const,
          icon: (sessionSheetItem.surf_break_is_favorited ? 'heart-dislike-outline' : 'heart-outline') as const,
          onPress: () => {
            if (sessionSheetItem.surf_break_id) {
              favoriteSurfBreak({ surfBreakId: sessionSheetItem.surf_break_id, action: sessionSheetItem.surf_break_is_favorited ? 'unfavorite' : 'favorite' });
            }
          },
        }] : []),
        ...(sessionSheetItem.surf_break_identifier ? [{
          label: 'View Break' as const,
          icon: 'location-outline' as const,
          onPress: () => {
            const country = sessionSheetItem.country_code ?? '';
            const reg = sessionSheetItem.region && sessionSheetItem.region !== '0' ? sessionSheetItem.region : '0';
            trackedPush(`/break/${country}/${reg}/${sessionSheetItem.surf_break_identifier}` as any);
          },
        }] : []),
      ],
    },
    {
      options: [
        {
          label: 'Delete Session',
          icon: 'trash-outline' as const,
          destructive: true,
          onPress: () => {
            const sid = sessionSheetItem.session_id ?? sessionSheetItem.id;
            const name = sessionSheetItem.session_name ?? 'this session';
            confirmAndDeleteSession(sid, name, sessionSheetItem.photo_count);
          },
        },
      ],
    },
  ] : [];

  const listHeader = (
    <>
      <ProfileHeader
        profile={profileWithCounts}
        isDark={isDark}
        isSelf
        showStorage
        showActiveToggle
        onEditProfile={() => trackedPush('/edit-profile')}
        onToggleActive={handleToggleActive}
        onSelectBreak={handleOpenBreakSearch}
        onEditStatusNote={handleOpenNoteEditor}
        currentBreakName={currentBreakName}
        storageUsed={storageUsed}
        storageLimit={storageLimit}
        onViewStats={(tab) => {
          if (user?.handle) trackedPush(`/follow-stats/${user.handle}?tab=${tab}` as any);
        }}
      />
      <View style={[s.tabBar, { borderBottomColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
        <Pressable onPress={() => setActiveTab('grid')} style={[s.tabBtn, activeTab === 'grid' && s.tabBtnActive]}>
          <Ionicons name={activeTab === 'grid' ? 'grid' : 'grid-outline'} size={22} color={activeTab === 'grid' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
        </Pressable>
        <Pressable onPress={() => setActiveTab('list')} style={[s.tabBtn, activeTab === 'list' && s.tabBtnActive]}>
          <Ionicons name={activeTab === 'list' ? 'list' : 'list-outline'} size={22} color={activeTab === 'list' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
        </Pressable>
        <Pressable onPress={() => setActiveTab('favorites')} style={[s.tabBtn, activeTab === 'favorites' && s.tabBtnActive]}>
          <Ionicons name={activeTab === 'favorites' ? 'heart' : 'heart-outline'} size={22} color={activeTab === 'favorites' ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af')} />
        </Pressable>
      </View>
    </>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={[s.headerHandle, { color: isDark ? '#fff' : '#111827' }]}>
          {user?.handle ?? ''}
        </Text>
        <View style={s.headerRight}>
          <Pressable onPress={() => trackedPush('/notifications' as any)} hitSlop={8}>
            <View>
              <Ionicons name="notifications-outline" size={24} color={isDark ? '#e5e7eb' : '#374151'} />
              {unreadNotifCount > 0 && (
                <View style={s.notifBadge}>
                  <Text style={s.notifBadgeText}>
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
          <Pressable onPress={handleMenu} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={24} color={isDark ? '#e5e7eb' : '#374151'} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={activeTab === 'favorites' ? favorites : sessions}
        keyExtractor={(item) =>
          activeTab === 'favorites' ? item.surf_break_id : (item.session_id ?? item.id)
        }
        numColumns={activeTab === 'grid' ? 3 : 1}
        key={activeTab === 'grid' ? 'grid' : 'list'}
        renderItem={({ item }) => {
          if (activeTab === 'favorites') {
            const breakName = (item.surf_break_identifier ?? '').replaceAll('_', ' ');
            const region = (item.region ?? '').replaceAll('_', ' ');
            return (
              <Pressable
                onPress={() => trackedPush(`/break/${item.country_code}/${item.region || '0'}/${item.surf_break_identifier}` as any)}
                style={[s.favRow, { borderBottomColor: isDark ? '#1f2937' : '#f3f4f6' }]}
              >
                <Ionicons name="location-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={s.favNameRow}>
                    <Text style={[s.favName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                      {breakName}
                    </Text>
                    {item.hasActivePhotographer && (
                      <View style={s.activePulse}>
                        <View style={s.activePulseDot} />
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#ef4444' }}>Active</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af', marginTop: 1 }}>
                    {item.country_code}{region ? ` · ${region}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={isDark ? '#4b5563' : '#d1d5db'} />
              </Pressable>
            );
          }
          if (activeTab === 'grid') {
            const GRID_GAP = 1;
            const GRID_SIZE = (Dimensions.get('window').width - GRID_GAP * 2) / 3;
            return (
              <Pressable
                onPress={() => {
                  const sid = item.session_id ?? item.id;
                  if (sid) trackedPush(`/session/${sid}` as any);
                }}
                onLongPress={() => handleSessionLongPress(item)}
                style={{ width: GRID_SIZE, height: GRID_SIZE * 1.3, margin: GRID_GAP / 2 }}
              >
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <View style={{ width: '100%', height: '100%', backgroundColor: isDark ? '#1f2937' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="image-outline" size={24} color={isDark ? '#374151' : '#d1d5db'} />
                  </View>
                )}
                {(item.view_count != null || item.photo_count > 0) && (
                  <View style={s.gridViewCount}>
                    {item.view_count != null && (
                      <>
                        <Ionicons name="eye-outline" size={10} color="#fff" />
                        <Text style={s.gridViewCountText}>{formatCount(item.view_count ?? 0)}</Text>
                      </>
                    )}
                    {item.view_count != null && item.photo_count > 0 && (
                      <Text style={s.gridViewCountText}> · </Text>
                    )}
                    {item.photo_count > 0 && (
                      <>
                        <Ionicons name="images-outline" size={10} color="#fff" />
                        <Text style={s.gridViewCountText}>{formatCount(item.photo_count)}</Text>
                      </>
                    )}
                  </View>
                )}
                {(item.session_date || item.surf_break_name) && (
                  <View style={s.gridDate}>
                    {item.surf_break_name && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        {item.hide_location && <Ionicons name="eye-off-outline" size={9} color="rgba(255,255,255,0.7)" />}
                        <Text style={s.gridDateText} numberOfLines={1}>{item.surf_break_name}</Text>
                      </View>
                    )}
                    {item.session_date && (
                      <Text style={[s.gridDateText, { opacity: 0.75 }]}>
                        {new Date(item.session_date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    )}
                  </View>
                )}
              </Pressable>
            );
          }
          return (
            <SessionCard
              session={item}
              hidePhotographer
              showViewCount
              showHiddenLocations
              onPress={() => {
                const sid = item.session_id ?? item.id;
                if (sid) trackedPush(`/session/${sid}` as any);
              }}
              onDelete={() => {
                const sid = item.session_id ?? item.id;
                const name = item.session_name ?? 'this session';
                confirmAndDeleteSession(sid, name, item.photo_count);
              }}
            />
          );
        }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isFetching ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="small" color={isDark ? '#6b7280' : '#9ca3af'} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Ionicons
                name={activeTab === 'favorites' ? 'heart-outline' : 'camera-outline'}
                size={40}
                color={isDark ? '#374151' : '#d1d5db'}
              />
              <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 14 }}>
                {activeTab === 'favorites' ? 'No favorites yet' : 'No sessions yet'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          activeTab !== 'favorites' && isFetching && sessions.length > 0 ? (
            <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View>
          ) : null
        }
        onEndReached={activeTab === 'favorites' ? undefined : handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Status note editor */}
      {showNoteEditor && (
        <View style={[s.sheetOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseNoteEditor} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ justifyContent: 'flex-end' }}>
            <View style={[s.noteSheet, { backgroundColor: isDark ? '#111827' : '#fff' }]}>
              <View style={s.noteSheetHeader}>
                <Text style={[s.noteSheetTitle, { color: isDark ? '#fff' : '#111827' }]}>Status Note</Text>
                <Pressable onPress={handleSaveNote}>
                  <Text style={{ fontSize: 15, color: '#0ea5e9', fontWeight: '600' }}>Save</Text>
                </Pressable>
              </View>
              <TextInput
                ref={noteInputRef}
                value={noteText}
                onChangeText={(t) => t.length <= STATUS_NOTE_MAX && setNoteText(t)}
                placeholder="What's happening? e.g. Heading to Pipeline next week..."
                placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                multiline
                maxLength={STATUS_NOTE_MAX}
                style={[s.noteInput, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6', color: isDark ? '#fff' : '#111827' }]}
              />
              <View style={s.noteFooter}>
                <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af' }}>
                  {noteText.length}/{STATUS_NOTE_MAX}
                </Text>
                {(user?.status_note as string)?.length > 0 && (
                  <Pressable onPress={handleClearNote}>
                    <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '500' }}>Clear Note</Text>
                  </Pressable>
                )}
              </View>
              <Text style={{ fontSize: 11, color: isDark ? '#4b5563' : '#9ca3af', paddingHorizontal: 16, paddingBottom: 12 }}>
                Notes auto-expire after 7 days
              </Text>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* Break search bottom sheet */}
      {showBreakSearch && (
        <View style={[s.sheetOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowBreakSearch(false); setTabBarVisible(true); setBreakSearch(''); setDebouncedBreakSearch(''); Keyboard.dismiss(); }} />
          <View style={[s.breakSheet, { backgroundColor: isDark ? '#111827' : '#fff' }, kbVisible && { paddingBottom: kbHeight }]}>
            <View style={s.sheetHandle}>
              <View style={[s.sheetHandleBar, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
            </View>
            <View style={[s.breakSheetSearch, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
              <Ionicons name="search-outline" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
              <TextInput
                ref={breakSearchInputRef}
                value={breakSearch}
                onChangeText={handleBreakSearchInput}
                placeholder="Search surf breaks..."
                placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                autoFocus
                style={[s.breakSheetInput, { color: isDark ? '#fff' : '#111827' }]}
              />
              {breakSearch.length > 0 && (
                <Pressable onPress={() => { setBreakSearch(''); setDebouncedBreakSearch(''); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
                </Pressable>
              )}
            </View>
            <ScrollView style={s.breakSheetResults} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {searchingBreaks && <ActivityIndicator size="small" style={{ marginVertical: 16 }} />}
              {breakResults.map((brk: any) => (
                <Pressable key={brk.id} onPress={() => handleSelectBreak(brk)} style={[s.breakOption, { borderBottomColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                  <Ionicons name="location-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#fff' : '#111827' }}>{brk.name}</Text>
                    <Text style={{ fontSize: 12, color: isDark ? '#9ca3af' : '#6b7280', marginTop: 1 }}>
                      {brk.region?.replaceAll('_', ' ')} · {brk.country_code}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {debouncedBreakSearch.length >= 2 && !searchingBreaks && breakResults.length === 0 && (
                <Text style={{ color: '#9ca3af', textAlign: 'center', paddingVertical: 24, fontSize: 14 }}>No breaks found</Text>
              )}
              {debouncedBreakSearch.length < 2 && (
                <Text style={{ color: isDark ? '#4b5563' : '#9ca3af', textAlign: 'center', paddingVertical: 24, fontSize: 14 }}>
                  Type to search for a surf break
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      <ActionSheet
        visible={menuVisible}
        sections={menuSections}
        onClose={() => setMenuVisible(false)}
      />

      <ActionSheet
        visible={sessionSheetVisible}
        sections={sessionSheetSections}
        onClose={() => { setSessionSheetVisible(false); setSessionSheetItem(null); }}
        header={sessionSheetItem ? {
          title: sessionSheetItem.session_name ?? 'Session',
          subtitle: [
            sessionSheetItem.surf_break_name,
            sessionSheetItem.session_date ? new Date(sessionSheetItem.session_date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : undefined,
          ].filter(Boolean).join(' · ') || undefined,
          imageUri: sessionSheetItem.thumbnail,
        } : undefined}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  headerHandle: { fontSize: 20, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  notifBadge: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: '#ef4444', borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 32 },
  emptyIconRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  emptyIconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
  signInBtn: { marginTop: 16, backgroundColor: '#0ea5e9', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
  signInText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 2,
  },
  tabBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
  },
  tabBtnActive: {
    borderBottomWidth: 2, borderBottomColor: '#111827',
  },
  favRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  favNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  favName: { fontSize: 15, fontWeight: '600' },
  activePulse: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  activePulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
  gridViewCount: {
    position: 'absolute', bottom: 4, left: 4,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  gridViewCountText: { fontSize: 10, fontWeight: '600', color: '#fff' },
  gridDate: {
    position: 'absolute', top: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  gridDateText: { fontSize: 9, fontWeight: '600', color: '#fff' },
  noteSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  noteSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  noteSheetTitle: { fontSize: 17, fontWeight: '700' },
  noteInput: {
    marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, minHeight: 80, textAlignVertical: 'top',
  },
  noteFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 100 },
  breakSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 34 },
  sheetHandle: { alignItems: 'center', paddingVertical: 10 },
  sheetHandleBar: { width: 36, height: 4, borderRadius: 2 },
  breakSheetSearch: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  breakSheetInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  breakSheetResults: { marginTop: 8, paddingHorizontal: 8 },
  breakOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
