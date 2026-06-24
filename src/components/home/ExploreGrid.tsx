import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Animated,
  RefreshControl,
  useColorScheme,
  useWindowDimensions,
  StyleSheet,
  type ViewToken,
} from 'react-native';
import { useGetExploreFeedQuery, useGetAdsQuery } from '../../store';
import { useUser } from '../../context/UserProvider';
import { useAuth } from '../../context/AuthProvider';
import { useUserCoords } from '../../hooks/useUserCoords';
import { SessionTile, FilmTile, BoardTile, BusinessTile } from './FeedTiles';

/**
 * The unified Explore feed — sessions + films + (per-shaper-capped) boards in
 * ONE stream, ranked server-side via `/explore-feed`:
 *   new     → added-to-vault date (created_at)
 *   recent  → content date (session_date / film_date / board created_at)
 *   popular → view count (sessions/films/boards, equal weight)
 * Ads are the only interleaved element. Pages accumulate on the cursor.
 */

const PAD = 12; // outer horizontal padding
const GAP = 10; // gap between the two columns
// Ads scatter with a VARIED gap (not a fixed "every N", which reads mechanical).
// Deterministic per ad index so they don't reshuffle as pages accumulate.
const AD_MIN_GAP = 5;
const AD_MAX_GAP = 12;
const adGap = (n: number) => {
  const f = Math.abs(Math.sin((n + 1) * 12.9898) * 43758.5453) % 1;
  return AD_MIN_GAP + Math.floor(f * (AD_MAX_GAP - AD_MIN_GAP + 1));
};

// Pill key → unified feed sort.
const FEED_SORT: Record<string, 'new' | 'recent' | 'popular'> = {
  latest: 'new',
  recent: 'recent',
  popular: 'popular',
};

type Tile = { kind: 'session' | 'film' | 'board' | 'ad'; key: string; group?: any; film?: any; board?: any; ad?: any };
type Row = { type: 'pair'; key: string; items: Tile[] };

