import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, useColorScheme, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const GAP = 4;
const PHOTO_WIDTH = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

/**
 * Skeleton for the session gallery page. Rendered BELOW the existing
 * ScreenHeader, so this covers only the photographer row and the
 * 2-column photo grid placeholders.
 */
export default function SessionSkeleton() {
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

  const blockColor = isDark ? '#1f2937' : '#e5e7eb';

  const Block = ({ style }: { style?: any }) => (
    <Animated.View style={[{ backgroundColor: blockColor, borderRadius: 8, opacity: pulse }, style]} />
  );

  return (
    <View style={styles.wrap}>
      {/* Photographer row */}
      <View style={styles.photographerRow}>
        <Block style={{ width: 36, height: 36, borderRadius: 18 }} />
        <View style={{ marginLeft: 8, flex: 1 }}>
          <Block style={{ width: '50%', height: 14, borderRadius: 4, marginBottom: 6 }} />
          <Block style={{ width: '35%', height: 12, borderRadius: 4 }} />
        </View>
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
  photographerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GAP / 2 },
});
