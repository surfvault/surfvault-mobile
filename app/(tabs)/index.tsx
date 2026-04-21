import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  ScrollView,
  useColorScheme,
  StyleSheet,
  TextInput,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { useTrackedPush } from '../../src/context/NavigationContext';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import {
  useGetLatestSessionsQuery,
  useGetNearbySurfBreaksQuery,
  useGetNearbyPhotographersQuery,
  useGetMapSearchContentQuery,
  useGetPopularTagsQuery,
  useGetAdsQuery,
} from '../../src/store';
import { useUser } from '../../src/context/UserProvider';
import { useTabBar } from '../../src/context/TabBarContext';
import SessionCard from '../../src/components/SessionCard';
import SurfBreakCard from '../../src/components/SurfBreakCard';
import PhotographerCard from '../../src/components/PhotographerCard';
import UserAvatar from '../../src/components/UserAvatar';
import SponsoredCard from '../../src/components/SponsoredCard';
import { interleaveAds, type FeedRow } from '../../src/helpers/interleaveAds';
import { useUserCoords } from '../../src/hooks/useUserCoords';

type SearchType = 'surf_break' | 'user';

export default function HomeScreen() {
  const router = useRouter();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();
  const { setTabBarVisible } = useTabBar();

  // Location — read from Redux (set by map page when permission is granted)
  const coords = useSelector((state: any) => state.location.coordinates);
  // Also request on first home visit if the user never opened the map tab
  const { lat: userLat, lon: userLon, hasCoords } = useUserCoords();

  // ---- Viewability tracking ----
  const [viewableIds, setViewableIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setViewableIds(new Set(viewableItems.map((v) => v.key)));
  }).current;

  // ---- Discover Feed ----
  const [sessions, setSessions] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const seenIdsRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const isFetchingMoreRef = useRef(false);
  const feedListRef = useRef<FlatList<any>>(null);

  // Tap the Home tab while focused → scroll feed to top
  const navigation = useNavigation();
  useEffect(() => {
    const unsub = (navigation as any).addListener?.('tabPress', () => {
      if ((navigation as any).isFocused?.()) {
        feedListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
    return unsub;
  }, [navigation]);

  const [refreshing, setRefreshing] = useState(false);

  const { data: sessionsData, isLoading, isFetching, refetch: refetchSessions } = useGetLatestSessionsQuery({
    userId: user?.id,
    limit: 10,
    continuationToken,
  });

  useEffect(() => {
    const results = sessionsData?.results;
    if (!results) return;
    const incoming = Array.isArray(results.sessions) ? results.sessions : [];
    const nextToken = results.continuationToken || '';
    hasMoreRef.current = Boolean(nextToken);

    if (isRefreshingRef.current) {
      // On refresh: replace all sessions with fresh data
      seenIdsRef.current = new Set();
      const unique = incoming.filter((s: any) => {
        const id = s?.session_id ?? s?.id;
        if (!id || seenIdsRef.current.has(id)) return false;
        seenIdsRef.current.add(id);
        return true;
      });
      setSessions(unique);
      isRefreshingRef.current = false;
      isFetchingMoreRef.current = false;
      return;
    }

    if (!incoming.length) { isFetchingMoreRef.current = false; return; }
    setSessions((prev) => {
      const newItems: any[] = [];
      for (const s of incoming) {
        const id = s?.session_id ?? s?.id;
        if (!id) continue;
        if (!seenIdsRef.current.has(id)) { seenIdsRef.current.add(id); newItems.push(s); }
      }
      if (!newItems.length) return prev;
      return prev.concat(newItems);
    });
    isFetchingMoreRef.current = false;
  }, [sessionsData]);

  const isRefreshingRef = useRef(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    isRefreshingRef.current = true;
    setContinuationToken('');
    await refetchSessions();
    setRefreshing(false);
  }, [refetchSessions]);

  const handleLoadMore = useCallback(() => {
    if (!hasMoreRef.current || isFetchingMoreRef.current) return;
    const nextToken = sessionsData?.results?.continuationToken;
    if (!nextToken) return;
    isFetchingMoreRef.current = true;
    setContinuationToken(nextToken);
  }, [sessionsData]);

  // ---- Search overlay ----
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('surf_break');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const searchInputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nearby data
  const { data: nearbyBreaksData } = useGetNearbySurfBreaksQuery(
    { lat: coords?.lat ?? 0, long: coords?.lon ?? 0 },
    { skip: !coords }
  );
  const { data: nearbyPhotographersData } = useGetNearbyPhotographersQuery(
    { lat: coords?.lat ?? 0, long: coords?.lon ?? 0 },
    { skip: !coords }
  );

  // Search — uses /map/search which returns { results: { searchContent: [...] } }
  // API accepts type: "all" | "surf_break" | "photographer" (legacy) | "user" (all users)
  const hasTagFilter = searchType === 'user' && selectedTags.length > 0;
  const { data: searchData, isFetching: searchLoading } = useGetMapSearchContentQuery(
    {
      search: searchTerm,
      type: searchType, // "surf_break" or "user" — "user" returns surfers + photographers
      tags: searchType === 'user' ? selectedTags : [],
    },
    { skip: searchTerm.length < 2 && !hasTagFilter }
  );

  const { data: tagsData } = useGetPopularTagsQuery(undefined);

  const nearbyBreaks = nearbyBreaksData?.results?.surfBreaks ?? [];
  const nearbyPhotographers = nearbyPhotographersData?.results?.photographers ?? [];
  const popularTags = tagsData?.results?.tags ?? [];

  // Ads for the home feed — geo-boosted when we have user coords.
  // Mobile has no sidebar rail, so we pull ALL eligible ads (no placement filter)
  // and render them all as post-style cards in the feed. This keeps "sidebar"
  // inventory from being wasted on mobile, which is where most traffic lands.
  const { data: adsData } = useGetAdsQuery({
    feed: true,
    lat: hasCoords && userLat != null ? userLat : undefined,
    lon: hasCoords && userLon != null ? userLon : undefined,
    limit: 10,
  });
  const feedAds = useMemo(
    () => adsData?.results?.ads || [],
    [adsData]
  );

  // Interleave ads using the shared cadence — matches web so both platforms
  // show ads at the same feed positions.
  const feedRows = useMemo(
    () => interleaveAds(sessions, feedAds) as FeedRow<any, any>[],
    [sessions, feedAds]
  );

  // Parse search results — API returns searchContent array, dedupe by composite key
  const rawSearchContent = searchData?.results?.searchContent ?? [];
  const searchContent = rawSearchContent.filter((item: any, index: number, arr: any[]) => {
    const key = item.handle
      ? `user:${item.handle}`
      : `break:${item.name}:${item.region ?? ''}:${item.country_code ?? ''}`;
    return arr.findIndex((i: any) => {
      const iKey = i.handle
        ? `user:${i.handle}`
        : `break:${i.name}:${i.region ?? ''}:${i.country_code ?? ''}`;
      return iKey === key;
    }) === index;
  });

  // Recent searches from user profile
  const recentSearches = user?.recentSearches ?? [];
  const filteredRecents = recentSearches.filter((r: any) => {
    if (searchType === 'surf_break') return r.itemType === 'surf_break';
    // "user" mode shows any recent person search (surfers + photographers).
    return r.itemType === 'user';
  });

  const handleSearchInput = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(text), 350);
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const openSearch = useCallback(() => {
    setSearchVisible(true);
    setTabBarVisible(false);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [setTabBarVisible]);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearchVisible(false);
    setTabBarVisible(true);
    setSearchTerm('');
    setSelectedTags([]);
  }, [setTabBarVisible]);

  const navigateAndClose = useCallback((path: string) => {
    Keyboard.dismiss();
    setSearchVisible(false);
    setTabBarVisible(true);
    setSearchTerm('');
    setSelectedTags([]);
    router.push(path as any);
  }, [router, setTabBarVisible]);

  const navigateToBreak = useCallback((item: any) => {
    const identifier = item.surf_break_identifier;
    if (identifier) {
      // identifier could be "COUNTRY/REGION/BREAK" or just "BREAK"
      const parts = identifier.split('/');
      if (parts.length === 3) {
        navigateAndClose(`/break/${parts[0]}/${parts[1]}/${parts[2]}`);
      } else {
        // Build path from separate fields
        const country = item.country_code ?? item.country ?? '';
        const region = item.region && item.region !== '' ? item.region : '0';
        navigateAndClose(`/break/${country}/${region}/${identifier}`);
      }
    }
  }, [navigateAndClose]);

  const navigateToUser = useCallback((handle: string) => {
    navigateAndClose(`/user/${handle}`);
  }, [navigateAndClose]);

  const isSearching = searchTerm.length >= 2 || hasTagFilter;

  // ---- Search overlay ----
  if (searchVisible) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: isDark ? '#030712' : '#ffffff' }]}>
        {/* Header */}
        <View style={styles.searchHeader}>
          <Text style={[styles.searchTitle, { color: isDark ? '#ffffff' : '#111827' }]}>Search</Text>
          <Pressable onPress={closeSearch} hitSlop={8}>
            <Ionicons name="close" size={24} color={isDark ? '#e5e7eb' : '#374151'} />
          </Pressable>
        </View>

        {/* Search input */}
        <View style={[styles.searchInputWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <Ionicons name="search-outline" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
          <TextInput
            ref={searchInputRef}
            placeholder={searchType === 'user' ? 'Search people...' : 'Search surf breaks...'}
            placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            onChangeText={handleSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: isDark ? '#ffffff' : '#111827' }]}
          />
        </View>

        {/* Type toggle */}
        <View style={[styles.toggleWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <Pressable
            onPress={() => { setSearchType('surf_break'); setSelectedTags([]); setSearchTerm(''); }}
            style={[
              styles.toggleBtn,
              searchType === 'surf_break' && {
                backgroundColor: isDark ? '#374151' : '#ffffff',
                shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
              },
            ]}
          >
            <Text style={[
              styles.toggleText,
              { color: searchType === 'surf_break' ? (isDark ? '#fff' : '#111827') : (isDark ? '#9ca3af' : '#6b7280') },
              searchType === 'surf_break' && styles.toggleTextActive,
            ]}>Breaks</Text>
          </Pressable>
          <Pressable
            onPress={() => { setSearchType('user'); setSearchTerm(''); }}
            style={[
              styles.toggleBtn,
              searchType === 'user' && {
                backgroundColor: isDark ? '#374151' : '#ffffff',
                shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
              },
            ]}
          >
            <Text style={[
              styles.toggleText,
              { color: searchType === 'user' ? (isDark ? '#fff' : '#111827') : (isDark ? '#9ca3af' : '#6b7280') },
              searchType === 'user' && styles.toggleTextActive,
            ]}>People</Text>
          </Pressable>
        </View>

        {/* Tags — people search only (naturally surfaces photographers since surfers have no tags) */}
        {searchType === 'user' && popularTags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagsWrap}
            style={{ flexGrow: 0 }}
          >
            {popularTags.map((tag: any) => {
              const tagName = tag.tag ?? tag;
              const isSelected = selectedTags.includes(tagName);
              return (
                <Pressable
                  key={tagName}
                  onPress={() => toggleTag(tagName)}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor: isSelected ? '#0ea5e9' : 'transparent',
                      borderColor: isSelected ? '#0ea5e9' : (isDark ? '#374151' : '#e5e7eb'),
                    },
                  ]}
                >
                  <Text style={[
                    styles.tagText,
                    { color: isSelected ? '#ffffff' : (isDark ? '#9ca3af' : '#4b5563') },
                    isSelected && { fontWeight: '500' },
                  ]}>{tagName}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Results / Recents / Default */}
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {isSearching ? (
            /* ---- Active search results ---- */
            <View style={styles.resultsWrap}>
              {searchLoading ? (
                <View style={styles.centered}><ActivityIndicator /></View>
              ) : searchContent.length > 0 ? (
                searchContent.map((item: any) => {
                  // User result
                  if (item.handle) {
                    const userType = item.user_type;
                    return (
                      <Pressable key={item.id ?? item.handle} onPress={() => navigateToUser(item.handle)} style={styles.resultRow}>
                        <UserAvatar uri={item.picture} name={item.name ?? item.handle} size={40} verified={item.verified} />
                        <View style={styles.resultInfo}>
                          <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                            {item.name ?? item.handle}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                            <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280', flexShrink: 1 }]} numberOfLines={1}>
                              @{item.handle}
                            </Text>
                            {userType === 'photographer' && (
                              <>
                                <Text style={{ fontSize: 13, color: isDark ? '#6b7280' : '#9ca3af', marginHorizontal: 4 }}>·</Text>
                                <Ionicons name="camera-outline" size={13} color={isDark ? '#9ca3af' : '#6b7280'} />
                              </>
                            )}
                            {userType && userType !== 'photographer' && (
                              <>
                                <Text style={{ fontSize: 13, color: isDark ? '#6b7280' : '#9ca3af', marginHorizontal: 4 }}>·</Text>
                                <MaterialCommunityIcons name="surfing" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
                              </>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    );
                  }
                  // Surf break result
                  return (
                    <Pressable key={item.id} onPress={() => navigateToBreak(item)} style={styles.resultRow}>
                      <View style={[styles.resultIcon, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                        <Ionicons name="location-outline" size={20} color={isDark ? '#9ca3af' : '#6b7280'} />
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                          {item.name}
                        </Text>
                        <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                          {item.region ? `${item.region.replaceAll('_', ' ')} · ` : ''}{item.country_code ?? ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={[styles.emptyText, { color: '#9ca3af' }]}>
                  No {searchType === 'user' ? 'people' : 'surf breaks'} found
                </Text>
              )}
            </View>
          ) : (
            <>
              {/* ---- Recent searches ---- */}
              {filteredRecents.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>
                    Recent
                  </Text>
                  {filteredRecents.map((recent: any, idx: number) => {
                    const item = recent.itemType === 'surf_break' ? recent.surfBreak : recent.user;
                    if (!item) return null;

                    if (recent.itemType === 'user' && item.handle) {
                      const userType = item.user_type;
                      return (
                        <Pressable key={item.id ?? idx} onPress={() => navigateToUser(item.handle)} style={styles.resultRow}>
                          <UserAvatar uri={item.picture} name={item.name ?? item.handle} size={36} />
                          <View style={styles.resultInfo}>
                            <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                              {item.name ?? item.handle}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                              <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280', flexShrink: 1 }]} numberOfLines={1}>
                                @{item.handle}
                              </Text>
                              {userType === 'photographer' && (
                                <>
                                  <Text style={{ fontSize: 13, color: isDark ? '#6b7280' : '#9ca3af', marginHorizontal: 4 }}>·</Text>
                                  <Ionicons name="camera-outline" size={13} color={isDark ? '#9ca3af' : '#6b7280'} />
                                </>
                              )}
                              {userType && userType !== 'photographer' && (
                                <>
                                  <Text style={{ fontSize: 13, color: isDark ? '#6b7280' : '#9ca3af', marginHorizontal: 4 }}>·</Text>
                                  <MaterialCommunityIcons name="surfing" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
                                </>
                              )}
                            </View>
                          </View>
                        </Pressable>
                      );
                    }

                    return (
                      <Pressable key={item.id ?? idx} onPress={() => navigateToBreak(item)} style={styles.resultRow}>
                        <View style={[styles.resultIcon, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                          <Ionicons name="location-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                        </View>
                        <View style={styles.resultInfo}>
                          <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                            {item.name}
                          </Text>
                          <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                            {item.region ? `${item.region.replaceAll('_', ' ')} · ` : ''}{item.country_code ?? ''}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Empty state when no recents */}
              {filteredRecents.length === 0 && (
                <View style={styles.centered}>
                  <Text style={{ color: '#9ca3af', fontSize: 14 }}>
                    Search for {searchType === 'user' ? 'people' : 'surf breaks'}
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Main discover feed ----
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../../assets/surfvault-logo.png')}
            style={[styles.headerLogo, isDark && { tintColor: '#ffffff' }]}
            contentFit="contain"
          />
          <Text style={[styles.headerTitle, { color: isDark ? '#ffffff' : '#000000' }]}>
            SurfVault
          </Text>
        </View>
        <Pressable onPress={openSearch} hitSlop={8}>
          <Ionicons name="search-outline" size={24} color={isDark ? '#e5e7eb' : '#374151'} />
        </Pressable>
      </View>

      {isLoading && sessions.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          ref={feedListRef}
          data={feedRows}
          keyExtractor={(row) => row.key}
          renderItem={({ item: row }) => {
            if (row.type === 'ad') {
              return (
                <SponsoredCard
                  ad={row.data}
                  placement="content"
                  isViewable={viewableIds.has(row.key)}
                />
              );
            }
            const item = row.data;
            return (
              <SessionCard
                session={item}
                isViewable={viewableIds.has(row.key)}
                onPress={() => {
                  const sid = item.session_id ?? item.id;
                  if (sid) trackedPush(`/session/${sid}` as any);
                }}
              />
            );
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListHeaderComponent={
            <>
              {/* Nearby Surf Breaks */}
              {nearbyBreaks.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
                    <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>
                      Nearby Surf Breaks
                    </Text>
                    <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      Surf breaks within 300km of you
                    </Text>
                  </View>
                  <FlatList
                    data={nearbyBreaks}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
                    keyExtractor={(item: any) => item.id}
                    renderItem={({ item }) => (
                      <Pressable onPress={() => {
                        if (item.surf_break_identifier) {
                          const parts = item.surf_break_identifier.split('/');
                          if (parts.length === 3) trackedPush(`/break/${parts[0]}/${parts[1]}/${parts[2]}` as any);
                        }
                      }}>
                        <SurfBreakCard surfBreak={item} compact />
                      </Pressable>
                    )}
                    scrollEnabled
                  />
                </View>
              )}

              {/* Nearby Photographers */}
              {nearbyPhotographers.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
                    <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>
                      Nearby Photographers
                    </Text>
                    <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      Photographers within 100km of you
                    </Text>
                  </View>
                  <FlatList
                    data={nearbyPhotographers}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, gap: 16 }}
                    keyExtractor={(item: any) => item.id ?? item.handle}
                    renderItem={({ item }) => (
                      <Pressable
                        onPress={() => trackedPush(`/user/${item.handle}` as any)}
                        style={{ alignItems: 'center', width: 80 }}
                      >
                        <UserAvatar
                          uri={item.picture}
                          name={item.name ?? item.handle}
                          size={64}
                          active={item.active}
                          verified={item.verified}
                          hasStatusNote={!!item.status_note && Date.now() - new Date(item.status_note_set_at).getTime() < 7 * 24 * 60 * 60 * 1000}
                        />
                        <Text
                          style={[styles.photographerHandle, { color: isDark ? '#fff' : '#111827' }]}
                          numberOfLines={1}
                        >
                          @{item.handle}
                        </Text>
                        {item.active && (
                          <View style={[styles.activeDot, { backgroundColor: '#22c55e' }]} />
                        )}
                      </Pressable>
                    )}
                    scrollEnabled
                  />
                </View>
              )}

            </>
          }
          ListEmptyComponent={
            !isLoading ? (
              <View className="items-center py-20">
                <Text className="text-gray-400 dark:text-gray-600 text-base">No sessions yet</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            isFetching && sessions.length > 0 ? (
              <View className="py-6"><ActivityIndicator /></View>
            ) : null
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  searchTitle: { fontSize: 18, fontWeight: '700' },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  toggleWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleText: { fontSize: 14 },
  toggleTextActive: { fontWeight: '600' },
  tagsWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    alignSelf: 'center',
  },
  tagText: { fontSize: 13 },
  resultsWrap: { paddingHorizontal: 16 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: { marginLeft: 12, flex: 1 },
  resultName: { fontSize: 15, fontWeight: '600' },
  resultSub: { fontSize: 13, marginTop: 1 },
  centered: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { textAlign: 'center', paddingVertical: 48 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 4,
    paddingRight: 16,
    paddingVertical: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 64,
    height: 64,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'SurfVaultFont',
    marginLeft: -8,
  },
  nearbyTitle: { fontSize: 18, fontWeight: '700' },
  nearbySubtitle: { fontSize: 13, marginTop: 2 },
  photographerHandle: { fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  activeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
});
