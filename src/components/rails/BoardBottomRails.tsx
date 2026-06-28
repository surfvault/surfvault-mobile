import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useGetShaperBoardsQuery, type Board } from '../../store';
import { boardPhotoDisplay } from '../../helpers/mediaUrl';
import { useTrackedPush } from '../../context/NavigationContext';
import { pickThumbnailPhoto } from '../ShaperBoardsGrid';
import BottomRail from './BottomRail';

const TILE_W = 136;

function BoardTile({ board, onPress }: { board: Board; onPress: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const disp = boardPhotoDisplay(pickThumbnailPhoto(board));
  const dims = board.dimensions || (board.board_type ?? '');
  return (
    <Pressable onPress={onPress} style={{ width: TILE_W }}>
      <View style={[styles.thumb, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
        {disp.posterUrl ? (
          <Image source={{ uri: disp.posterUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Ionicons name="images-outline" size={26} color={isDark ? '#374151' : '#d1d5db'} />
        )}
        {disp.isVideo ? (
          <View style={styles.playBadge} pointerEvents="none">
            <Ionicons name="play" size={12} color="#fff" />
          </View>
        ) : null}
        {board.is_featured ? (
          <View style={styles.featuredBadge} pointerEvents="none">
            <MaterialCommunityIcons name="star" size={9} color="#fcd34d" />
            <Text style={styles.featuredText}>Featured</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileTitle, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
        {board.name || 'Board'}
      </Text>
      {dims ? (
        <Text style={styles.tileSub} numberOfLines={1}>{dims}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Bottom-of-board rail: "More boards from @handle". Boards load whole (no
 * pagination), so it renders right below the photo grid. Renders nothing when
 * the shaper has no other boards.
 */
export default function BoardBottomRails({
  handle,
  excludeBoardId,
}: {
  handle: string;
  excludeBoardId?: string;
}) {
  const trackedPush = useTrackedPush();
  const { data } = useGetShaperBoardsQuery({ handle }, { skip: !handle });
  const otherBoards: Board[] = ((data as any)?.results?.boards || []).filter(
    (b: Board) => b?.id !== excludeBoardId
  );

  return (
    <View style={{ paddingBottom: 24 }}>
      <BottomRail
        title={handle ? `More from @${handle}` : 'More boards'}
        itemCount={otherBoards.length}
        onSeeAll={handle ? () => trackedPush(`/user/${handle}` as any) : undefined}
      >
        {otherBoards.map((b) => (
          <BoardTile key={b.id} board={b} onPress={() => trackedPush(`/board/${b.id}` as any)} />
        ))}
      </BottomRail>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: TILE_W,
    height: TILE_W * 0.75,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  playBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  featuredText: { color: '#fcd34d', fontSize: 9, fontWeight: '700' },
  tileTitle: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  tileSub: { fontSize: 11, color: '#6b7280', marginTop: 1 },
});
