import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  useGetUserSessionsQuery,
  useGetLatestSessionsQuery,
  useGetAdsQuery,
} from '../../store';
import { useUser } from '../../context/UserProvider';
import { useTrackedPush } from '../../context/NavigationContext';
import SponsoredCard from '../SponsoredCard';
import BottomRail, { RailHeading } from './BottomRail';

const TILE_W = 124;

const formatSessionDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date(`${String(dateStr).split('T')[0]}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Photographer-rail caption: the break name (the useful distinguisher across a
// multi-break portfolio) when location isn't hidden — else nothing (the date
// still shows as the tile's corner badge). Gating on hide_location keeps a
// hidden spot concealed even on the owner's own view.
const breakSubtitle = (s: any): string | undefined =>
  !s?.hide_location && s?.surf_break_name
    ? String(s.surf_break_name).replaceAll('_', ' ')
    : undefined;

/** Session tile. `subtitle` (under the title) and `dateBadge` (corner overlay
 *  on the thumbnail) are supplied by the parent: the photographer rail shows the
 *  break as subtitle + date badge; the break rail shows @handle. */
function SessionTile({
  session,
  subtitle,
  dateBadge,
  onPress,
}: {
  session: any;
  subtitle?: string;
  dateBadge?: string;
  onPress: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const isVideo = session?.thumbnail_media_type === 'video';
  return (
    <Pressable onPress={onPress} style={{ width: TILE_W }}>
      <View style={[styles.thumb, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
        {session.thumbnail ? (
          <Image source={{ uri: session.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Ionicons name="images-outline" size={26} color={isDark ? '#374151' : '#d1d5db'} />
        )}
        {dateBadge ? (
          <View style={styles.dateBadge} pointerEvents="none">
            <Text style={styles.dateBadgeText}>{dateBadge}</Text>
          </View>
        ) : null}
        {isVideo ? (
          <View style={styles.playBadge} pointerEvents="none">
            <Ionicons name="play" size={12} color="#fff" />
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileTitle, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
        {session.session_name || 'Session'}
      </Text>
      {subtitle ? (
        <Text style={styles.tileSub} numberOfLines={1}>{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Bottom-of-session rails (in order):
 *   1. "Also shot at {break}" — OTHER photographers' sessions at this break on
 *      this session's date. Skipped entirely when the current session is
 *      hidden-location; other photographers' hidden sessions are filtered out.
 *   2. "More from @handle" — this photographer's other sessions (all breaks).
 *   3. "What's going on nearby" — time-bound sponsored happenings near the break.
 *
 * Mount ONLY once the gallery is fully exhausted — the caller owns that gate.
 */
export default function SessionBottomRails({
  session,
  isOwner = false,
  excludeSessionId,
}: {
  session: any;
  isOwner?: boolean;
  excludeSessionId?: string;
}) {
  const isDark = useColorScheme() === 'dark';
  const { user } = useUser();
  const trackedPush = useTrackedPush();
  const handle: string = session?.handle || session?.user_handle || '';
  const surfBreakId: string = session?.surf_break_id || '';
  const breakName: string = session?.surf_break_name || '';
  const sessionDate: string = session?.session_date || '';
  const currentHidden = session?.hide_location === true;

  // ---- Rail 1: other sessions at this break, this date (cross-photographer) ----
  const country: string = session?.country_code || session?.surf_break_country || '';
  const region: string = session?.region || session?.surf_break_region || '';
  const identifier: string = session?.surf_break_identifier || '';
  const railOneEnabled = !currentHidden && !!country && !!identifier && !!sessionDate;
  const { data: breakDayData } = useGetLatestSessionsQuery(
    { userId: user?.id, country, region, surfBreak: identifier, date: sessionDate, limit: 12 },
    { skip: !railOneEnabled }
  );
  const breakDaySessions: any[] = ((breakDayData as any)?.results?.sessions || []).filter((s: any) => {
    if (s?.hide_location === true) return false; // never leak hidden sessions
    const sid = s?.id ?? s?.session_id;
    if (sid === excludeSessionId) return false;
    const sHandle = s?.user_handle || s?.handle;
    if (sHandle && handle && sHandle === handle) return false; // dedupe vs photographer rail
    return true;
  });

  // ---- Rail 2: more from this photographer (all breaks) ----
  const { data: sessionsData } = useGetUserSessionsQuery(
    { handle, selfFlag: isOwner, limit: 12 },
    { skip: !handle }
  );
  const otherSessions: any[] = ((sessionsData as any)?.results?.sessions || []).filter(
    (s: any) => (s?.id ?? s?.session_id) !== excludeSessionId
  );

  // ---- Rail 3: time-bound sponsored happenings near this break ----
  const { data: adsData } = useGetAdsQuery(
    { surfBreakId, placement: 'content', feed: true, limit: 8 },
    { skip: !surfBreakId }
  );
  const happenings: any[] = ((adsData as any)?.results?.ads || [])
    .filter((a: any) => a?.ends_at)
    .slice(0, 2);

  return (
    <View style={{ paddingBottom: 28 }}>
      {railOneEnabled ? (
        <BottomRail
          title={breakName ? `Also shot at ${breakName}` : 'Also shot here'}
          subtitle={formatSessionDate(sessionDate)}
          itemCount={breakDaySessions.length}
          onSeeAll={
            country && identifier
              ? () => trackedPush(`/break/${country}/${region || '0'}/${identifier}` as any)
              : undefined
          }
        >
          {breakDaySessions.map((s) => (
            <SessionTile
              key={s.id ?? s.session_id}
              session={s}
              subtitle={`@${s.user_handle || s.handle}`}
              onPress={() => trackedPush(`/session/${s.id ?? s.session_id}` as any)}
            />
          ))}
        </BottomRail>
      ) : null}

      <BottomRail
        title={handle ? `More from @${handle}` : 'More sessions'}
        itemCount={otherSessions.length}
        onSeeAll={handle ? () => trackedPush(`/user/${handle}` as any) : undefined}
      >
        {otherSessions.map((s) => (
          <SessionTile
            key={s.id ?? s.session_id}
            session={s}
            subtitle={breakSubtitle(s)}
            dateBadge={formatSessionDate(s.session_date)}
            onPress={() => trackedPush(`/session/${s.id ?? s.session_id}` as any)}
          />
        ))}
      </BottomRail>

      {happenings.length > 0 ? (
        <View style={styles.nearbyWrap}>
          <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]} />
          <RailHeading title="What's going on nearby" subtitle="Sponsored" />
          {happenings.map((ad) => (
            <SponsoredCard key={ad.id} ad={ad} placement="content" surfBreakId={surfBreakId} isViewable />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: TILE_W,
    height: TILE_W * 1.25,
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
  dateBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dateBadgeText: { color: '#fff', fontSize: 9.5, fontWeight: '600' },
  tileTitle: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  tileSub: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  nearbyWrap: { paddingTop: 22 },
  divider: { height: 1, marginHorizontal: 16, marginBottom: 16 },
});
