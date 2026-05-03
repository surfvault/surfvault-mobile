import { View, Text, Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { useGetPhotographersAtBreakQuery } from '../store';
import { useTrackedPush } from '../context/NavigationContext';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const isNoteActive = (setAt?: string | null) => {
  if (!setAt) return false;
  return Date.now() - new Date(setAt).getTime() < SEVEN_DAYS_MS;
};

const STORY_STOPS = [
  { offset: '0%', color: '#22d3ee' },
  { offset: '50%', color: '#0ea5e9' },
  { offset: '100%', color: '#6366f1' },
];
const ACTIVE_STOPS = [
  { offset: '0%', color: '#22c55e' },
  { offset: '100%', color: '#16a34a' },
];
const NOTE_STOPS = [
  { offset: '0%', color: '#38bdf8' },
  { offset: '100%', color: '#0ea5e9' },
];

const AVATAR_SIZE = 68;
const RING_WIDTH = 3;
const GAP = 2;
const TOTAL = AVATAR_SIZE + (RING_WIDTH + GAP) * 2;

interface Props {
  breakId?: string | null;
}

function GradientRing({ id, stops }: { id: string; stops: typeof STORY_STOPS }) {
  return (
    <Svg width={TOTAL} height={TOTAL} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {stops.map((s, i) => (
            <Stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </LinearGradient>
      </Defs>
      <Circle
        cx={TOTAL / 2}
        cy={TOTAL / 2}
        r={(TOTAL - RING_WIDTH) / 2}
        stroke={`url(#${id})`}
        strokeWidth={RING_WIDTH}
        fill="none"
      />
    </Svg>
  );
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
        const stops = p?.active ? ACTIVE_STOPS : noteActive ? NOTE_STOPS : STORY_STOPS;
        const gradId = `g-${p.id}`;

        return (
          <Pressable
            key={p.id}
            onPress={() => trackedPush(`/user/${p.handle}`)}
            style={styles.item}
          >
            <View style={styles.ringWrap}>
              <GradientRing id={gradId} stops={stops} />
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
              {p?.active && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.activePill,
                    { borderColor: isDark ? '#000' : '#fff' },
                  ]}
                >
                  <Text style={styles.activePillText}>ACTIVE</Text>
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
  activePill: {
    position: 'absolute',
    bottom: -2,
    alignSelf: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
  },
  activePillText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.4,
  },
});
