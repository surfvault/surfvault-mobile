// Favorites home tab, rendered as RAILS instead of a chronological feed.
//
// Rationale: Discover/Following already own the "what's new" feed. Favorites is
// a dashboard of *your places* — so each favorited break is its own horizontal
// rail of recent sessions, and the rails are ordered by the user's custom
// favorites order (the drag-to-reorder finally means something here). Breaks you
// favorited that have no sessions yet collapse into a compact "Your spots"
// section at the bottom so they stay visible without bloating the page. A green
// dot on a rail header means a photographer is active at that break right now.
//
// Tiles reuse the SAME `SessionTile` as the SurfVault "Nearby Sessions" rail
// (date top-left, media/session count top-right, photographer avatar + @handle
// on the bottom scrim) — just with the break name suppressed (`hideBreakName`),
// since the break name is now the rail title.
//
// Data: getUserFavorites gives the ordered breaks + has_active_photographer;
// getLatestSessions(feed='favorites', grouped) gives recent break+date groups,
// which we bucket by surf_break_id. Everything is server-scoped to the viewer's
// favorites + privacy/hidden rules already, so this component is pure rendering.
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  RefreshControl,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserProvider';
import { useTrackedPush } from '../context/NavigationContext';
import { useGetUserFavoritesQuery, useGetLatestSessionsQuery } from '../store';
import type { BreakDateGroup } from './BreakDateCard';
import { SessionTile } from './home/FeedTiles';
import RailSkeleton from './home/RailSkeleton';

// region · country, underscores → spaces, dropping blanks / "0" sentinels.
const locationSubtitle = (fav: any): string =>
  [fav.region, fav.country_code]
    .filter((p: any) => p && p !== '0')
    .map((p: any) => String(p).replaceAll('_', ' '))
    .join(' · ');

interface Favorite {
  surf_break_id: string;
  name?: string;
  region?: string | null;
  country_code?: string | null;
  surf_break_identifier?: string | null;
  has_active_photographer?: boolean;
}

