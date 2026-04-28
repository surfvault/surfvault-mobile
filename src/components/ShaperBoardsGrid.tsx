import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Modal,
  useColorScheme,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import ImageViewing from 'react-native-image-viewing';
import { useGetShaperBoardsQuery, type Board, type BoardPhoto } from '../store';
import { getBoardPhotoUrl } from '../helpers/mediaUrl';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLS = 3;
const GRID_GAP = 2;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

/**
 * Boards gallery for a shaper user profile. Renders the shaper's boards as a
 * 3-col grid; each tile shows the first photo + board name pinned to the
 * top-left. Tapping any tile opens a fullscreen lightbox with all photos for
 * that board (uses react-native-image-viewing). Featured boards sort first.
 */
export default function ShaperBoardsGrid({ handle }: { handle: string }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { data, isLoading, isError } = useGetShaperBoardsQuery({ handle });

  const boards = useMemo<Board[]>(() => data?.results?.boards ?? [], [data]);
  const [viewerState, setViewerState] = useState<{ photos: BoardPhoto[]; index: number } | null>(null);

  const openBoardLightbox = useCallback((board: Board, photoIndex: number) => {
    if (!board.photos.length) return;
    setViewerState({ photos: board.photos, index: photoIndex });
  }, []);

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

  // Flatten boards into tile entries — one tile per first photo of each board.
  // (We could show every photo, but for the gallery one-per-board reads cleaner;
  // multi-photo browsing happens in the lightbox.)
  const tiles = boards
    .map((b) => {
      const first = b.photos[0];
      return first ? { board: b, photo: first } : null;
    })
    .filter((t): t is { board: Board; photo: BoardPhoto } => t !== null);

  const lightboxImages = viewerState
    ? viewerState.photos
        .map((p) => getBoardPhotoUrl(p.s3_key))
        .filter((u): u is string => !!u)
        .map((uri) => ({ uri }))
    : [];

  return (
    <View>
      <View style={styles.gridWrap}>
        {tiles.map((t, idx) => (
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
    </View>
  );
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
});
