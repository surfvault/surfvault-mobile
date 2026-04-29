import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  FlatList,
  useColorScheme,
  type ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTrackedPush } from '../context/NavigationContext';
import type { BoardroomShaper, Board } from '../store';
import { getBoardPhotoUrl } from '../helpers/mediaUrl';

interface ShaperFeedCardProps {
  shaper: BoardroomShaper;
}

/**
 * In-feed card for a nearby shaper. ONE card per shaper — their featured
 * boards (capped at 3 by app convention) render as a swipeable carousel
 * inside the card. Visually mirrors SponsoredCard / SessionCard (40px avatar
 * header, 4:5 portrait hero) but tagged "Shaper" instead of "Sponsored" and
 * routes to the shaper's profile gallery.
 *
 * Aggregating per-shaper (vs per-board) keeps a prolific shaper from cramping
 * the feed with multiple slots.
 */
export default function ShaperFeedCard({ shaper }: ShaperFeedCardProps) {
  const isDark = useColorScheme() === 'dark';
  const trackedPush = useTrackedPush();
  const [width, setWidth] = useState(Dimensions.get('window').width);
  const [activeIdx, setActiveIdx] = useState(0);

  const boards = useMemo<Board[]>(() => shaper.featured_boards ?? [], [shaper.featured_boards]);
  const isCarousel = boards.length > 1;

  const openShaperProfile = useCallback(() => {
    trackedPush(`/user/${shaper.handle}` as any);
  }, [trackedPush, shaper.handle]);

  // Track which board is centered. 60% threshold matches SponsoredCard so the
  // pager dots and (future) per-board impression tracking stay in sync.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!viewableItems.length) return;
    const first = viewableItems[0];
    if (typeof first.index === 'number') setActiveIdx(first.index);
  }).current;

  if (!boards.length) return null;

  return (
    <View style={styles.card} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Header — shaper identity */}
      <View style={styles.header}>
        <Pressable onPress={openShaperProfile} style={styles.headerLeft}>
          <View style={[styles.avatar, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            {shaper.picture ? (
              <Image source={{ uri: shaper.picture }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <MaterialCommunityIcons
                name="hammer-wrench"
                size={18}
                color={isDark ? '#9ca3af' : '#6b7280'}
              />
            )}
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={[styles.shaperName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                {shaper.name ?? shaper.handle}
              </Text>
              <View style={styles.shaperPill}>
                <Text style={styles.shaperPillText}>Shaper</Text>
              </View>
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {formatDistance(shaper.distance_km)} away · {boards.length} {boards.length === 1 ? 'board' : 'boards'}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Hero — single board or swipeable carousel of boards */}
      {isCarousel ? (
        <FlatList
          data={boards}
          keyExtractor={(b) => b.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          renderItem={({ item }) => (
            <Pressable onPress={openShaperProfile}>
              <BoardSlide board={item} width={width} isDark={isDark} />
            </Pressable>
          )}
        />
      ) : (
        <Pressable onPress={openShaperProfile}>
          <BoardSlide board={boards[0]} width={width} isDark={isDark} />
        </Pressable>
      )}

      {/* Tapered dot pager — same shape as SponsoredCard / SessionCard. */}
      {isCarousel && (
        <View style={styles.dotsRow}>
          {boards.map((b, i) => {
            const dist = Math.abs(i - activeIdx);
            const size = 8 - dist;
            if (size < 1) return null;
            const isActive = i === activeIdx;
            return (
              <View
                key={b.id}
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

function BoardSlide({ board, width, isDark }: { board: Board; width: number; isDark: boolean }) {
  const heroUri = getBoardPhotoUrl(board.photos?.[0]?.s3_key);
  return (
    <View style={[styles.thumb, { width, backgroundColor: isDark ? '#0b0b0b' : '#f3f4f6' }]}>
      {heroUri ? (
        <>
          <Image
            source={{ uri: heroUri }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            blurRadius={40}
            transition={200}
          />
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)' },
            ]}
          />
          <Image
            source={{ uri: heroUri }}
            style={StyleSheet.absoluteFillObject}
            contentFit="contain"
            transition={200}
          />
        </>
      ) : (
        <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
      )}

      {board.name ? (
        <View style={styles.boardPill} pointerEvents="none">
          <Text style={styles.boardPillText} numberOfLines={1}>
            {board.name}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

const styles = StyleSheet.create({
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
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  headerInfo: {
    marginLeft: 8,
    flex: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shaperName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  shaperPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  shaperPillText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#b45309',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 1,
  },
  thumb: {
    aspectRatio: 4 / 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardPill: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    maxWidth: '70%',
  },
  boardPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
});
