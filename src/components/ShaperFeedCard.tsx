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
import { pickThumbnailPhoto } from './ShaperBoardsGrid';

interface ShaperFeedCardProps {
  shaper: BoardroomShaper;
}

// Cap mirrors backend `MAX_FEATURED_BOARDS_PER_SHAPER` (9). A trailing
// "Shaper Bay" CTA always closes the carousel so users can always jump to
// the full profile from the last slide.
const MAX_INLINE_SLIDES = 9;

type Slide = { kind: 'board'; board: Board } | { kind: 'cta' };

/**
 * In-feed card for a nearby shaper. ONE card per shaper — their featured
 * boards (capped at 9 by app convention) render as a swipeable carousel,
 * with a trailing "Shaper Bay" CTA slide that routes to the shaper's
 * profile. Visually mirrors SponsoredCard / SessionCard (40px avatar header,
 * 4:5 portrait hero) but tagged "Shaper" instead of "Sponsored".
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

  const openShaperProfile = useCallback(() => {
    trackedPush(`/user/${shaper.handle}` as any);
  }, [trackedPush, shaper.handle]);

  // Slides — N board slides (capped at 9) + a trailing CTA. The CTA is a
  // first-class slide, not an overflow indicator, so the path to the shaper
  // bay is always one swipe away from the last board.
  const slides: Slide[] = useMemo(() => {
    const visible = boards.slice(0, MAX_INLINE_SLIDES);
    const items: Slide[] = visible.map((b) => ({ kind: 'board' as const, board: b }));
    if (visible.length > 0) items.push({ kind: 'cta' });
    return items;
  }, [boards]);

  const isCarousel = slides.length > 1;

  // Track which slide is centered. 60% threshold matches SponsoredCard so the
  // pager dots and (future) per-slide impression tracking stay in sync.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!viewableItems.length) return;
    const first = viewableItems[0];
    if (typeof first.index === 'number') setActiveIdx(first.index);
  }).current;

  if (!slides.length) return null;

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
            {/* Subtitle priority:
             *   1. Distance — Boardroom only (when viewer + shaper both have a break)
             *   2. Shaper's surf break name — everywhere else when set
             *   3. Hidden — when neither location is known (board count was
             *      here previously; now lives in the carousel itself).
             */}
            {shaper.distance_km != null ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {formatDistance(shaper.distance_km)} away
              </Text>
            ) : shaper.surf_break_name ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {shaper.surf_break_name}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </View>

      {/* Hero — slides include boards + trailing CTA. Slide Pressables go
          INSIDE renderItem so horizontal swipes don't fight tap recognition
          (same pattern as SessionCard). */}
      {isCarousel ? (
        <FlatList
          data={slides}
          keyExtractor={(s, i) => (s.kind === 'board' ? s.board.id : `cta-${i}`)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          renderItem={({ item }) => (
            <Pressable onPress={openShaperProfile}>
              {item.kind === 'cta' ? (
                <CtaSlide width={width} isDark={isDark} />
              ) : (
                <BoardSlide board={item.board} width={width} isDark={isDark} />
              )}
            </Pressable>
          )}
        />
      ) : (
        // Single slide — only happens when there are 0 boards (early-return
        // guarded above). Render the CTA directly.
        <Pressable onPress={openShaperProfile}>
          <CtaSlide width={width} isDark={isDark} />
        </Pressable>
      )}

      {/* Tapered dot pager — same shape as SponsoredCard / SessionCard. */}
      {isCarousel && (
        <View style={styles.dotsRow}>
          {slides.map((s, i) => {
            const dist = Math.abs(i - activeIdx);
            const size = 8 - dist;
            if (size < 1) return null;
            const isActive = i === activeIdx;
            return (
              <View
                key={s.kind === 'board' ? s.board.id : `cta-${i}`}
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

// Trailing CTA slide. Same 4:5 aspect as BoardSlide (so swipe momentum reads
// identically). Title is the generic "Shaper Bay" — using the shaper's name
// produces awkward grammar when the brand already ends in "s" (e.g.
// "Surfboards's Bay") and adds nothing the card header doesn't already say.
function CtaSlide({ width, isDark }: { width: number; isDark: boolean }) {
  return (
    <View
      style={[
        styles.thumb,
        {
          width,
          backgroundColor: isDark ? '#0b0b0b' : '#f8fafc',
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: 'rgba(245, 158, 11, 0.18)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name="hammer-wrench" size={24} color="#b45309" />
      </View>
      <Text
        style={{
          marginTop: 14,
          fontSize: 15,
          fontWeight: '700',
          color: isDark ? '#fff' : '#111827',
        }}
      >
        Shaper Bay
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 12,
          color: isDark ? '#9ca3af' : '#6b7280',
          textAlign: 'center',
          paddingHorizontal: 32,
        }}
        numberOfLines={2}
      >
        See the full board lineup, dimensions, and contact info.
      </Text>
      <View
        style={{
          marginTop: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: '#d97706',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Open profile</Text>
        <Ionicons name="chevron-forward" size={14} color="#fff" />
      </View>
    </View>
  );
}

function BoardSlide({ board, width, isDark }: { board: Board; width: number; isDark: boolean }) {
  const heroUri = getBoardPhotoUrl(pickThumbnailPhoto(board)?.s3_key);
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
    marginBottom: 32,
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 16,
    fontWeight: '700',
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
