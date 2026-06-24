import { useMemo } from 'react';
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
import { useGetFilmsForUserQuery } from '../store';
import { useTrackedPush } from '../context/NavigationContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_COLS = 3;
const GAP = 3;
const TILE = (SCREEN_WIDTH - GAP * (GRID_COLS + 1)) / GRID_COLS;

/**
 * Surf films a user created, catalogued, or is a confirmed participant in.
 * 3-col grid of 16:9-ish poster tiles; tap opens the film detail page (embed).
 * Mirrors ShaperBoardsGrid's role on shaper profiles.
 */
export default function FilmsGrid({
  handle,
  title,
  hideWhenEmpty = false,
}: {
  handle: string;
  /** Optional heading rendered above the grid when there are films. */
  title?: string;
  /** When true, render nothing instead of an empty state (e.g. appended to a
   * profile footer where most users have no films). */
  hideWhenEmpty?: boolean;
}) {
  const isDark = useColorScheme() === 'dark';
  const trackedPush = useTrackedPush();
  const { data, isLoading, isError } = useGetFilmsForUserQuery({ handle }, { skip: !handle });
  const films = useMemo(() => data?.results?.films ?? [], [data]);

  if (isLoading) {
    return hideWhenEmpty ? null : <View style={styles.centered}><ActivityIndicator /></View>;
  }
  if (isError || films.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <View style={styles.centered}>
        <Ionicons name="film-outline" size={34} color={isDark ? '#374151' : '#cbd5e1'} />
        <Text style={[styles.emptyText, { color: isDark ? '#6b7280' : '#94a3b8' }]}>
          {isError ? "Couldn't load films." : 'No films yet.'}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {title ? <Text style={[styles.gridTitle, { color: isDark ? '#fff' : '#0f172a' }]}>{title}</Text> : null}
      <View style={styles.grid}>
      {films.map((film) => {
        const firstBreak = film.breaks?.[0];
        const firstRegion = film.regions?.[0];
        const subtitle =
          (firstBreak?.name ? firstBreak.name.replace(/_/g, ' ') : null) ||
          firstRegion?.region ||
          firstRegion?.country ||
          null;
        return (
          <Pressable
            key={film.id}
            onPress={() => trackedPush(`/film/${film.id}` as any)}
            style={[styles.tile, { backgroundColor: isDark ? '#0f172a' : '#e5e7eb' }]}
          >
            {film.poster_url ? (
              <Image source={{ uri: film.poster_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : (
              <View style={styles.fallback}>
                <Ionicons name="film-outline" size={24} color="#38bdf8" />
              </View>
            )}
            <View style={styles.playBadge}>
              <Ionicons name="play" size={12} color="#fff" />
            </View>
            <View style={styles.footer}>
              <Text style={styles.title} numberOfLines={1}>{film.title}</Text>
              {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: GAP, gap: GAP },
  tile: { width: TILE, height: Math.round((TILE * 9) / 16), borderRadius: 8, overflow: 'hidden' },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    position: 'absolute', top: '50%', left: '50%', marginLeft: -13, marginTop: -13,
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 5, backgroundColor: 'rgba(0,0,0,0.45)' },
  title: { color: '#fff', fontSize: 11, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 9 },
  centered: { paddingVertical: 50, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13 },
  gridTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 6 },
});
