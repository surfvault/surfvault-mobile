import { View, Text, FlatList, StyleSheet, useColorScheme } from 'react-native';
import { useGetRelatedFilmsQuery } from '../store';
import type { Film } from '../store/apis/endpoints/films';
import { FilmTile } from './home/FeedTiles';

/**
 * "Keep watching" rails at the bottom of a film detail screen. One round trip to
 * /films/{id}/related returns two ready-to-render buckets:
 *   - fromCreator — other films by the same filmer
 *   - nearby      — films near this film's breaks (server-side proximity, no
 *                   coords leaked). `nearbyScope` ('local' | 'latest') picks the
 *                   title between the genuinely-local list and the global-latest
 *                   fallback.
 * Public — shown to everyone. Each rail hides when its bucket is empty; the whole
 * block disappears when both are empty. Renders OUTSIDE the body Pressable so the
 * horizontal FlatLists own their pan gestures.
 */
function Rail({
  title,
  subtitle,
  films,
  isDark,
}: {
  title: string;
  subtitle?: string;
  films: Film[];
  isDark: boolean;
}) {
  if (!films.length) return null;
  return (
    <View style={styles.rail}>
      <View style={styles.railHeader}>
        <Text style={[styles.railTitle, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={[styles.railSub, { color: isDark ? '#9ca3af' : '#6b7280' }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <FlatList
        data={films}
        horizontal
        keyExtractor={(f) => f.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railRow}
        renderItem={({ item }) => <FilmTile film={item} showDate />}
      />
    </View>
  );
}

export default function FilmRelatedRails({
  filmId,
  creatorName,
}: {
  filmId: string;
  creatorName?: string | null;
}) {
  const isDark = useColorScheme() === 'dark';
  const { data } = useGetRelatedFilmsQuery({ filmId }, { skip: !filmId });
  const fromCreator = data?.results?.fromCreator ?? [];
  const nearby = data?.results?.nearby ?? [];
  const nearbyScope = data?.results?.nearbyScope;

  if (!fromCreator.length && !nearby.length) return null;

  const creatorTitle = creatorName ? `More from ${creatorName}` : 'More from this filmer';
  const isLocal = nearbyScope === 'local';
  const nearbyTitle = isLocal ? 'Filmed nearby' : 'More surf films';
  const nearbySub = isLocal ? 'Surf films from around this spot' : 'Fresh from the lineup';

  return (
    <View style={[styles.wrap, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }]}>
      <Rail title={creatorTitle} films={fromCreator} isDark={isDark} />
      <Rail title={nearbyTitle} subtitle={nearbySub} films={nearby} isDark={isDark} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth },
  rail: { marginBottom: 22 },
  railHeader: { paddingHorizontal: 16, marginBottom: 10 },
  railTitle: { fontSize: 17, fontWeight: '800' },
  railSub: { fontSize: 12, marginTop: 1 },
  railRow: { paddingHorizontal: 16 },
});
