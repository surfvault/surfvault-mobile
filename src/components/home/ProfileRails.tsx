import { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGetProfilePreviewQuery, useGetUserQuery } from '../../store';
import UserAvatar from '../UserAvatar';
import { SessionTile, FilmTile, BoardTile, RAIL_TILE_WIDTH } from './FeedTiles';

type Account = {
  id: string;
  handle: string;
  name?: string | null;
  picture?: string | null;
  user_type?: string;
  type?: string;
  verified?: boolean;
};

const TYPE_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  photographer: { label: 'Photographer', bg: '#0ea5e91a', fg: '#0ea5e9' },
  shaper: { label: 'Shaper', bg: '#f59e0b1a', fg: '#f59e0b' },
  surfer: { label: 'Surfer', bg: '#10b9811a', fg: '#10b981' },
  advertiser: { label: 'Brand', bg: '#8b5cf61a', fg: '#8b5cf6' },
};

function railTile(item: any, onNavigate: (p: string) => void) {
  if (item.kind === 'film') return <FilmTile film={item.film} width={RAIL_TILE_WIDTH} onNavigate={onNavigate} />;
  if (item.kind === 'board') return <BoardTile board={item.board} width={RAIL_TILE_WIDTH} onNavigate={onNavigate} />;
  return <SessionTile group={item.group} width={RAIL_TILE_WIDTH} onNavigate={onNavigate} />;
}

function Rail({
  title,
  items,
  onNavigate,
  seeAllTo,
  isDark,
}: {
  title: string;
  items: any[];
  onNavigate: (p: string) => void;
  seeAllTo?: string | null;
  isDark: boolean;
}) {
  if (!items?.length) return null;
  return (
    <View style={styles.rail}>
      <View style={styles.railHead}>
        <Text style={[styles.railTitle, { color: isDark ? '#fff' : '#111827' }]}>{title}</Text>
        {seeAllTo && (
          <Pressable onPress={() => onNavigate(seeAllTo)} hitSlop={6}>
            <Text style={styles.seeAll}>See all →</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(it) => it.key}
        renderItem={({ item }) => <View style={{ marginRight: 10 }}>{railTile(item, onNavigate)}</View>}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14 }}
      />
    </View>
  );
}

/**
 * Focused-profile view (mobile): header (avatar, type pill, stat line, View
 * profile + back) over horizontal rails of everything the account is in.
 * Rails: Recent Sessions / Films / Boards (authored) + Featured in (tagged).
 * See-all deep-links to the matching profile gallery via ?view=. Empty state
 * for new/empty accounts.
 */
export default function ProfileRails({
  user,
  onBack,
  onNavigate,
}: {
  user: Account;
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const { data, isFetching } = useGetProfilePreviewQuery({ userId: user?.id }, { skip: !user?.id });
  const r = data?.results;
  // Authoritative profile for the header (always has type/name/verified),
  // independent of how the account was reached. getUser is always live.
  const { data: userData } = useGetUserQuery({ handle: user?.handle }, { skip: !user?.handle });
  const fetchedUser = (userData as any)?.results?.photographer ?? (userData as any)?.results;
  // Prefer preview.user → getUser → the passed account (fallback while loading).
  const acct: Account = (r?.user as Account) ?? (fetchedUser as Account) ?? user;
  const recentSessions = r?.recentSessions ?? [];
  const recentFilms = r?.recentFilms ?? [];
  const boards = r?.boards ?? [];
  const featuredIn = r?.featuredIn ?? [];
  const hasAny = recentSessions.length || recentFilms.length || boards.length || featuredIn.length;

  const statLine = useMemo(() => {
    const c = r?.counts;
    if (!c) return null;
    const parts: string[] = [];
    if (c.sessions) parts.push(`${c.sessions} ${c.sessions === 1 ? 'session' : 'sessions'}`);
    if (c.films) parts.push(`${c.films} ${c.films === 1 ? 'film' : 'films'}`);
    if (c.boards) parts.push(`${c.boards} ${c.boards === 1 ? 'board' : 'boards'}`);
    if (c.featured) parts.push(`tagged in ${c.featured}`);
    return parts.join(' · ') || null;
  }, [r]);

  const acctType = acct?.user_type ?? acct?.type;
  const pill = acctType ? TYPE_PILL[acctType] : null;
  const profileBase = acct?.handle ? `/user/${acct.handle}` : null;

  return (
    <View style={styles.flex}>
      {/* Header */}
      <View style={[styles.header, { borderColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} hitSlop={8} style={{ paddingRight: 2 }}>
            <Ionicons name="arrow-back" size={22} color={isDark ? '#e5e7eb' : '#374151'} />
          </Pressable>
          <UserAvatar uri={acct?.picture} name={acct?.name ?? acct?.handle} size={48} userType={acctType} verified={!!acct?.verified} />
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={[styles.name, { color: isDark ? '#fff' : '#111827' }]}>
              {acct?.name ?? `@${acct?.handle}`}
            </Text>
            <Text numberOfLines={1} style={styles.sub}>@{acct?.handle}</Text>
          </View>
          <Pressable onPress={() => profileBase && onNavigate(profileBase)} style={styles.viewBtn}>
            <Text style={styles.viewBtnText}>View profile</Text>
          </Pressable>
        </View>
        {/* Type pill + stats on one line so the name above never gets cut off. */}
        {(pill || statLine) && (
          <View style={styles.statRow}>
            {pill && (
              <View style={[styles.pill, { backgroundColor: pill.bg }]}>
                <Text style={[styles.pillText, { color: pill.fg }]}>{pill.label}</Text>
              </View>
            )}
            {!!statLine && (
              <Text numberOfLines={1} style={[styles.statLine, { color: isDark ? '#9ca3af' : '#6b7280' }]}>{statLine}</Text>
            )}
          </View>
        )}
      </View>

      {/* Body */}
      {isFetching && !r ? (
        <View style={styles.centered}><ActivityIndicator color={isDark ? '#9ca3af' : '#6b7280'} /></View>
      ) : !hasAny ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyTitle, { color: isDark ? '#e5e7eb' : '#374151' }]}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>No sessions, films, or tags for this account yet. Open their profile to follow or message them.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12 }}>
          <Rail title="Recent Sessions" items={recentSessions} onNavigate={onNavigate} seeAllTo={profileBase} isDark={isDark} />
          <Rail title="Recent Films" items={recentFilms} onNavigate={onNavigate} seeAllTo={profileBase ? `${profileBase}?view=films` : null} isDark={isDark} />
          <Rail title="Boards" items={boards} onNavigate={onNavigate} seeAllTo={profileBase} isDark={isDark} />
          {/* Mobile profile has no tagged tab → See-all lands on the profile. */}
          <Rail title="Featured in" items={featuredIn} onNavigate={onNavigate} seeAllTo={profileBase} isDark={isDark} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statLine: { flexShrink: 1, fontSize: 12.5 },
  headerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  sub: { marginTop: 2, fontSize: 12, color: '#9ca3af' },
  viewBtn: { backgroundColor: '#0284c7', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  viewBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rail: { marginBottom: 18 },
  railHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, marginBottom: 8 },
  railTitle: { fontSize: 14, fontWeight: '700' },
  seeAll: { fontSize: 12, fontWeight: '700', color: '#0ea5e9' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { marginTop: 6, fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 19 },
});
