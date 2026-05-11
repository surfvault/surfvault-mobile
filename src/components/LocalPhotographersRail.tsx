import { View, Text, Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import GradientRing, { ACTIVE_STOPS, NOTE_STOPS } from './GradientRing';
import UserTypeBadge from './UserTypeBadge';
import { useGetPhotographersAtBreakQuery } from '../store';
import { useTrackedPush } from '../context/NavigationContext';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const isNoteActive = (setAt?: string | null) => {
  if (!setAt) return false;
  return Date.now() - new Date(setAt).getTime() < SEVEN_DAYS_MS;
};

const AVATAR_SIZE = 68;
const RING_WIDTH = 3;
const GAP = 2;
const TOTAL = AVATAR_SIZE + (RING_WIDTH + GAP) * 2;

interface Props {
  breakId?: string | null;
}

export default function LocalPhotographersRail({ breakId }: Props) {
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { data } = useGetPhotographersAtBreakQuery(
    { breakId: breakId ?? '' },
    { skip: !breakId }
  );

  const photographers = data?.results?.photographers ?? [];
  if (photographers.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      style={styles.wrap}
    >
      {photographers.map((p: any) => {
        const noteActive = isNoteActive(p?.status_note_set_at) && !!p?.status_note;
        // Active wins over note. Idle (no active + no note) → no ring at all.
        const stops = p?.active ? ACTIVE_STOPS : noteActive ? NOTE_STOPS : null;

        return (
          <Pressable
            key={p.id}
            onPress={() => trackedPush(`/user/${p.handle}`)}
            style={styles.item}
          >
            <View style={styles.ringWrap}>
              {stops && <GradientRing size={TOTAL} strokeWidth={RING_WIDTH} stops={stops} />}
              <View style={[styles.avatarWrap, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}>
                {p.picture ? (
                  <Image
                    source={p.picture}
                    style={styles.avatar}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Ionicons name="person" size={28} color={isDark ? '#cbd5e1' : '#94a3b8'} />
                )}
              </View>
              {p?.verified && (
                <View
                  pointerEvents="none"
                  style={[styles.badge, { backgroundColor: isDark ? '#000' : '#fff' }]}
                >
                  <UserTypeBadge userType="photographer" isVerified size={24} />
                </View>
              )}
            </View>
            <Text
              numberOfLines={1}
              style={[styles.handle, { color: isDark ? '#e5e7eb' : '#374151' }]}
            >
              {p.handle}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0 },
  scroll: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 8, gap: 4 },
  item: { alignItems: 'center', width: TOTAL + 16 },
  ringWrap: {
    width: TOTAL,
    height: TOTAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  handle: { fontSize: 11, marginTop: 4, maxWidth: TOTAL + 8 },
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 27,
    height: 27,
    borderRadius: 13.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
