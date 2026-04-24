import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, useColorScheme, Dimensions } from 'react-native';

/**
 * Skeleton body for the home/discover tab. Rendered BELOW the real
 * header so the header stays stable while data loads (prevents safe-area
 * inset recomputation when swapping mounts during back-navigation).
 */
export default function HomeSkeleton() {
  const isDark = useColorScheme() === 'dark';
  const pulse = useRef(new Animated.Value(0.4)).current;
  const screenWidth = Dimensions.get('window').width;

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
      {/* Nearby Breaks */}
      <View style={styles.sectionWrap}>
        <Block style={{ width: 180, height: 18, borderRadius: 6, marginBottom: 6 }} />
        <Block style={{ width: 220, height: 12, borderRadius: 4, marginBottom: 12 }} />
        <View style={styles.horizontalRow}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Block key={i} style={{ width: 160, height: 110, borderRadius: 12, marginRight: 12 }} />
          ))}
        </View>
      </View>

      {/* Nearby Photographers */}
      <View style={styles.sectionWrap}>
        <Block style={{ width: 200, height: 18, borderRadius: 6, marginBottom: 6 }} />
        <Block style={{ width: 220, height: 12, borderRadius: 4, marginBottom: 12 }} />
        <View style={styles.horizontalRow}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={{ alignItems: 'center', marginRight: 16, width: 80 }}>
              <Block style={{ width: 64, height: 64, borderRadius: 32 }} />
              <Block style={{ width: 50, height: 10, borderRadius: 4, marginTop: 8 }} />
            </View>
          ))}
        </View>
      </View>

      {/* Feed card */}
      <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
        <View style={styles.feedHeader}>
          <Block style={{ width: 36, height: 36, borderRadius: 18 }} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Block style={{ width: '50%', height: 13, borderRadius: 4, marginBottom: 6 }} />
            <Block style={{ width: '35%', height: 11, borderRadius: 4 }} />
          </View>
        </View>
        <Block style={{ width: '100%', height: screenWidth * 0.7, borderRadius: 0, marginTop: 8 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  sectionWrap: { paddingHorizontal: 16, marginTop: 8, marginBottom: 16 },
  horizontalRow: { flexDirection: 'row' },
  feedHeader: { flexDirection: 'row', alignItems: 'center' },
});
