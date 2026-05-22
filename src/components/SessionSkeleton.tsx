import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, useColorScheme, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const GAP = 4;
const PHOTO_WIDTH = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

/**
 * Skeleton for the session gallery page — mirrors the new layout: full-bleed
 * image hero, a row of group-filter chips, then the 2-column photo grid.
 */
export default function SessionSkeleton() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
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

  const blockColor = isDark ? '#1f2937' : '#e5e7eb';

  const Block = ({ style }: { style?: any }) => (
    <Animated.View style={[{ backgroundColor: blockColor, borderRadius: 8, opacity: pulse }, style]} />
  );

  return (
    <View style={styles.wrap}>
      {/* Image hero placeholder */}
      <Block style={{ width: '100%', height: insets.top + 300, borderRadius: 0 }} />

      {/* Group filter chips */}
      <View style={styles.chipRow}>
        {[58, 92, 64, 78].map((w, i) => (
          <Block key={i} style={{ width: w, height: 30, borderRadius: 999 }} />
        ))}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Block
            key={i}
            style={{
              width: PHOTO_WIDTH,
              height: PHOTO_WIDTH * 1.3,
              borderRadius: 4,
              margin: GAP / 2,
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GAP / 2 },
});
