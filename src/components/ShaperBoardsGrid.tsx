import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Alert,
  Platform,
  Share,
  useColorScheme,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useGetShaperBoardsQuery,
  useDeleteMyBoardMutation,
  type Board,
  type BoardPhoto,
} from '../store';
import { getBoardPhotoUrl } from '../helpers/mediaUrl';
import { useTrackedPush } from '../context/NavigationContext';
import { useRequireAuth } from '../hooks/useRequireAuth';
import ActionSheet from './ActionSheet';
import type { ActionSheetSection } from './ActionSheet';
import ReportBoardSheet from './ReportBoardSheet';

// Match SessionCard's formatCount so badges read the same way.
const formatCount = (n: number): string => {
  const v = Number(n) || 0;
  if (v < 1000) return `${v}`;
  if (v < 10000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v / 1000)}k`;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLS = 3;
const GRID_GAP = 2;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

export type ShaperBoardsMode = 'grid' | 'list';

/**
 * Boards gallery for a shaper user profile.
 * - mode='grid' (default): 3-col tile grid; each tile is the first photo +
 *   board name pinned top-left. Tapping opens a fullscreen lightbox.
 * - mode='list': full-width board cards with name, type chip, dimensions,
 *   description, and a horizontal photo strip. Photo taps open the lightbox
 *   on the matching index.
 *
 * Both modes share the same self-fetched data — RTK Query dedupes against
 * the same handle so toggling tabs doesn't trigger a re-fetch.
 */
export default function ShaperBoardsGrid({
  handle,
  mode = 'grid',
  isSelf = false,
}: {
  handle: string;
  mode?: ShaperBoardsMode;
  isSelf?: boolean;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { data, isLoading, isError, refetch } = useGetShaperBoardsQuery({ handle });
  const trackedPush = useTrackedPush();
  const requireAuth = useRequireAuth();

  const boards = useMemo<Board[]>(() => data?.results?.boards ?? [], [data]);

  // Quick-actions state. `actionTarget` is set for both self (Share +
  // Delete) and non-self (Share + Report) — the section list in
  // `actionSections` branches on `isSelf`. Edit / Add photos / View live
  // on the dedicated board detail page; this sheet is intentionally slim.
  // View tracking happens on the detail page mount, not here.
  const [actionTarget, setActionTarget] = useState<Board | null>(null);
  const [reportBoardId, setReportBoardId] = useState<string | null>(null);
  const [deleteMyBoard] = useDeleteMyBoardMutation();

  // Tap on a tile / list-mode photo opens the dedicated board detail page —
  // SEO-friendly URL, board-level page-mount view tracking, parity with
  // session detail. Index is currently ignored on the detail page (the page
  // itself drives lightbox state) but reserved for future deep-linking.
  const openBoardDetail = useCallback((board: Board, _photoIndex: number = 0) => {
    if (!board?.id) return;
    trackedPush(`/board/${board.id}` as any);
  }, [trackedPush]);

  const openManageSheet = useCallback((board: Board) => {
    setActionTarget(board);
  }, []);

  const handleShareBoard = useCallback(async (board: Board) => {
    const shareUrl = `https://app.surf-vault.com/${handle}/boards/${board.id}`;
    try {
      await Share.share(Platform.OS === 'ios' ? { url: shareUrl } : { message: shareUrl });
    } catch { /* user cancelled */ }
  }, [handle]);

  const handleDeleteBoard = useCallback((board: Board) => {
    Alert.alert(
      'Delete board?',
      `"${board.name}" and all its photos will be removed. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMyBoard({ boardId: board.id }).unwrap();
            } catch (err: any) {
              Alert.alert('Delete failed', err?.data?.message || err?.message || 'Try again');
            }
          },
        },
      ]
    );
  }, [deleteMyBoard]);

  // Quick-actions sheet — long-press on the profile gallery is a *quick*
  // entry point, NOT the full management surface. The board-detail page is
  // where Edit / Add photos / View live; this sheet only exposes Share and
  // (for owners) Delete. Each action gets its own section so the visual
  // weight matches importance — "Delete board" should never share a row
  // with the casual "Share" affordance.
  const actionSections: ActionSheetSection[] = useMemo(() => {
    if (!actionTarget) return [];
    const board = actionTarget;
    const sections: ActionSheetSection[] = [
      {
        options: [
          {
            label: 'Share',
            icon: 'share-outline',
            iconLibrary: 'ionicons',
            onPress: () => {
              setActionTarget(null);
              handleShareBoard(board);
            },
          },
        ],
      },
    ];
    if (isSelf) {
      sections.push({
        options: [
          {
            label: 'Delete Board',
            destructive: true,
            icon: 'trash-outline',
            iconLibrary: 'ionicons',
            onPress: () => {
              setActionTarget(null);
              handleDeleteBoard(board);
            },
          },
        ],
      });
    } else {
      sections.push({
        options: [
          {
            label: 'Report Board',
            destructive: true,
            icon: 'flag-outline',
            iconLibrary: 'ionicons',
            onPress: () => {
              setActionTarget(null);
              if (!requireAuth()) return;
              setReportBoardId(board.id);
            },
          },
        ],
      });
    }
    return sections;
  }, [actionTarget, isSelf, handleShareBoard, handleDeleteBoard, requireAuth]);

  if (isLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isError || boards.length === 0) {
    return (
      <View style={styles.centerWrap}>
        <Text style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
          {isError ? "Couldn't load boards." : 'No boards listed yet.'}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {mode === 'list' ? (
        <View>
          {boards.map((board) => (
            <BoardListCard
              key={board.id}
              board={board}
              isDark={isDark}
              onPhotoPress={(idx) => openBoardDetail(board, idx)}
              onLongPress={() => openManageSheet(board)}
              isSelf={isSelf}
              onManagePress={() => openManageSheet(board)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.gridWrap}>
          {gridTiles(boards).map((t, idx) => {
            const photoCount = t.board.photos.length;
            // View count is owner-only — mirrors the session pattern. A
            // visiting surfer doesn't need (or want) to see how many times
            // a stranger's board has been viewed.
            const viewCount = isSelf ? Number((t.board as any).view_count ?? 0) : 0;
            return (
              <View
                key={t.board.id}
                style={[
                  styles.tile,
                  {
                    marginRight: (idx + 1) % GRID_COLS === 0 ? 0 : GRID_GAP,
                    marginBottom: GRID_GAP,
                  },
                ]}
              >
                <Pressable
                  onPress={() => openBoardDetail(t.board, 0)}
                  // Long-press is the quick-actions entry point on grid tiles.
                  // Self gets manage actions (Edit / Add photos / Delete);
                  // non-self gets Share + Report. Either way the option list
                  // is built by `actionOptions`.
                  onLongPress={() => openManageSheet(t.board)}
                  delayLongPress={350}
                  style={StyleSheet.absoluteFillObject}
                >
                  <Image
                    source={{ uri: getBoardPhotoUrl(t.photo.s3_key) ?? undefined }}
                    style={styles.tileImg}
                    contentFit="cover"
                    transition={150}
                  />
                </Pressable>

                {/* Top-left: name + dimensions (star icon when featured). */}
                <View style={styles.topLeftLabel} pointerEvents="none">
                  <View style={styles.topLeftRow}>
                    {t.board.is_featured ? (
                      <MaterialCommunityIcons name="star" size={10} color="#fcd34d" style={{ marginRight: 3 }} />
                    ) : null}
                    <Text style={styles.topLeftName} numberOfLines={1}>
                      {t.board.name}
                    </Text>
                  </View>
                  {t.board.dimensions ? (
                    <Text style={styles.topLeftDims} numberOfLines={1}>
                      {t.board.dimensions}
                    </Text>
                  ) : null}
                </View>

                {/* Bottom-left: photo count · view count (matches SessionCard
                    statsBadge pattern). */}
                {(photoCount > 0 || viewCount > 0) ? (
                  <View style={styles.statsBadge} pointerEvents="none">
                    {photoCount > 0 ? (
                      <>
                        <Ionicons name="images-outline" size={10} color="#fff" />
                        <Text style={styles.statsText}>{formatCount(photoCount)}</Text>
                      </>
                    ) : null}
                    {photoCount > 0 && viewCount > 0 ? (
                      <Text style={[styles.statsText, { opacity: 0.7 }]}> · </Text>
                    ) : null}
                    {viewCount > 0 ? (
                      <>
                        <Ionicons name="eye-outline" size={10} color="#fff" />
                        <Text style={styles.statsText}>{formatCount(viewCount)}</Text>
                      </>
                    ) : null}
                  </View>
                ) : null}

                {/* Long-press handles management for self (no explicit
                    ellipsis on grid tiles — keeps the chrome clean). */}
              </View>
            );
          })}
        </View>
      )}

      {/* Quick-actions sheet — long-press on tile or list-card ellipsis.
          Both self and non-self get a sheet; the section list branches
          internally (Share + Delete for owners, Share + Report for
          viewers). Header carries a thumbnail of the board so it reads
          like the session photoSheet on the same product. */}
      <ActionSheet
        visible={actionTarget !== null}
        sections={actionSections}
        header={
          actionTarget
            ? {
                title: actionTarget.name,
                // Match the body subtitle on the board detail page:
                // "<Type> · <Dimensions>" so the same shape reads across
                // surfaces. Falls back to a single segment when only one is
                // set, then to "Board" when neither is.
                subtitle: (() => {
                  const parts = [
                    actionTarget.board_type ? capitalize(actionTarget.board_type) : null,
                    actionTarget.dimensions || null,
                  ].filter(Boolean) as string[];
                  return parts.length ? parts.join(' · ') : 'Board';
                })(),
                imageUri: getBoardPhotoUrl(pickThumbnailPhoto(actionTarget)?.s3_key) ?? undefined,
              }
            : undefined
        }
        onClose={() => setActionTarget(null)}
      />

      <ReportBoardSheet
        visible={reportBoardId !== null}
        boardId={reportBoardId ?? undefined}
        onClose={() => setReportBoardId(null)}
      />
    </View>
  );
}

// Mirrors SessionCard's chrome: header (name + subtitle + ellipsis) →
// edge-to-edge thumbnail (single image OR paging carousel) → tapered dot
// pager. Visually matches the rest of the feed so shaper boards read as
// first-class content, not a different design language.
function BoardListCard({
  board,
  isDark,
  onPhotoPress,
  onLongPress,
  isSelf = false,
  onManagePress,
}: {
  board: Board;
  isDark: boolean;
  onPhotoPress: (idx: number) => void;
  onLongPress?: () => void;
  isSelf?: boolean;
  onManagePress?: () => void;
}) {
  // Promote the owner-selected thumbnail to the first slide of the carousel.
  // Without this, the list-view carousel shows photos in `sort_order` and
  // ignores `thumbnail_photo_id` — so the lead image disagrees with the grid
  // tile (which DOES use `pickThumbnailPhoto`). Memoized so identity is
  // stable across re-renders and `FlatList` doesn't churn its cells.
  const photos = useMemo(() => {
    const list = board.photos ?? [];
    if (!board.thumbnail_photo_id) return list;
    const idx = list.findIndex((p) => p.id === board.thumbnail_photo_id);
    if (idx <= 0) return list; // not present, or already first
    return [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
  }, [board.photos, board.thumbnail_photo_id]);
  const useCarousel = photos.length > 1;
  const [slideWidth, setSlideWidth] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const thumbAspect = 4 / 3;

  const subtitleParts = [
    board.board_type ? capitalize(board.board_type) : null,
    board.dimensions || null,
  ].filter(Boolean) as string[];
  const subtitle = subtitleParts.join(' · ');

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const handleViewChange = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!viewableItems.length) return;
    const first = viewableItems[0];
    if (typeof first.index === 'number') setActiveSlide(first.index);
  }).current;

  return (
    <View style={styles.card}>
      {/* Header — board name + type · dimensions subtitle. No avatar (we're
          already inside the shaper's profile, so the shaper identity is
          implicit). Featured boards get a small star icon next to the name. */}
      <View style={styles.header}>
        <View style={[styles.headerLeft, { flex: 1, marginRight: 8 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.headerNameRow}>
              <Text
                style={[styles.handleText, { color: isDark ? '#fff' : '#111827' }]}
                numberOfLines={1}
              >
                {board.name}
              </Text>
              {board.is_featured ? (
                <MaterialCommunityIcons
                  name="star"
                  size={13}
                  color="#f59e0b"
                  style={{ marginLeft: 4 }}
                />
              ) : null}
            </View>
            {subtitle ? (
              <Text style={[styles.subtitleText, { color: isDark ? '#9ca3af' : '#6b7280' }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {isSelf && onManagePress ? (
          <Pressable onPress={onManagePress} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
          </Pressable>
        ) : null}
      </View>

      {/* Thumbnail — edge to edge. Single image OR horizontal paging carousel
          when the board has multiple photos. Slide Pressables go INSIDE
          renderItem so horizontal swipes don't fight an outer tap recognizer
          (same pattern as SessionCard). */}
      <View onLayout={(e: LayoutChangeEvent) => setSlideWidth(e.nativeEvent.layout.width)}>
        <View
          style={[
            styles.thumbnail,
            styles.emptyThumb,
            { aspectRatio: thumbAspect, backgroundColor: isDark ? '#1f2937' : '#f3f4f6' },
          ]}
        >
          <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
        </View>

        {useCarousel && slideWidth > 0 ? (
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={photos}
            keyExtractor={(p) => p.id}
            onViewableItemsChanged={handleViewChange}
            viewabilityConfig={viewabilityConfig}
            style={[styles.thumbnail, { position: 'absolute', top: 0, left: 0 }]}
            renderItem={({ item, index }) => {
              const slideStyle = { width: slideWidth, aspectRatio: thumbAspect };
              return (
                <Pressable
                  onPress={() => onPhotoPress(index)}
                  onLongPress={onLongPress}
                  delayLongPress={350}
                  style={slideStyle}
                >
                  <Image
                    source={{ uri: getBoardPhotoUrl(item.s3_key) ?? undefined }}
                    style={slideStyle}
                    contentFit="cover"
                    transition={200}
                  />
                </Pressable>
              );
            }}
          />
        ) : !useCarousel && photos[0] ? (
          <Pressable
            onPress={() => onPhotoPress(0)}
            onLongPress={onLongPress}
            delayLongPress={350}
            style={[styles.thumbnail, { aspectRatio: thumbAspect, position: 'absolute', top: 0, left: 0 }]}
          >
            <Image
              source={{ uri: getBoardPhotoUrl(photos[0].s3_key) ?? undefined }}
              style={[styles.thumbnail, { aspectRatio: thumbAspect }]}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        ) : null}
      </View>

      {/* Tapered dot pager — same shape as SessionCard / SponsoredCard. */}
      {useCarousel && (
        <View style={styles.dotsRow}>
          {photos.map((_, i) => {
            const dist = Math.abs(i - activeSlide);
            const size = 8 - dist;
            if (size < 1) return null;
            const isActive = i === activeSlide;
            return (
              <View
                key={i}
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  marginHorizontal: 3,
                  backgroundColor: isActive
                    ? (isDark ? '#d1d5db' : '#6b7280')
                    : (isDark ? '#4b5563' : '#d1d5db'),
                }}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

// Flatten boards to tile entries — one tile per board, using the board's
// chosen thumbnail photo (`thumbnail_photo_id`) when present, otherwise the
// first photo by sort_order. Multi-photo browsing lives on the dedicated
// /board/{id} page.
function gridTiles(boards: Board[]): { board: Board; photo: BoardPhoto }[] {
  const out: { board: Board; photo: BoardPhoto }[] = [];
  for (const b of boards) {
    const thumb = pickThumbnailPhoto(b);
    if (thumb) out.push({ board: b, photo: thumb });
  }
  return out;
}

/**
 * Pick the thumbnail photo for a board: prefer the owner-set
 * `thumbnail_photo_id`, fall back to first photo by sort_order. Exported so
 * other tile/feed renderers can stay consistent (same word as on the
 * session side, where photos are picked from `thumbnail_photo_id`).
 */
export function pickThumbnailPhoto(board: Board): BoardPhoto | undefined {
  const photos = board.photos ?? [];
  if (board.thumbnail_photo_id) {
    const found = photos.find((p) => p.id === board.thumbnail_photo_id);
    if (found) return found;
  }
  return photos[0];
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  centerWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    position: 'relative',
  },
  tileImg: {
    width: '100%',
    height: '100%',
  },
  // ---- Tile overlays (top-left name, bottom-left stats, bottom-right ellipsis) ----
  topLeftLabel: {
    position: 'absolute',
    top: 4,
    left: 4,
    // Cap at 90% so long names truncate cleanly via numberOfLines={1} but the
    // pill itself only spans the actual text — not the whole tile width.
    maxWidth: '90%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  topLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topLeftName: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
  },
  topLeftDims: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
  },
  statsBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  statsText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },


  // ---- List mode (SessionCard-style) ----
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  handleText: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  subtitleText: {
    fontSize: 13,
    marginTop: 1,
  },
  thumbnail: {
    width: '100%',
  },
  emptyThumb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
  },
});
