import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Animated,
  useColorScheme,
  useWindowDimensions,
  StyleSheet,
  type ViewToken,
} from 'react-native';
import {
  useGetLatestSessionsQuery,
  useGetAdsQuery,
  useGetLatestShapersQuery,
} from '../../store';
import { useUser } from '../../context/UserProvider';
import { useAuth } from '../../context/AuthProvider';
import { useUserCoords } from '../../hooks/useUserCoords';
import SponsoredCard from '../SponsoredCard';
import { SessionTile, ShaperTile } from './FeedTiles';

/**
 * The "Discover" feed re-cast as a browsable 2-column Explore grid — lives as
 * the default (empty-query) state of the home Search screen. Worldwide latest
 * sessions render as tiles; nearby shapers are interleaved as same-size tiles;
 * paid ads break the grid as full-width feature rows (reusing SponsoredCard).
 *
 * Self-contained data pipeline (own queries + pagination) so it's fully
 * decoupled from the home feed picker.
 */

const PAD = 12; // outer horizontal padding
const GAP = 10; // gap between the two columns
const SHAPER_EVERY = 5; // a shaper tile after every N session tiles
const AD_EVERY_ROWS = 2; // a full-width ad after every N grid rows (≈ every 4 tiles)

type Tile =
  | { kind: 'session'; key: string; data: any }
  | { kind: 'shaper'; key: string; data: any };
type Row =
  | { type: 'pair'; key: string; items: Tile[] }
  | { type: 'ad'; key: string; ad: any };

