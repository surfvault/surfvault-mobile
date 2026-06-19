import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, useColorScheme } from 'react-native';
import { RAIL_TILE_WIDTH } from './FeedTiles';

/**
 * Loading placeholder for a SurfVault home rail — a real section title over a
 * row of pulsing tile/avatar blocks. Matches HomeSkeleton's pulse so a rail
 * that's still fetching reads as "loading" instead of just being absent.
 */
export default function RailSkeleton({
  title,
  subtitle,
  variant = 'tile',
}: {
  // Omit to render a pulsing title block instead of text — used when the rail
  // titles aren't known yet (e.g. Favorites rails loading before break names).
  title?: string;
  subtitle?: string;
  variant?: 'tile' | 'avatar';
}) {
  const isDark = useColorScheme() === 'dark';
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const block = isDark ? '#1f2937' : '#e5e7eb';
  const tileH = Math.round((RAIL_TILE_WIDTH * 5) / 4);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        {title ? (
          <Text style={[styles.title, { color: isDark ? '#fff' : '#111827' }]}>{title}</Text>
        ) : (
          <Animated.View style={{ width: 150, height: 18, borderRadius: 6, backgroundColor: block, opacity: pulse }} />
        )}
        {subtitle ? <Text style={[styles.subtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>{subtitle}</Text> : null}
      </View>
      <View style={styles.row}>
        {Array.from({ length: variant === 'avatar' ? 4 : 3 }).map((_, i) =>
          variant === 'avatar' ? (
            <View key={i} style={{ alignItems: 'center', marginRight: 16, width: 80 }}>
              <Animated.View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: block, opacity: pulse }} />
              <Animated.View style={{ width: 50, height: 10, borderRadius: 4, marginTop: 8, backgroundColor: block, opacity: pulse }} />
            </View>
          ) : (
            <Animated.View
              key={i}
              style={{ width: RAIL_TILE_WIDTH, height: tileH, borderRadius: 16, marginRight: 12, backgroundColor: block, opacity: pulse }}
            />
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  header: { paddingHorizontal: 16, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10 },
});
