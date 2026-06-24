import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTrackedPush } from '../context/NavigationContext';
import { useUser } from '../context/UserProvider';
import { useGetFilmsForUserQuery } from '../store';
import type { Film } from '../store/apis/endpoints/films';
import { ytThumb, ytThumbFallback } from '../helpers/youtubeThumb';
import { formatSessionDate } from '../helpers/dateTime';

/**
 * Profile "Films" grid — mobile port of web FilmsGallery. A 3-column square
 * grid of the user's films (scope='mine' for self → incl. unverified; 'tagged'
 * for confirmed participations; undefined → earned attribution on others).
 * Title banner on top, centered red play, bottom-left verification pill + date.
 * Renders inside the profile ScrollView (plain wrapping View, not a FlatList).
 */

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLS = 3;
const GRID_GAP = 2;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

function FilmGridTile({ film, onPress, showViews }: { film: Film; onPress: () => void; showViews?: boolean }) {
  const [errored, setErrored] = useState(false);
  const primary = ytThumb(film.youtube_video_id, film.poster_url);
  const fallback = ytThumbFallback(film.youtube_video_id, film.poster_url);
  const uri = errored && fallback ? fallback : primary;

  return (
    <Pressable onPress={onPress} style={styles.tile}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          onError={() => setErrored(true)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tileFallback]}>
          <Ionicons name="film-outline" size={26} color="#64748b" />
        </View>
      )}

      {/* Top-left chip — title + date, mirrors the session grid tile chrome. */}
      <View style={styles.gridChip} pointerEvents="none">
        <Text style={styles.gridChipTitle} numberOfLines={2}>
          {film.title || 'Surf film'}
        </Text>
        {film.film_date ? (
          <Text style={[styles.gridChipText, { opacity: 0.8 }]}>{formatSessionDate(film.film_date)}</Text>
        ) : null}
      </View>

      {/* Centered red play badge. */}
      <View style={styles.playCenter} pointerEvents="none">
        <View style={styles.playBadge}>
          <Ionicons name="play" size={10} color="#fff" style={{ marginLeft: 1 }} />
        </View>
      </View>

      {/* Private view count — only the verified creator/owner (bottom-left,
          mirrors the session grid tile's view badge). */}
      {showViews && film.views != null ? (
        <View style={styles.viewsBadge} pointerEvents="none">
          <Ionicons name="eye-outline" size={11} color="#fff" />
          <Text style={styles.viewsBadgeText}>{film.views.toLocaleString()}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ProfileFilmsGrid({
  handle,
  scope,
  verifiedOnly = false,
  emptyText = 'No films yet.',
}: {
  handle: string;
  scope?: 'mine' | 'tagged';
  // When another user views this profile, show only verified films.
  verifiedOnly?: boolean;
  emptyText?: string;
}) {
  const isDark = useColorScheme() === 'dark';
  const trackedPush = useTrackedPush();
  const { user } = useUser();
  const { data, isFetching } = useGetFilmsForUserQuery(
    { handle, scope },
    { skip: !handle }
  );
  const films = useMemo<Film[]>(() => {
    const all = data?.results?.films ?? [];
    return verifiedOnly ? all.filter((f) => f.creator_verified) : all;
  }, [data, verifiedOnly]);

  if (isFetching && films.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (films.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="film-outline" size={34} color={isDark ? '#374151' : '#cbd5e1'} />
        <Text style={[styles.emptyText, { color: isDark ? '#6b7280' : '#9ca3af' }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.gridWrap}>
      {films.map((film, idx) => (
        <View
          key={film.id}
          style={{ marginRight: (idx + 1) % GRID_COLS === 0 ? 0 : GRID_GAP, marginBottom: GRID_GAP }}
        >
          <FilmGridTile
            film={film}
            onPress={() => trackedPush(`/film/${film.id}` as any)}
            showViews={!!user?.id && film.creator_user_id === user.id}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: TILE_SIZE, height: TILE_SIZE, backgroundColor: '#0b1220', overflow: 'hidden', position: 'relative' },
  tileFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  viewsBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  viewsBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  // Top-left chip — matches the session grid tile's gridDate chrome.
  gridChip: {
    position: 'absolute',
    top: 4,
    left: 4,
    maxWidth: '90%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  gridChipTitle: { fontSize: 9, fontWeight: '700', color: '#fff' },
  gridChipText: { fontSize: 9, fontWeight: '600', color: '#fff' },
  playCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    width: 30,
    height: 21,
    borderRadius: 6,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { paddingVertical: 60, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14 },
});
