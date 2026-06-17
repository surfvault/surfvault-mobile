import { View, Text, Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import UserAvatar from './UserAvatar';
import { useGetLocalsAtBreakQuery } from '../store';
import { useTrackedPush } from '../context/NavigationContext';
import { useUser } from '../context/UserProvider';
import { useAuth } from '../context/AuthProvider';
import { useUserPreferences, formatDistance } from '../helpers/preferences';

// Break-anchored radius (distance from THIS break to each local's home break).
// Deliberately NOT the user's "nearby photographers" preference — that's
// measured from the user, which is the wrong frame for "who's local to a
// break." 161 km ≈ 100 mi, so the subtitle reads cleanly in the default unit.
const LOCALS_RADIUS_KM = 161;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const isNoteActive = (setAt?: string | null) => {
  if (!setAt) return false;
  return Date.now() - new Date(setAt).getTime() < SEVEN_DAYS_MS;
};

const AVATAR_SIZE = 68;
const ITEM_WIDTH = AVATAR_SIZE + 24;

interface Props {
  breakId?: string | null;
}

// Photographers near this break. The break page now has a dedicated Shapers
// rail, so shapers are filtered out here to avoid showing them twice — this
// rail is photographers-only. (The server endpoint still returns both types;
// the filter is client-side.)
export default function LocalsRail({ breakId }: Props) {
  const trackedPush = useTrackedPush();
  const isDark = useColorScheme() === 'dark';
  const { user } = useUser();
  const { isAuthenticated } = useAuth();
  const { units } = useUserPreferences();

  const { data } = useGetLocalsAtBreakQuery(
    { breakId: breakId ?? '', viewerId: user?.id, radiusKm: LOCALS_RADIUS_KM },
    { skip: !breakId || (isAuthenticated && !user?.id) }
  );

  const locals = (data?.results?.locals ?? []).filter((p: any) => p.user_type !== 'shaper');
  if (locals.length === 0) return null;

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>Local Photographers</Text>
      <Text style={[styles.subtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
        within {formatDistance(LOCALS_RADIUS_KM, units)} of this break
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        style={styles.wrap}
      >
        {locals.map((p: any) => (
          <Pressable key={p.id} onPress={() => trackedPush(`/user/${p.handle}`)} style={styles.item}>
            <UserAvatar
              uri={p.picture}
              name={p.name ?? p.handle}
              size={AVATAR_SIZE}
              // Only badge verified photographers — the rail is photographers-
              // only now, so the camera badge is just verified-status signal
              // (mirrors the Nearby Photographers rail's gating).
              userType={p.verified ? p.user_type : undefined}
              verified={!!p.verified}
              active={!!p.active}
              hasStatusNote={isNoteActive(p.status_note_set_at) && !!p.status_note}
            />
            <Text numberOfLines={1} style={[styles.handle, { color: isDark ? '#e5e7eb' : '#374151' }]}>
              {p.handle}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 },
  subtitle: { fontSize: 13, paddingHorizontal: 16, paddingBottom: 2 },
  wrap: { flexGrow: 0 },
  scroll: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, gap: 8 },
  item: { alignItems: 'center', width: ITEM_WIDTH },
  handle: { fontSize: 11, marginTop: 6, maxWidth: ITEM_WIDTH },
});