export default function FavoritesRails({ isDark: isDarkProp }: { isDark?: boolean }) {
  const scheme = useColorScheme();
  const isDark = isDarkProp ?? scheme === 'dark';
  const { user } = useUser();
  const trackedPush = useTrackedPush();

  const {
    data: favData,
    isLoading: favLoading,
    isFetching: favFetching,
    refetch: refetchFavorites,
  } = useGetUserFavoritesQuery({} as any, { skip: !user?.id });
  const favorites: Favorite[] = favData?.results?.favorites ?? [];

  const {
    data: sessData,
    isLoading: sessLoading,
    isFetching: sessFetching,
    refetch: refetchSessions,
  } = useGetLatestSessionsQuery(
    // `sort: 'recent'` makes the backend page by SESSION DATE (when the surf
    // happened), not upload time — so the loaded cards are each favorite's most
    // recent *surf* sessions, not the most recently uploaded. limit 100 (up from
    // 60) so a busy break can't crowd a quieter favorite out of the window.
    { userId: user?.id, limit: 100, continuationToken: '', feed: 'favorites', groupByBreakDate: true, sort: 'recent' },
    { skip: !user?.id },
  );
  // Grouped feeds return `groups` (fallback `sessions`) — see home index.tsx.
  const groups: BreakDateGroup[] = useMemo(
    () => sessData?.results?.groups ?? sessData?.results?.sessions ?? [],
    [sessData],
  );

  const groupsByBreak = useMemo(() => {
    const m = new Map<string, BreakDateGroup[]>();
    for (const g of groups) {
      if (!g.surf_break_id) continue; // hidden-location groups have no break id
      const arr = m.get(g.surf_break_id);
      if (arr) arr.push(g);
      else m.set(g.surf_break_id, [g]);
    }
    return m;
  }, [groups]);

  // Split favorites (already in custom order) into rails (have sessions) and
  // empties (no sessions yet → compact bottom section). Within a rail, sort the
  // day-cards by SESSION DATE (when the surf happened), newest first — NOT the
  // feed's upload/created-at recency order. `session_date` is ISO/`YYYY-MM-DD`,
  // so a string compare sorts chronologically.
  const { rails, empties } = useMemo(() => {
    const railsOut: { fav: Favorite; groups: BreakDateGroup[] }[] = [];
    const emptiesOut: Favorite[] = [];
    for (const fav of favorites) {
      const gs = groupsByBreak.get(fav.surf_break_id);
      if (gs && gs.length) {
        const sorted = [...gs].sort((a, b) =>
          String(b.session_date ?? '').localeCompare(String(a.session_date ?? '')),
        );
        railsOut.push({ fav, groups: sorted });
      } else emptiesOut.push(fav);
    }
    return { rails: railsOut, empties: emptiesOut };
  }, [favorites, groupsByBreak]);

  const openBreak = useCallback(
    (fav: Favorite) => {
      if (!fav.country_code || !fav.surf_break_identifier) return;
      const region = fav.region && fav.region !== '0' ? fav.region : '0';
      trackedPush(`/break/${fav.country_code}/${region}/${fav.surf_break_identifier}` as any);
    },
    [trackedPush],
  );

  const onRefresh = useCallback(() => {
    refetchFavorites();
    refetchSessions();
  }, [refetchFavorites, refetchSessions]);

  // ---- States ----
  if (!user?.id) {
    return (
      <View style={styles.centered}>
        <Ionicons name="heart-outline" size={36} color={isDark ? '#9ca3af' : '#6b7280'} />
        <Text style={[styles.stateTitle, { color: isDark ? '#fff' : '#111827' }]}>Sign in to see favorites</Text>
      </View>
    );
  }

  // Preview skeleton — a few placeholder rails (pulsing title + tile blocks)
  // instead of a bare spinner, so it reads as "rails loading".
  if ((favLoading || sessLoading) && favorites.length === 0) {
    return (
      <View style={styles.skeletonWrap}>
        {[0, 1, 2].map((i) => (
          <RailSkeleton key={i} variant="tile" />
        ))}
      </View>
    );
  }

  if (favorites.length === 0) {
    return (
      <View style={styles.centered}>
        <View style={[styles.stateIcon, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <Ionicons name="heart-outline" size={34} color={isDark ? '#9ca3af' : '#6b7280'} />
        </View>
        <Text style={[styles.stateTitle, { color: isDark ? '#fff' : '#111827' }]}>No favorites yet</Text>
        <Text style={[styles.stateBody, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
          Favorite the breaks you surf to keep tabs on them here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={(favFetching || sessFetching) && favorites.length > 0}
          onRefresh={onRefresh}
          tintColor={isDark ? '#9ca3af' : '#6b7280'}
        />
      }
    >
      {rails.map(({ fav, groups: railGroups }) => {
        const subtitle = locationSubtitle(fav);
        return (
          <View key={fav.surf_break_id} style={styles.rail}>
            <Pressable onPress={() => openBreak(fav)} style={styles.railHeader} hitSlop={6}>
              {fav.has_active_photographer && <View style={styles.activeDot} />}
              <View style={styles.railHeaderText}>
                <Text style={[styles.railTitle, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                  {fav.name}
                </Text>
                {!!subtitle && (
                  <Text style={[styles.railSub, { color: isDark ? '#9ca3af' : '#6b7280' }]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
            </Pressable>
            <FlatList
              data={railGroups}
              horizontal
              // `group_key` alone isn't unique across dates at the same break —
              // combine with session_date (same as the home/Nearby rails) so a
              // break with sessions on multiple days doesn't collide keys.
              keyExtractor={(g) => `${g.session_date}|${g.group_key}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railRow}
              // No ItemSeparatorComponent — SessionTile/RailTile carries its own
              // `marginRight: 12`, so the spacing matches the Nearby Sessions
              // rail exactly. Adding a separator here double-gapped the tiles.
              renderItem={({ item }) => <SessionTile group={item} hideBreakName isViewable={false} />}
            />
          </View>
        );
      })}

      {empties.length > 0 && (
        <View style={styles.emptiesSection}>
          <Text style={[styles.emptiesTitle, { color: isDark ? '#fff' : '#111827' }]}>Your spots</Text>
          <Text style={[styles.emptiesSub, { color: isDark ? '#6b7280' : '#9ca3af' }]}>No sessions yet</Text>
          <View style={styles.chipsWrap}>
            {empties.map((fav) => (
              <Pressable
                key={fav.surf_break_id}
                onPress={() => openBreak(fav)}
                style={[styles.chip, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}
              >
                {fav.has_active_photographer && <View style={styles.activeDotSm} />}
                <Text style={[styles.chipText, { color: isDark ? '#e5e7eb' : '#374151' }]} numberOfLines={1}>
                  {fav.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 6, paddingBottom: 140 },
  skeletonWrap: { paddingTop: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  stateTitle: { fontSize: 17, fontWeight: '700' },
  stateBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  rail: { marginBottom: 22 },
  railHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 10, gap: 8,
  },
  activeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#10b981' },
  railHeaderText: { flex: 1, minWidth: 0 },
  railTitle: { fontSize: 17, fontWeight: '800' },
  railSub: { fontSize: 12, marginTop: 1 },
  railRow: { paddingHorizontal: 16 },

  emptiesSection: { paddingHorizontal: 16, marginTop: 4 },
  emptiesTitle: { fontSize: 17, fontWeight: '800' },
  emptiesSub: { fontSize: 12, marginTop: 1, marginBottom: 12 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
    maxWidth: '100%',
  },
  activeDotSm: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10b981' },
  chipText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
