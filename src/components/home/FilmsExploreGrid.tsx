import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { useGetLatestFilmsQuery } from '../../store';
import type { Film } from '../../store/apis/endpoints/films';
import { FilmTile, GRID_TILE_HEIGHT_RATIO } from './FeedTiles';

/**
 * "Films" mode of the Discover Explore grid — a films-only 3-column grid of the
 * latest catalogued surf films (newest first). Reuses the shared FilmTile in its
 * Explore form (verification pill + creator @handle). Mirror of web
 * FilmsExploreGrid. No new backend.
 */

const PAD = 0; // edge-to-edge — tiles touch the screen edges
const COLS = 3; // tiles per row
const GAP = 6; // gap between tiles (both axes)

export default function FilmsExploreGrid({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const { width } = useWindowDimensions();
  const cellW = Math.floor((width - PAD * 2 - GAP * (COLS - 1)) / COLS);

  const { data, currentData, isFetching, refetch } = useGetLatestFilmsQuery({ limit: 60 });
  const [refreshing, setRefreshing] = useState(false);

  const films = useMemo<Film[]>(() => data?.results?.films ?? [], [data]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch {}
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: Film }) => (
      <FilmTile film={item} width={cellW} onNavigate={onNavigate} style={styles.gridTile} heightRatio={GRID_TILE_HEIGHT_RATIO} />
    ),
    [cellW, onNavigate]
  );

  // Settle on the empty state only once the query resolves with no films.
  const stillLoading = isFetching || !currentData;

  return (
    <FlatList
      style={{ flex: 1 }}
      data={films}
      keyExtractor={(f) => f.id}
      renderItem={renderItem}
      numColumns={COLS}
      columnWrapperStyle={{ paddingHorizontal: PAD, gap: GAP }}
      ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={isDark ? '#9ca3af' : '#6b7280'}
        />
      }
      ListEmptyComponent={
        stillLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No films to explore yet</Text>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  gridTile: { marginRight: 0 },
  centered: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 14 },
});
