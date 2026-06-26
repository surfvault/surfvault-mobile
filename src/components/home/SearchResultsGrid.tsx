import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  useColorScheme,
  useWindowDimensions,
  StyleSheet,
  type ViewToken,
} from 'react-native';
import { useGetExploreSearchQuery } from '../../store';
import { useUser } from '../../context/UserProvider';
import { useAuth } from '../../context/AuthProvider';
import { SessionTile, FilmTile, BoardTile, AccountTile, GRID_TILE_HEIGHT_RATIO } from './FeedTiles';

/**
 * Mobile NL/structured search results — one grid against /explore-search.
 *  - Structured (pass `intent`): server skips the LLM, just runs SQL (free).
 *  - Natural language (pass `query` + `context`): server parses with Claude,
 *    echoes the parsed `intent` via `onIntent`.
 * Mixed session/film/board/people/brand tiles; pages accumulate on the cursor.
 * Tapping a person tile calls `onAccountSelect` (focused profile), not navigate.
 */

const PAD = 0;
const COLS = 3;
const GAP = 6;

type Tile = { kind: string; key: string; group?: any; film?: any; board?: any; account?: any };
type Row = { key: string; items: Tile[] };

export default function SearchResultsGrid({
  query,
  intent: structuredIntent,
  context,
  onNavigate,
  onIntent,
  onAccountSelect,
}: {
  query?: string;
  intent?: any;
  context?: any;
  onNavigate: (path: string) => void;
  onIntent?: (intent: any) => void;
  onAccountSelect?: (account: any) => void;
}) {
  const { user } = useUser();
  const { isAuthenticated } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const { width } = useWindowDimensions();
  const cellW = Math.floor((width - PAD * 2 - GAP * (COLS - 1)) / COLS);

  const isStructured = !!structuredIntent;
  const structuredKey = structuredIntent ? JSON.stringify(structuredIntent) : '';

  const [items, setItems] = useState<Tile[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const seenRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const fetchingMoreRef = useRef(false);
  const intentRef = useRef<any>(null);

  useEffect(() => {
    seenRef.current = new Set();
    hasMoreRef.current = false;
    fetchingMoreRef.current = false;
    intentRef.current = null;
    setItems([]);
    setContinuationToken('');
  }, [query, structuredKey]);

  const { data, currentData, isFetching } = useGetExploreSearchQuery(
    isStructured
      ? { intent: structuredIntent, continuationToken, limit: 12 }
      : { query, intent: intentRef.current ?? undefined, continuationToken, context, limit: 12 },
    { skip: (isAuthenticated && !user?.id) || (!isStructured && !query) }
  );

  useEffect(() => {
    const results = currentData?.results;
    if (!results) return;
    if (!isStructured && results.intent && !intentRef.current) {
      intentRef.current = results.intent;
      onIntent?.(results.intent);
    }
    hasMoreRef.current = Boolean(results.continuationToken);
    const incoming = Array.isArray(results.items) ? results.items : [];
    const fresh: Tile[] = [];
    for (const it of incoming as Tile[]) {
      if (!it?.key || seenRef.current.has(it.key)) continue;
      seenRef.current.add(it.key);
      fresh.push(it);
    }
    fetchingMoreRef.current = false;
    if (fresh.length) setItems((prev) => prev.concat(fresh));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentData]);

  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || fetchingMoreRef.current) return;
    const next = data?.results?.continuationToken;
    if (!next) return;
    fetchingMoreRef.current = true;
    setContinuationToken(next);
  }, [data]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (let i = 0; i < items.length; i += COLS) {
      const group = items.slice(i, i + COLS);
      out.push({ key: `row-${group[0].key}`, items: group });
    }
    return out;
  }, [items]);

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
        <View style={styles.row}>
          {row.items.map((t, idx) => (
            <View key={t.key} style={{ marginRight: idx < COLS - 1 ? GAP : 0 }}>
              {t.kind === 'film' ? (
                <FilmTile film={t.film} width={cellW} onNavigate={onNavigate} heightRatio={GRID_TILE_HEIGHT_RATIO} />
              ) : t.kind === 'board' ? (
                <BoardTile board={t.board} width={cellW} onNavigate={onNavigate} isViewable={active} hideAvatar heightRatio={GRID_TILE_HEIGHT_RATIO} />
              ) : t.kind === 'people' || t.kind === 'brand' ? (
                <AccountTile
                  account={t.account}
                  width={cellW}
                  onNavigate={onNavigate}
                  onPress={onAccountSelect ? () => onAccountSelect(t.account) : undefined}
                  heightRatio={GRID_TILE_HEIGHT_RATIO}
                />
              ) : (
                <SessionTile group={t.group} width={cellW} onNavigate={onNavigate} isViewable={active} hideAvatar heightRatio={GRID_TILE_HEIGHT_RATIO} />
              )}
            </View>
          ))}
        </View>
      );
    },
    [cellW, onNavigate, onAccountSelect, viewableKeys]
  );

  const loading = isFetching && items.length === 0;

  return (
    <FlatList
      style={styles.flex}
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={renderItem}
      extraData={viewableKeys}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={viewabilityConfig}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      ListEmptyComponent={
        loading ? (
          <View style={styles.centered}><ActivityIndicator color={isDark ? '#9ca3af' : '#6b7280'} /></View>
        ) : (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No matches found.{'\n'}Try fewer details or a different term.</Text>
          </View>
        )
      }
      ListFooterComponent={isFetching && items.length > 0 ? <View style={{ paddingVertical: 20 }}><ActivityIndicator /></View> : null}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', paddingHorizontal: PAD, marginBottom: GAP },
  centered: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },
});