// Pulsing 2-column tile skeleton — matches HomeSkeleton's look so the Explore
// grid loads with placeholders instead of a spinner, consistent with the app.
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
              style={{
                width: cellW,
                height: tileH,
                borderRadius: 16,
                backgroundColor: blockColor,
                opacity: pulse,
                marginRight: c === 0 ? GAP : 0,
              }}
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
}: {
  onNavigate: (path: string) => void;
  ListHeaderComponent?: React.ReactElement | null;
}) {
  const { user } = useUser();
  const { isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const cellW = Math.floor((width - PAD * 2 - GAP) / 2);

  // Geo-boost ads when we have coords; no prompt here (Explore is browse-only).
  const { lat, lon, hasCoords } = useUserCoords({ skipPrompt: true });

  const [groups, setGroups] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const seenRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const fetchingMoreRef = useRef(false);

  const { data, currentData, isFetching } = useGetLatestSessionsQuery(
    { userId: user?.id, limit: 12, continuationToken, groupByBreakDate: true },
    { skip: isAuthenticated && !user?.id }
  );
  const { data: adsData } = useGetAdsQuery({
    feed: true,
    lat: hasCoords && lat != null ? lat : undefined,
    lon: hasCoords && lon != null ? lon : undefined,
    limit: 30,
  });
  const { data: shapersData } = useGetLatestShapersQuery({ limit: 50 });

  // Accumulate grouped sessions across pages (dedup by date|group_key).
  useEffect(() => {
    const results = currentData?.results;
    if (!results) return;
    const incoming = Array.isArray(results.groups) ? results.groups : [];
    hasMoreRef.current = Boolean(results.continuationToken);
    const fresh: any[] = [];
    for (const g of incoming) {
      const key = `${g.session_date}|${g.group_key}`;
      if (!key || seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      fresh.push(g);
    }
    fetchingMoreRef.current = false;
    if (fresh.length) setGroups((prev) => prev.concat(fresh));
  }, [currentData]);

  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || fetchingMoreRef.current) return;
    const next = data?.results?.continuationToken;
    if (!next) return;
    fetchingMoreRef.current = true;
    setContinuationToken(next);
  }, [data]);

  const ads = adsData?.results?.ads ?? [];
  const shapers = shapersData?.results?.shapers ?? [];

  // Build the grid rows: session tiles + interleaved shaper tiles, paired into
  // 2-col rows, with full-width ad rows injected at cadence.
  const rows = useMemo<Row[]>(() => {
    const tiles: Tile[] = [];
    let si = 0;
    // Only groups the session tile can render (needs at least one session).
    // Hidden-location groups DO render now (region/country label), so they're
    // kept — this just drops any empty group so every 2-col row stays full.
    const renderable = groups.filter((g) => (g?.sessions?.length ?? 0) > 0);
    renderable.forEach((g, i) => {
      tiles.push({ kind: 'session', key: `s-${g.session_date}|${g.group_key}`, data: g });
      if ((i + 1) % SHAPER_EVERY === 0 && si < shapers.length) {
        const sh = shapers[si++];
        tiles.push({ kind: 'shaper', key: `sh-${sh.id ?? sh.handle}`, data: sh });
      }
    });

    const out: Row[] = [];
    let ai = 0;
    let pairCount = 0; // count PAIR rows only (not the ad rows) so the cadence
    // stays a full 2×2 block (AD_EVERY_ROWS rows = 4 cards) between every ad.
    for (let i = 0; i < tiles.length; i += 2) {
      const pair = tiles.slice(i, i + 2);
      out.push({ type: 'pair', key: `pair-${pair[0].key}`, items: pair });
      pairCount++;
      if (pairCount % AD_EVERY_ROWS === 0 && ads.length) {
        const ad = ads[ai % ads.length];
        out.push({ type: 'ad', key: `ad-${ad.id}-${ai}`, ad });
        ai++;
      }
    }
    return out;
  }, [groups, shapers, ads]);

  // Viewability — only autoplay the ad whose row is on screen.
  const [viewableKeys, setViewableKeys] = useState<Set<string>>(new Set());
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!viewableItems.length) return;
    setViewableKeys(new Set(viewableItems.map((v) => v.key)));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item: row }: { item: Row }) => {
      if (row.type === 'ad') {
        return (
          <View style={styles.adRow}>
            <SponsoredCard ad={row.ad} placement="content" isViewable={viewableKeys.has(row.key)} />
          </View>
        );
      }
      const active = viewableKeys.has(row.key);
      return (
        <View style={styles.pairRow}>
          {row.items.map((t, idx) => (
            <View key={t.key} style={{ marginRight: idx === 0 ? GAP : 0 }}>
              {t.kind === 'session' ? (
                <SessionTile group={t.data} width={cellW} onNavigate={onNavigate} style={styles.gridTile} isViewable={active} />
              ) : (
                <ShaperTile shaper={t.data} width={cellW} onNavigate={onNavigate} style={styles.gridTile} isViewable={active} />
              )}
            </View>
          ))}
        </View>
      );
    },
    [cellW, onNavigate, viewableKeys]
  );

  // Show the loader (not the empty text) until we have a settled, genuinely
  // empty response. Covers: query not started yet, in-flight, AND the one-frame
  // gap on (re)mount where cached data is present but the accumulator effect
  // hasn't populated `groups` yet (e.g. right after tapping Cancel).
  const incomingHasGroups = (currentData?.results?.groups?.length ?? 0) > 0;
  const stillLoading = isFetching || !currentData || incomingHasGroups;

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
      ListEmptyComponent={
        stillLoading ? (
          <ExploreGridSkeleton cellW={cellW} />
        ) : (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No sessions to explore yet</Text>
          </View>
        )
      }
      ListFooterComponent={
        isFetching && groups.length > 0 ? (
          <View style={{ paddingVertical: 20 }}><ActivityIndicator /></View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  // Extra bottom room so a multi-session tile's depth-peek edges show before
  // the next row covers them.
  pairRow: { flexDirection: 'row', paddingHorizontal: PAD, marginBottom: GAP + 6 },
  adRow: { marginBottom: 8 },
  gridTile: { marginRight: 0 },
  centered: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 14 },
});
