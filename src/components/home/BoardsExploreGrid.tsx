import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  useColorScheme,
  useWindowDimensions,
  StyleSheet,
  type ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useGetLatestShapersQuery } from '../../store';
import type { Board, BoardPhoto, BoardroomShaper } from '../../store/apis/endpoints/boardroom';
import { boardPhotoDisplay } from '../../helpers/mediaUrl';
import AutoplayVideo from '../AutoplayVideo';

/**
 * "Boards" mode of the Discover Explore grid — a location-independent 2-column
 * grid of individual boards from shapers all over the vault. Reuses the
 * latest-shapers feed (which inlines each shaper's featured boards) and flattens
 * it client-side; tapping a tile opens the board detail page. No new backend.
 *
 * Video board covers autoplay (muted, looping) while their tile is on screen —
 * mirrors the session tiles, via the shared AutoplayVideo + a viewable-keys Set.
 */

const PAD = 12;
const GAP = 10;

// Same thumbnail pick as ShaperBoardsGrid: honor the shaper's chosen cover,
// else the first photo. Inlined (6 lines) to avoid importing the heavy profile
// grid module just for this helper.
function pickThumb(board: Board): BoardPhoto | undefined {
  const photos = board.photos ?? [];
  if (board.thumbnail_photo_id) {
    const found = photos.find((p) => p.id === board.thumbnail_photo_id);
    if (found) return found;
  }
  return photos[0];
}

type FlatBoard = { board: Board; shaper: BoardroomShaper };

export default function BoardsExploreGrid({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const { width } = useWindowDimensions();
  const cellW = Math.floor((width - PAD * 2 - GAP) / 2);
  const tileH = Math.round((cellW * 5) / 4); // portrait — suits surfboards

  const { data, currentData, isFetching, refetch } = useGetLatestShapersQuery({ limit: 50 });
  const [refreshing, setRefreshing] = useState(false);

  // Flatten featured boards across shapers into one grid. Round-robin by board
  // index so the grid alternates shapers (board 0 from each shaper, then board
  // 1, ...) instead of clustering all of one shaper's boards together — a more
  // varied "glance through the vault" feel, and no single prolific shaper
  // dominates the top. Shaper order (latest activity first) is preserved.
  const boards = useMemo<FlatBoard[]>(() => {
    const shapers: BoardroomShaper[] = data?.results?.shapers ?? [];
    const perShaper = shapers.map((sh) => ({
      sh,
      list: (sh.featured_boards ?? []).filter((b) => b?.id && pickThumb(b)),
    }));
    const out: FlatBoard[] = [];
    const seen = new Set<string>();
    let i = 0;
    let added = true;
    while (added) {
      added = false;
      for (const { sh, list } of perShaper) {
        const b = list[i];
        if (!b || seen.has(b.id)) continue;
        seen.add(b.id);
        out.push({ board: b, shaper: sh });
        added = true;
      }
      i++;
    }
    return out;
  }, [data]);

  // Viewability → which tiles autoplay their clip. keyExtractor uses board.id,
  // so the ViewToken keys are board ids.
  const [viewableKeys, setViewableKeys] = useState<Set<string>>(new Set());
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setViewableKeys(new Set(viewableItems.map((v) => String(v.key))));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch {}
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: FlatBoard }) => {
      const { board, shaper } = item;
      const disp = boardPhotoDisplay(pickThumb(board));
      const active = viewableKeys.has(board.id);
      const playing = disp.isVideo && !!disp.videoUrl && active;
      return (
        <Pressable onPress={() => onNavigate(`/board/${board.id}`)} style={{ width: cellW }}>
          <View
            style={[
              styles.tile,
              { width: cellW, height: tileH, backgroundColor: isDark ? '#1f2937' : '#e5e7eb' },
            ]}
          >
            {/* Poster sits underneath in all states (overlay-mode video fades
                over it when this tile is on screen). */}
            {disp.posterUrl ? (
              <Image
                source={{ uri: disp.posterUrl }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                transition={150}
              />
            ) : null}

            {playing ? (
              <AutoplayVideo
                uri={disp.videoUrl as string}
                active
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
              />
            ) : null}

            {/* Clip affordance — shown only on the still (poster) state. */}
            {disp.isVideo && !playing ? (
              <View style={styles.videoCenter} pointerEvents="none">
                <View style={styles.videoCircle}>
                  <Ionicons name="videocam" size={16} color="#fff" />
                </View>
              </View>
            ) : null}

            {/* Top-left: board name + dimensions */}
            <View style={styles.label} pointerEvents="none">
              <Text style={styles.labelName} numberOfLines={1}>
                {board.name}
              </Text>
              {board.dimensions ? (
                <Text style={styles.labelDims} numberOfLines={1}>
                  {board.dimensions}
                </Text>
              ) : null}
            </View>

            {/* Bottom-left: shaper attribution (who shaped it) */}
            <View style={styles.shaperTag} pointerEvents="none">
              <Text style={styles.shaperText} numberOfLines={1}>
                @{shaper.handle}
              </Text>
            </View>
          </View>
        </Pressable>
      );
    },
    [cellW, tileH, isDark, onNavigate, viewableKeys]
  );

  // Settle on the empty state only once the query has resolved with no boards
  // (covers initial load + the cached-but-not-yet-populated frame).
  const stillLoading = isFetching || !currentData;

  return (
    <FlatList
      style={{ flex: 1 }}
      data={boards}
      keyExtractor={(b) => b.board.id}
      renderItem={renderItem}
      extraData={viewableKeys}
      numColumns={2}
      columnWrapperStyle={{ paddingHorizontal: PAD, justifyContent: 'space-between' }}
      ItemSeparatorComponent={() => <View style={{ height: GAP + 6 }} />}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onViewableItemsChanged={onViewable}
      viewabilityConfig={viewabilityConfig}
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
            <Text style={styles.emptyText}>No boards to explore yet</Text>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  tile: { position: 'relative', borderRadius: 16, overflow: 'hidden' },
  videoCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  videoCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    top: 6,
    left: 6,
    maxWidth: '90%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  labelName: { color: '#fff', fontSize: 11, fontWeight: '700' },
  labelDims: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '500', marginTop: 1 },
  shaperTag: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  shaperText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  centered: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 14 },
});
