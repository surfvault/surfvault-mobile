import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  useColorScheme,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTrackedPush } from '../context/NavigationContext';
import type { FeaturedShaperBoard } from '../store';
import { getBoardPhotoUrl } from '../helpers/mediaUrl';

interface ShaperFeedCardProps {
  board: FeaturedShaperBoard;
}

/**
 * In-feed card for a featured shaper board. Visually mirrors SessionCard /
 * SponsoredCard (40px avatar header, 4:5 portrait hero, board name pill in
 * the bottom-right) but tagged "Shaper" instead of "Sponsored" and routes to
 * the shaper's profile gallery instead of an external website.
 */
export default function ShaperFeedCard({ board }: ShaperFeedCardProps) {
  const isDark = useColorScheme() === 'dark';
  const trackedPush = useTrackedPush();
  const [width, setWidth] = useState(Dimensions.get('window').width);

  const openShaperProfile = useCallback(() => {
    trackedPush(`/user/${board.shaper_handle}` as any);
  }, [trackedPush, board.shaper_handle]);

  const heroUri = getBoardPhotoUrl(board.photos[0]?.s3_key);

  return (
    <View style={styles.card} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Header — partner identity */}
      <View style={styles.header}>
        <Pressable onPress={openShaperProfile} style={styles.headerLeft}>
          <View style={[styles.avatar, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            {board.shaper_picture ? (
              <Image source={{ uri: board.shaper_picture }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <MaterialCommunityIcons
                name="surfing"
                size={18}
                color={isDark ? '#9ca3af' : '#6b7280'}
              />
            )}
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={[styles.shaperName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                {board.shaper_name ?? board.shaper_handle}
              </Text>
              <View style={styles.shaperPill}>
                <Text style={styles.shaperPillText}>Shaper</Text>
              </View>
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {formatDistance(board.distance_km)} away
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Hero — 4:5 portrait card with contained image on a blurred backdrop,
          matching BoardroomFeed's pattern. Whole hero is tappable → shaper
          profile gallery. */}
      <Pressable onPress={openShaperProfile}>
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

          {board.board_name ? (
            <View style={styles.boardPill} pointerEvents="none">
              <Text style={styles.boardPillText} numberOfLines={1}>
                {board.board_name}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
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
    width: '100%',
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
});
