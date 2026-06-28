import { ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Section heading shared by every bottom rail (and the stacked "nearby"
 * section) so the typographic rhythm matches across them.
 */
export function RailHeading({
  title,
  subtitle,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  return (
    <View style={styles.headerRow}>
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#0f172a' }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAllBtn}>
          <Text style={styles.seeAll}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color="#0ea5e9" />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Shared shell for the "more content" rails at the BOTTOM of the session and
 * board detail screens. A titled, horizontally-scrollable shelf.
 *
 * Renders nothing when it has no items — callers gate visibility purely on
 * data so an empty rail never leaves a titled blank strip on the screen.
 */
export default function BottomRail({
  title,
  subtitle,
  onSeeAll,
  children,
  itemCount,
}: {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
  children: ReactNode;
  /** Number of tiles rendered — when 0 the rail renders nothing. */
  itemCount: number;
}) {
  const isDark = useColorScheme() === 'dark';
  if (itemCount <= 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]} />
      <RailHeading title={title} subtitle={subtitle} onSeeAll={onSeeAll} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 22 },
  divider: { height: 1, marginHorizontal: 16, marginBottom: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  subtitle: { fontSize: 11.5, fontWeight: '500', color: '#6b7280', marginTop: 2 },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  seeAll: { fontSize: 13, fontWeight: '600', color: '#0ea5e9' },
  scroll: { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },
});
