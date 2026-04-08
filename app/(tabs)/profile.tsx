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
  ActionSheetIOS,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../src/context/UserProvider';
import { useAuth } from '../../src/context/AuthProvider';
import {
  useGetUserSessionsQuery,
  useGetUserFavoritesQuery,
  useGetSurfBreaksQuery,
  useUpdateUserMetaDataMutation,
  useUpdateUserFavoritesMutation,
  useGetNotificationsQuery,
} from '../../src/store';
import { useTabBar } from '../../src/context/TabBarContext';
import ProfileHeader from '../../src/components/ProfileHeader';
import SessionCard from '../../src/components/SessionCard';

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();
  const { isAuthenticated, login, logout } = useAuth();
  const [updateMeta] = useUpdateUserMetaDataMutation();
  const { setTabBarVisible } = useTabBar();

  const [activeTab, setActiveTab] = useState<'grid' | 'list' | 'favorites'>('grid');

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
  const unreadNotifCount = notifData?.results?.notifications?.length ?? 0;

  // Favorites
  const { data: favoritesData } = useGetUserFavoritesQuery({} as any, { skip: !isAuthenticated });
  const [updateFavorite] = useUpdateUserFavoritesMutation();
  const favorites = favoritesData?.results?.favorites ?? [];

  // Sessions
  const [sessions, setSessions] = useState<any[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  const [refreshing, setRefreshing] = useState(false);

  const { data: sessionsData, isFetching, refetch: refetchSessions } = useGetUserSessionsQuery(
    { handle: user?.handle ?? '', selfFlag: true, limit: 10, continuationToken: '' },
    { skip: !user?.handle }
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchSessions();
    setRefreshing(false);
  }, [refetchSessions]);

  useEffect(() => {
    const list = sessionsData?.results?.sessions ?? [];
    if (list.length > 0) {
      seenIdsRef.current = new Set();
      const unique = list.filter((s: any) => {
        const key = s.session_id ?? s.id;
        if (seenIdsRef.current.has(key)) return false;
        seenIdsRef.current.add(key);
        return true;
      });
      setSessions(unique);
    }
  }, [sessionsData]);

  const handleToggleActive = useCallback(async () => {
    if (!user) return;
    await updateMeta({ metaData: { active: !user.active } });
  }, [user, updateMeta]);

  const handleMenu = useCallback(() => {
    const options = [
      'Edit Profile',
      'Reports',
      'Plans & Billing',
      'Settings',
      'Sign Out',
      'Cancel',
    ];
    const destructiveIndex = options.indexOf('Sign Out');
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
        (index) => {
          if (options[index] === 'Sign Out') logout();
        }
      );
    } else {
      Alert.alert('Menu', undefined, [
        { text: 'Edit Profile' },
        { text: 'Reports' },
        { text: 'Plans & Billing' },
        { text: 'Settings' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [logout]);

  // Not logged in
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={['top']}>
        <View style={s.emptyWrap}>
          <Ionicons name="person-circle-outline" size={56} color={isDark ? '#374151' : '#d1d5db'} />
          <Text style={[s.emptyTitle, { color: isDark ? '#fff' : '#111827' }]}>Your SurfVault</Text>
          <Text style={[s.emptySubtitle, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            Sign in to manage your profile, upload photos, and track your sessions
          </Text>
          <Pressable onPress={login} style={s.signInBtn}>
            <Text style={s.signInText}>Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={[s.headerHandle, { color: isDark ? '#fff' : '#111827' }]}>
          {user?.handle ?? ''}
        </Text>
        <View style={s.headerRight}>
          <Pressable onPress={() => router.push('/notifications' as any)} hitSlop={8}>
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
        key={activeTab === 'grid' ? 'grid' : 'list'} // force re-render on column change
        renderItem={({ item }) => {
          if (activeTab === 'favorites') {
            const breakName = (item.surf_break_identifier ?? '').replaceAll('_', ' ');
            const region = (item.region ?? '').replaceAll('_', ' ');
            return (
              <Pressable
                onPress={() => router.push(`/break/${item.country_code}/${item.region || '0'}/${item.surf_break_identifier}` as any)}
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
                  if (sid) router.push(`/session/${sid}` as any);
                }}
                style={{ width: GRID_SIZE, height: GRID_SIZE * 1.3, margin: GRID_GAP / 2 }}
              >
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <View style={{ width: '100%', height: '100%', backgroundColor: isDark ? '#1f2937' : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="image-outline" size={24} color={isDark ? '#374151' : '#d1d5db'} />
                  </View>
                )}
                {item.view_count != null && (
                  <View style={s.gridViewCount}>
                    <Ionicons name="eye-outline" size={10} color="#fff" />
                    <Text style={s.gridViewCountText}>{(item.view_count ?? 0).toLocaleString()}</Text>
                  </View>
                )}
                {(item.session_date || item.surf_break_name) && (
                  <View style={s.gridDate}>
                    {item.surf_break_name && !item.hide_location && (
                      <Text style={s.gridDateText} numberOfLines={1}>{item.surf_break_name}</Text>
                    )}
                    {item.session_date && (
                      <Text style={[s.gridDateText, { opacity: 0.75 }]}>
                        {new Date(item.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
              onPress={() => {
                const sid = item.session_id ?? item.id;
                if (sid) router.push(`/session/${sid}` as any);
              }}
            />
          );
        }}
        ListHeaderComponent={
          <>
            <ProfileHeader
              profile={user}
              isDark={isDark}
              isSelf
              showStorage
              showActiveToggle
              onEditProfile={() => { /* TODO */ }}
              onToggleActive={handleToggleActive}
              onSelectBreak={handleOpenBreakSearch}
              currentBreakName={currentBreakName}
              storageUsed={storageUsed}
              storageLimit={storageLimit}
            />
            {/* Tab selector */}
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
        }
        ListEmptyComponent={
          !isFetching ? (
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
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Break search bottom sheet */}
      {showBreakSearch && (
        <View style={[s.sheetOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowBreakSearch(false); setTabBarVisible(true); setBreakSearch(''); setDebouncedBreakSearch(''); Keyboard.dismiss(); }} />
          <View style={[s.breakSheet, { backgroundColor: isDark ? '#111827' : '#fff' }]}>
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
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
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