function ExploreGridSkeleton({ cellW }: { cellW: number }) {
  const isDark = useColorScheme() === 'dark';
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const blockColor = isDark ? '#1f2937' : '#e5e7eb';
  const tileH = Math.round((cellW * 5) / 4);
  return (
    <View style={{ paddingHorizontal: PAD }}>
      {Array.from({ length: 6 }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', marginBottom: GAP }}>
          {[0, 1].map((c) => (
            <Animated.View
              key={c}
              style={{ width: cellW, height: tileH, borderRadius: 16, backgroundColor: blockColor, opacity: pulse, marginRight: c === 0 ? GAP : 0 }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function ExploreGrid({
  onNavigate,
  ListHeaderComponent,
  sort = 'latest',
}: {
  onNavigate: (path: string) => void;
  ListHeaderComponent?: React.ReactElement | null;
  sort?: 'latest' | 'popular' | 'recent';
}) {
  const { user } = useUser();
  const { isAuthenticated } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const { width } = useWindowDimensions();
  const cellW = Math.floor((width - PAD * 2 - GAP) / 2);
  const feedSort = FEED_SORT[sort] ?? 'new';

  const { lat, lon, hasCoords } = useUserCoords({ skipPrompt: true });

  const [items, setItems] = useState<Tile[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const seenRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const fetchingMoreRef = useRef(false);

  const { data, currentData, isFetching, refetch } = useGetExploreFeedQuery(
    { sort: feedSort, limit: 12, continuationToken },
    { skip: isAuthenticated && !user?.id }
  );

  const { data: adsData } = useGetAdsQuery({
    feed: true,
    lat: hasCoords && lat != null ? lat : undefined,
    lon: hasCoords && lon != null ? lon : undefined,
    limit: 30,
  });

  // Switching sort is a fresh feed.
  useEffect(() => {
    seenRef.current = new Set();
    hasMoreRef.current = false;
    fetchingMoreRef.current = false;
    setItems([]);
    setContinuationToken('');
  }, [feedSort]);

  // Accumulate feed items across pages (dedup by item key).
  useEffect(() => {
    const results = currentData?.results;
    if (!results) return;
    const incoming = Array.isArray(results.items) ? results.items : [];
    hasMoreRef.current = Boolean(results.continuationToken);
    const fresh: Tile[] = [];
    for (const it of incoming as Tile[]) {
      if (!it?.key || seenRef.current.has(it.key)) continue;
      seenRef.current.add(it.key);
      fresh.push(it);
    }
    fetchingMoreRef.current = false;
    if (fresh.length) setItems((prev) => prev.concat(fresh));
  }, [currentData]);

  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || fetchingMoreRef.current) return;
    const next = data?.results?.continuationToken;
    if (!next) return;
    fetchingMoreRef.current = true;
    setContinuationToken(next);
  }, [data]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (continuationToken !== '') {
        seenRef.current = new Set();
        hasMoreRef.current = false;
        fetchingMoreRef.current = false;
        setItems([]);
        setContinuationToken('');
        await refetch();
      } else {
        const res: any = await refetch().unwrap();
        const incoming: Tile[] = Array.isArray(res?.results?.items) ? res.results.items : [];
        seenRef.current = new Set();
        const fresh: Tile[] = [];
        for (const it of incoming) {
          if (!it?.key || seenRef.current.has(it.key)) continue;
          seenRef.current.add(it.key);
          fresh.push(it);
        }
        hasMoreRef.current = Boolean(res?.results?.continuationToken);
        fetchingMoreRef.current = false;
        setItems(fresh);
      }
    } catch {}
    setRefreshing(false);
  }, [continuationToken, refetch]);

  const ads = adsData?.results?.ads ?? [];

  // Weave native ad TILES into the content stream at a varied gap (adGap),
  // then chunk everything into 2-col rows — so ads pack into the grid like any
  // other tile instead of breaking it with a full-width card.
  const rows = useMemo<Row[]>(() => {
    const combined: Tile[] = [];
    let ai = 0;
    let since = 0;
    let gap = adGap(0);
    items.forEach((it) => {
      combined.push(it);
      since++;
      if (ads.length && since >= gap) {
        const ad = ads[ai % ads.length];
        combined.push({ kind: 'ad', key: `ad-${ad.id}-${ai}`, ad });
        ai++;
        since = 0;
        gap = adGap(ai);
      }
    });
    const out: Row[] = [];
    for (let i = 0; i < combined.length; i += 2) {
      const pair = combined.slice(i, i + 2);
      out.push({ type: 'pair', key: `pair-${pair[0].key}`, items: pair });
    }
    return out;
  }, [items, ads]);

  // Viewability — only autoplay the row/ad on screen.
  const [viewableKeys, setViewableKeys] = useState<Set<string>>(new Set());
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!viewableItems.length) return;
    setViewableKeys(new Set(viewableItems.map((v) => String(v.key))));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item: row }: { item: Row }) => {
      const active = viewableKeys.has(row.key);
      return (
        <View style={styles.pairRow}>
          {row.items.map((t, idx) => (
            <View key={t.key} style={{ marginRight: idx === 0 ? GAP : 0 }}>
              {t.kind === 'ad' ? (
                <BusinessTile ad={t.ad} width={cellW} isViewable={active} style={styles.gridTile} />
              ) : t.kind === 'film' ? (
                <FilmTile film={t.film} width={cellW} onNavigate={onNavigate} style={styles.gridTile} />
              ) : t.kind === 'board' ? (
                <BoardTile board={t.board} width={cellW} onNavigate={onNavigate} style={styles.gridTile} isViewable={active} />
              ) : (
                <SessionTile group={t.group} width={cellW} onNavigate={onNavigate} style={styles.gridTile} isViewable={active} />
              )}
            </View>
          ))}
        </View>
      );
    },
    [cellW, onNavigate, viewableKeys]
  );

  const incomingHasItems = (currentData?.results?.items?.length ?? 0) > 0;
  const stillLoading = isFetching || !currentData || incomingHasItems;

  return (
    <FlatList
      style={{ flex: 1 }}
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={renderItem}
      extraData={viewableKeys}
      ListHeaderComponent={ListHeaderComponent}
      numColumns={1}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={viewabilityConfig}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={isDark ? '#9ca3af' : '#6b7280'} />
      }
      ListEmptyComponent={
        stillLoading ? (
          <ExploreGridSkeleton cellW={cellW} />
        ) : (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Nothing to explore yet</Text>
          </View>
        )
      }
      ListFooterComponent={
        isFetching && items.length > 0 ? (
          <View style={{ paddingVertical: 20 }}><ActivityIndicator /></View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  pairRow: { flexDirection: 'row', paddingHorizontal: PAD, marginBottom: GAP + 6 },
  gridTile: { marginRight: 0 },
  centered: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 14 },
});
