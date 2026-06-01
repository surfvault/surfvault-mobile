import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useColorScheme,
  Share,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useUser } from '../../src/context/UserProvider';
import { useAuth } from '../../src/context/AuthProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useViewableItems } from '../../src/hooks/useViewableItems';
import { useSmartBack } from '../../src/context/NavigationContext';
import {
  useGetSurfBreakWithLatestSessionsQuery,
  useGetSurfBreakSessionsQuery,
  useUpdateUserFavoritesMutation,
  useGetAdsQuery,
  useGetShapersForSurfBreakQuery,
} from '../../src/store';
import SessionCard from '../../src/components/SessionCard';
import BreakHero from '../../src/components/BreakHero';
import SponsoredCard from '../../src/components/SponsoredCard';
import ShaperFeedCard from '../../src/components/ShaperFeedCard';
import BreakSkeleton from '../../src/components/BreakSkeleton';
import LocalsRail from '../../src/components/LocalsRail';
import {
  // groupAdsByPartner intentionally not imported — Phase B retired
  // partner-level ad grouping; each ad is its own promo slot.
  interleavePromoGroups,
  zipPromoGroups,
  type FeedRow,
} from '../../src/helpers/interleaveAds';

const formatDateLabel = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const formatDateParam = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function SurfBreakDetailScreen() {
  const { breakRoute, date: dateQueryParam } = useLocalSearchParams<{
    breakRoute: string[] | string;
    date?: string;
  }>();
  // Catch-all returns an array of segments: ["US", "FLORIDA", "THE_MAYPORT_POLES"]
  const parts = Array.isArray(breakRoute) ? breakRoute : (breakRoute ?? '').split('/');
  const country = parts[0] ?? '';
  const region = parts.length >= 3 ? parts[1] : '0';
  const surfBreak = parts.length >= 3 ? parts[2] : parts[1] ?? parts[0] ?? '';

  const router = useRouter();
  const smartBack = useSmartBack();
  const { user } = useUser();
  const { isAuthenticated } = useAuth();
  const requireAuth = useRequireAuth();
  const colorScheme = useColorScheme();
  const { viewabilityConfig, onViewableItemsChanged, isItemViewable, screenFocused } = useViewableItems();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const [continuationToken, setContinuationToken] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const seenIdsRef = useRef(new Set<string>());
  const nextTokenRef = useRef('');
  const prevFingerprintRef = useRef<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Seed selectedDate from `?date=YYYY-MM-DD` (used by Discover/Favorites
  // multi-card taps so the break page lands pre-filtered to that day).
  // Parse as local-noon so toLocaleDateString never shifts it back a day in
  // negative-UTC-offset timezones.
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    if (!dateQueryParam) return null;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateQueryParam);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], 12);
  });
  const [pickerDate, setPickerDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const dateStr = selectedDate ? formatDateParam(selectedDate) : '';

  const { data: initialData, isLoading, refetch: refetchBreak } = useGetSurfBreakWithLatestSessionsQuery(
    {
      userId: user?.id, country, region, surfBreak,
      date: dateStr || undefined,
    },
    {
      refetchOnMountOrArgChange: true,
      // Wait for the user's id before firing — the server uses it to filter
      // out sessions from blocked photographers. Anonymous users fetch as-is.
      skip: isAuthenticated && !user?.id,
    }
  );

  const breakData = initialData?.results?.surfBreak;
  const initialSessions = initialData?.results?.sessions ?? [];
  const initialToken = initialData?.results?.continuationToken ?? '';
  const isFavorited = breakData?.is_favorited;

  // Ads scoped to this break — surfaces both explicitly-targeted ads and
  // partners within range of the break's coords. No placement filter on mobile:
  // sidebar inventory would otherwise be wasted since there is no sidebar rail.
  const { data: adsData } = useGetAdsQuery(
    // Pull the server cap (30) so the interleave has enough inventory to
    // cover deep scrolls at AD_EVERY_N_ITEMS cadence before exhausting.
    { surfBreakId: breakData?.id, feed: true, limit: 30 },
    { skip: !breakData?.id }
  );
  const breakAds = useMemo(
    () => adsData?.results?.ads || [],
    [adsData]
  );

  // Promo stream = paid ads + shapers, alternated (ad first). Shapers ALSO
  // appear in the LocalsRail above the feed (rail is mobile-only); the feed
  // interleave gives them additional in-line visibility alongside paid ads
  // without crowding either out. Each promo entry is its own slot — partner-
  // level grouping is retired (Phase B).
  const { data: shapersData } = useGetShapersForSurfBreakQuery(
    { breakId: breakData?.id ?? '', limit: 50 },
    { skip: !breakData?.id }
  );
  const breakShapers = useMemo(
    () => shapersData?.results?.shapers ?? [],
    [shapersData]
  );

  const feedAds = useMemo(
    () => breakAds.map((a: any) => [{ ...a, _kind: 'ad' as const }]),
    [breakAds]
  );
  const feedShapers = useMemo(
    () => breakShapers.map((s: any) => [{ ...s, id: String(s.id), _kind: 'shaper' as const }]),
    [breakShapers]
  );
  // Zip alternates: ad → shaper → ad → shaper. Either side may be longer;
  // leftovers from the longer side drain at the end.
  const promoGroups = useMemo(
    () => zipPromoGroups(feedAds, feedShapers),
    [feedAds, feedShapers]
  );

  // First page comes from the break query. Guard against metadata-only refetches
  // (e.g. favorite toggle) re-running this and wiping loaded pages: only rebuild
  // when the first-page content actually changes. The next cursor is stashed in
  // nextTokenRef and promoted on scroll — page 2+ load lazily, not all at once.
  useEffect(() => {
    if (!initialData) return;
    const fingerprint = initialSessions.map((s: any) => s?.session_id ?? s?.id).join(',');
    if (fingerprint === prevFingerprintRef.current && seenIdsRef.current.size > 0) return;
    prevFingerprintRef.current = fingerprint;
    seenIdsRef.current = new Set();
    const unique = initialSessions.filter((s: any) => {
      const key = s.session_id ?? s.id;
      if (!key || seenIdsRef.current.has(key)) return false;
      seenIdsRef.current.add(key);
      return true;
    });
    setSessions(unique);
    nextTokenRef.current = initialToken;
    setContinuationToken('');
  }, [initialData]);

  const { data: moreData, isFetching: loadingMore } = useGetSurfBreakSessionsQuery(
    { surfBreakId: breakData?.id ?? '', limit: 10, continuationToken, viewerId: user?.id },
    { skip: !continuationToken || !breakData?.id }
  );

  // Interleave sessions + ad/shaper groups at the shared cadence.
  // `hasMoreSessions` gates the tail-dump: while more pages can be fetched,
  // hold back leftover promos so they don't pile up consecutively at the end
  // of every partial page. Source of truth flips from initialData → moreData
  // once a second-page fetch lands.
  const hasMoreSessions = Boolean(
    moreData ? moreData?.results?.continuationToken : initialData?.results?.continuationToken
  );
  const feedRows = useMemo(
    () =>
      interleavePromoGroups(
        sessions,
        promoGroups,
        undefined,
        undefined,
        hasMoreSessions
      ) as FeedRow<any, any>[],
    [sessions, promoGroups, hasMoreSessions]
  );

  useEffect(() => {
    if (!moreData?.results?.sessions?.length) return;
    const newSessions = moreData.results.sessions.filter((s: any) => {
      const key = s.session_id ?? s.id;
      if (!key || seenIdsRef.current.has(key)) return false;
      seenIdsRef.current.add(key);
      return true;
    });
    if (newSessions.length > 0) setSessions((prev) => [...prev, ...newSessions]);
    // Stash the next cursor; promote on scroll (do NOT auto-advance).
    nextTokenRef.current = moreData.results.continuationToken ?? '';
  }, [moreData]);

  const handleLoadMore = useCallback(() => {
    if (nextTokenRef.current && !loadingMore) {
      setContinuationToken(nextTokenRef.current);
      nextTokenRef.current = '';
    }
  }, [loadingMore]);

  // Pull-to-refresh: rebuild directly from the awaited refetch result rather
  // than depending on the initial-load effect (RTK structural sharing can keep
  // initialData's reference stable when unchanged, so the effect may not re-run).
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res: any = await refetchBreak().unwrap();
      const list: any[] = res?.results?.sessions ?? [];
      const token: string = res?.results?.continuationToken ?? '';
      seenIdsRef.current = new Set();
      const unique = list.filter((s: any) => {
        const key = s.session_id ?? s.id;
        if (!key || seenIdsRef.current.has(key)) return false;
        seenIdsRef.current.add(key);
        return true;
      });
      prevFingerprintRef.current = list.map((s: any) => s?.session_id ?? s?.id).join(',');
      nextTokenRef.current = token;
      setSessions(unique);
      setContinuationToken('');
    } catch {}
    setRefreshing(false);
  }, [refetchBreak]);

  const [favoriteSurfBreak] = useUpdateUserFavoritesMutation();
  const handleFavorite = useCallback(async () => {
    if (!requireAuth()) return;
    if (!breakData?.id) return;
    await favoriteSurfBreak({ surfBreakId: breakData.id, action: isFavorited ? 'unfavorite' : 'favorite' });
  }, [requireAuth, breakData, isFavorited, favoriteSurfBreak]);

  const handleShare = useCallback(async () => {
    const shareUrl = `https://share.surf-vault.com/${country}/${region}/${surfBreak}`;
    await Share.share(Platform.OS === 'ios' ? { url: shareUrl } : { message: shareUrl });
  }, [country, region, surfBreak]);

  const resetPagination = useCallback(() => {
    setSessions([]);
    seenIdsRef.current = new Set();
    nextTokenRef.current = '';
    prevFingerprintRef.current = null;
    setContinuationToken('');
  }, []);

  const handleDateChange = useCallback((event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      // event.type is 'dismissed' when CANCEL/back is pressed — only apply on 'set'.
      if (event?.type === 'set' && date) { setSelectedDate(date); resetPagination(); }
    } else {
      // iOS spinner — just update picker state, apply on Done
      if (date) setPickerDate(date);
    }
  }, [resetPagination]);

  const handleDateDone = useCallback(() => {
    setShowDatePicker(false);
    setSelectedDate(pickerDate);
    resetPagination();
  }, [pickerDate, resetPagination]);

  const clearDate = useCallback(() => {
    setSelectedDate(null);
    resetPagination();
  }, [resetPagination]);

  const breakName = breakData?.name?.replaceAll('_', ' ') ?? surfBreak?.replaceAll('_', ' ') ?? '';
  const regionDisplay = breakData?.region?.replaceAll('_', ' ') ?? (region !== '0' ? region?.replaceAll('_', ' ') : '') ?? '';
  const countryDisplay = breakData?.country_code ?? country?.toUpperCase() ?? '';

  // Coordinates arrive as a JSONB { lat, lon } object (values may be strings).
  const heroLat = breakData?.coordinates?.lat != null ? parseFloat(String(breakData.coordinates.lat)) : null;
  const heroLon = breakData?.coordinates?.lon != null ? parseFloat(String(breakData.coordinates.lon)) : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#ffffff' }]} edges={[]}>
        {isLoading ? (
          <BreakSkeleton />
        ) : (
          <FlatList
            data={feedRows}
            keyExtractor={(row) => row.key}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            renderItem={({ item: row }) => {
              if (row.type === 'ad') {
                const promo = row.data[0] as any;
                // Promo rows carry _kind to distinguish ad vs shaper since they
                // share the same FeedRow type ('ad' here is a generic "promo").
                if (promo?._kind === 'shaper') {
                  return <ShaperFeedCard shaper={promo} isViewable={isItemViewable(row.key)} />;
                }
                return (
                  <SponsoredCard
                    ad={promo}
                    placement="content"
                    surfBreakId={breakData?.id}
                    isViewable={isItemViewable(row.key)}
                  />
                );
              }
              return <SessionCard session={row.data} enableCarousel isViewable={isItemViewable(row.key)} />;
            }}
            ListHeaderComponent={
              <View>
                <BreakHero
                  breakName={breakName}
                  regionDisplay={regionDisplay}
                  countryDisplay={countryDisplay}
                  lat={heroLat}
                  lon={heroLon}
                  isDark={isDark}
                  topInset={insets.top}
                  selectedDate={selectedDate}
                  dateLabel={selectedDate ? formatDateLabel(selectedDate) : ''}
                  onDatePress={() => { setPickerDate(selectedDate ?? new Date()); setShowDatePicker(true); }}
                  onClearDate={clearDate}
                />
                {/* Negative margin tucks the content up into the hero's faded
                    bottom so the page reads as one continuous surface. */}
                <View style={styles.belowHero}>
                  {!selectedDate && <LocalsRail breakId={breakData?.id} />}
                  {feedRows.length > 0 && (
                    <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>Recent Sessions</Text>
                  )}
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="camera-outline" size={48} color={isDark ? '#374151' : '#d1d5db'} />
                <Text style={[styles.emptyTitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                  {selectedDate ? 'No sessions on this date' : `Be the first to share ${breakName}`}
                </Text>

                {breakAds.length > 0 && !selectedDate && (
                  <View style={styles.localLoveWrap}>
                    <Text style={[styles.localLoveTitle, { color: isDark ? '#fff' : '#111827' }]}>
                      Local love near {breakName}
                    </Text>
                    <Text style={[styles.localLoveSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      These businesses are just down the road
                    </Text>
                    {breakAds.slice(0, 3).map((ad: any) => (
                      <SponsoredCard
                        key={ad.id}
                        ad={ad}
                        placement="content"
                        surfBreakId={breakData?.id}
                        isViewable={screenFocused}
                      />
                    ))}
                  </View>
                )}
              </View>
            }
            ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View> : null}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5} showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={isDark ? '#fff' : '#000'}
                colors={[isDark ? '#ffffff' : '#000000']}
                // Hero is full-bleed under the status bar, so without an offset
                // the spinner renders under the notch and is invisible.
                progressViewOffset={insets.top}
              />
            }
          />
        )}
        {/* Floating controls — pinned over the hero map */}
        <View pointerEvents="box-none" style={[styles.controls, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={smartBack} hitSlop={8} style={styles.ctrlBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <View style={styles.ctrlRight}>
            <Pressable onPress={handleFavorite} hitSlop={8} style={styles.ctrlBtn}>
              <Ionicons name={isFavorited ? 'heart' : 'heart-outline'} size={20} color={isFavorited ? '#ef4444' : '#fff'} />
            </Pressable>
            <Pressable onPress={handleShare} hitSlop={8} style={styles.ctrlBtn}>
              <Ionicons name="share-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
        {showDatePicker && (
          Platform.OS === 'android' ? (
            // Android renders its own native dialog (with CANCEL/OK) — no custom sheet.
            <DateTimePicker value={pickerDate} mode="date" display="spinner" onChange={handleDateChange} maximumDate={new Date()} themeVariant={isDark ? 'dark' : 'light'} />
          ) : (
            <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDatePicker(false)} />
              <View style={[styles.sheet, { backgroundColor: isDark ? '#1f2937' : '#fff' }]}>
                <View style={styles.sheetHeader}>
                  <Pressable onPress={handleDateDone}>
                    <Text style={{ fontSize: 16, color: '#0ea5e9', fontWeight: '600' }}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker value={pickerDate} mode="date" display="spinner" onChange={handleDateChange} maximumDate={new Date()} themeVariant={isDark ? 'dark' : 'light'} style={{ height: 200 }} />
              </View>
            </View>
          )
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  belowHero: { marginTop: -28 },
  sectionTitle: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  controls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctrlRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  localLoveWrap: { width: '100%', marginTop: 32, paddingHorizontal: 12 },
  localLoveTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  localLoveSub: { fontSize: 12, marginBottom: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 100 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 14 },
});
