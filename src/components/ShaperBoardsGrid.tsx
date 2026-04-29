import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  useColorScheme,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ImageViewing from 'react-native-image-viewing';
import {
  useGetShaperBoardsQuery,
  useCreateMyBoardPhotosMutation,
  useDeleteMyBoardMutation,
  type Board,
  type BoardPhoto,
} from '../store';
import { getBoardPhotoUrl } from '../helpers/mediaUrl';
import ActionSheet from './ActionSheet';
import type { ActionSheetOption } from './ActionSheet';
import BoardEditSheet from './shaper/BoardEditSheet';

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

  const boards = useMemo<Board[]>(() => data?.results?.boards ?? [], [data]);
  const featuredCount = boards.filter((b) => b.is_featured).length;
  const [viewerState, setViewerState] = useState<{ photos: BoardPhoto[]; index: number } | null>(null);

  // Management state — only used when isSelf
  const [actionTarget, setActionTarget] = useState<Board | null>(null);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [createMyBoardPhotos] = useCreateMyBoardPhotosMutation();
  const [deleteMyBoard] = useDeleteMyBoardMutation();

  const openBoardLightbox = useCallback((board: Board, photoIndex: number) => {
    if (!board.photos.length) return;
    setViewerState({ photos: board.photos, index: photoIndex });
  }, []);

  const openManageSheet = useCallback((board: Board) => {
    setActionTarget(board);
  }, []);

  const handleAddPhotos = useCallback(async (board: Board) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'SurfVault needs photo library access to upload board photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (result.canceled) return;
    try {
      const presigned = await createMyBoardPhotos({
        boardId: board.id,
        payload: {
          files: result.assets.map((a) => ({
            file_uuid: cryptoRandomUUID(),
            file_type: a.mimeType ?? 'image/jpeg',
          })),
        },
      }).unwrap();
      const photos = presigned?.results?.photos ?? [];
      await Promise.all(
        photos.map(async (p: any, i: number) => {
          const asset = result.assets[i];
          const blob = await (await fetch(asset.uri)).blob();
          await fetch(p.url, {
            method: 'PUT',
            headers: { 'Content-Type': asset.mimeType ?? 'image/jpeg' },
            body: blob,
          });
        })
      );
      // Manual refetch only AFTER PUTs land — see admin.js note on why
      // createBoardPhotos doesn't auto-invalidate.
      refetch();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.data?.message || err?.message || 'Try again');
    }
  }, [createMyBoardPhotos, refetch]);

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

  const actionOptions: ActionSheetOption[] = useMemo(() => {
    if (!actionTarget) return [];
    const board = actionTarget;
    return [
      {
        label: 'Edit board',
        icon: 'create-outline',
        iconLibrary: 'ionicons',
        onPress: () => {
          setActionTarget(null);
          setEditingBoard(board);
        },
      },
      {
        label: 'Add photos',
        icon: 'images-outline',
        iconLibrary: 'ionicons',
        onPress: () => {
          setActionTarget(null);
          handleAddPhotos(board);
        },
      },
      {
        label: 'Delete board',
        destructive: true,
        icon: 'trash-outline',
        iconLibrary: 'ionicons',
        onPress: () => {
          setActionTarget(null);
          handleDeleteBoard(board);
        },
      },
    ];
  }, [actionTarget, handleAddPhotos, handleDeleteBoard]);

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

  const lightboxImages = viewerState
    ? viewerState.photos
        .map((p) => getBoardPhotoUrl(p.s3_key))
        .filter((u): u is string => !!u)
        .map((uri) => ({ uri }))
    : [];

  return (
    <View>
      {mode === 'list' ? (
        <View>
          {boards.map((board) => (
            <BoardListCard
              key={board.id}
              board={board}
              isDark={isDark}
              onPhotoPress={(idx) => openBoardLightbox(board, idx)}
              isSelf={isSelf}
              onManagePress={() => openManageSheet(board)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.gridWrap}>
          {gridTiles(boards).map((t, idx) => (
            <Pressable
              key={t.board.id}
              onPress={() => openBoardLightbox(t.board, 0)}
              style={[
                styles.tile,
                {
                  marginRight: (idx + 1) % GRID_COLS === 0 ? 0 : GRID_GAP,
                  marginBottom: GRID_GAP,
                },
              ]}
            >
              <Image
                source={{ uri: getBoardPhotoUrl(t.photo.s3_key) ?? undefined }}
                style={styles.tileImg}
                contentFit="cover"
                transition={150}
              />
              <View style={styles.tileLabelWrap} pointerEvents="none">
                <Text style={styles.tileLabelText} numberOfLines={1}>
                  {t.board.name}
                </Text>
              </View>
              {t.board.photos.length > 1 ? (
                <View style={styles.multiPhotoBadge} pointerEvents="none">
                  <Ionicons name="copy-outline" size={11} color="#fff" />
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}

      <Modal
        visible={viewerState !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerState(null)}
      >
        {viewerState ? (
          <ImageViewing
            images={lightboxImages}
            imageIndex={viewerState.index}
            visible
            onRequestClose={() => setViewerState(null)}
          />
        ) : null}
      </Modal>

      {isSelf && (
        <>
          <ActionSheet
            visible={actionTarget !== null}
            options={actionOptions}
            header={
              actionTarget
                ? { title: actionTarget.name, subtitle: 'Manage board' }
                : undefined
            }
            onClose={() => setActionTarget(null)}
          />
          <BoardEditSheet
            visible={editingBoard !== null}
            board={editingBoard}
            featuredCount={featuredCount}
            onClose={() => setEditingBoard(null)}
          />
        </>
      )}
    </View>
  );
}

// crypto.randomUUID isn't reliably available in React Native runtimes.
// Falls back to a v4-shape generator for client-side keys.
function cryptoRandomUUID(): string {
  // @ts-ignore - some RN runtimes expose this
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Mirrors SessionCard's chrome: header (name + subtitle + ellipsis) →
// edge-to-edge thumbnail (single image OR paging carousel) → tapered dot
// pager. Visually matches the rest of the feed so shaper boards read as
// first-class content, not a different design language.
function BoardListCard({
  board,
  isDark,
  onPhotoPress,
  isSelf = false,
  onManagePress,
}: {
  board: Board;
  isDark: boolean;
  onPhotoPress: (idx: number) => void;
  isSelf?: boolean;
  onManagePress?: () => void;
}) {
  const photos = board.photos ?? [];
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
                <Pressable onPress={() => onPhotoPress(index)} style={slideStyle}>
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

// Flatten boards to tile entries — one tile per first photo of each board.
// (Multi-photo browsing happens in the lightbox; the gallery reads cleaner
// at one-per-board.)
function gridTiles(boards: Board[]): { board: Board; photo: BoardPhoto }[] {
  const out: { board: Board; photo: BoardPhoto }[] = [];
  for (const b of boards) {
    const first = b.photos[0];
    if (first) out.push({ board: b, photo: first });
  }
  return out;
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
  tileLabelWrap: {
    position: 'absolute',
    top: 4,
    left: 4,
    maxWidth: '90%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tileLabelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  multiPhotoBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
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
