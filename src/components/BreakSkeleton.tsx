import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, useColorScheme, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Skeleton for the surf break detail feed. The break page floats its
 * back/favorite/share controls over the content, so this stands in for the
 * map hero, then the feed cards below it.
 */
export default function BreakSkeleton() {
  const isDark = useColorScheme() === 'dark';
  const pulse = useRef(new Animated.Value(0.4)).current;
  const screenWidth = Dimensions.get('window').width;
  const insets = useSafeAreaInsets();

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
      {/* Map hero placeholder */}
      <Block style={{ width: '100%', height: insets.top + 285, borderRadius: 0 }} />

      {/* Locals rail */}
      <Block style={{ width: 120, height: 20, borderRadius: 6, marginHorizontal: 16, marginTop: 14, marginBottom: 10 }} />
      <View style={styles.railRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.railItem}>
            <Block style={{ width: 68, height: 68, borderRadius: 34 }} />
            <Block style={{ width: 44, height: 10, borderRadius: 4, marginTop: 8 }} />
          </View>
        ))}
      </View>

      {/* Recent Sessions title */}
      <Block style={{ width: 160, height: 20, borderRadius: 6, marginHorizontal: 16, marginTop: 8, marginBottom: 12 }} />

      {/* Feed cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.cardHeader}>
            <Block style={{ width: 36, height: 36, borderRadius: 18 }} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Block style={{ width: '50%', height: 13, borderRadius: 4, marginBottom: 6 }} />
              <Block style={{ width: '35%', height: 11, borderRadius: 4 }} />
            </View>
          </View>
          <Block style={{ width: '100%', height: screenWidth * 0.7, borderRadius: 0, marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  railRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  railItem: { alignItems: 'center', width: 84 },
  card: { marginBottom: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
});
