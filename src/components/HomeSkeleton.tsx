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

  // SessionCard image is edge-to-edge with aspectRatio 4:5 (portrait), so
  // its height = screenWidth * 1.25. Surf-break cards are 160 wide with a
  // 4:3 image and ~50px of text below.
  const feedImageHeight = screenWidth * 1.25;
  const breakImageHeight = (160 * 3) / 4;

  return (
    <View style={styles.wrap}>
      {/* Nearby Breaks */}
      <View style={styles.sectionWrap}>
        <Block style={{ width: 180, height: 18, borderRadius: 6, marginBottom: 6 }} />
        <Block style={{ width: 220, height: 12, borderRadius: 4, marginBottom: 12 }} />
        <View style={styles.horizontalRow}>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={{ width: 160, marginRight: 12 }}>
              <Block style={{ width: 160, height: breakImageHeight, borderRadius: 12 }} />
              <Block style={{ width: 130, height: 13, borderRadius: 4, marginTop: 6 }} />
              <Block style={{ width: 90, height: 11, borderRadius: 4, marginTop: 4 }} />
            </View>
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

      {/* Feed card — header (avatar + 2 lines + ellipsis), edge-to-edge 4:5
          portrait image, tapered dot pager. */}
      <View style={{ marginTop: 4 }}>
        <View style={[styles.feedHeader, { paddingHorizontal: 12, paddingVertical: 8 }]}>
          <Block style={{ width: 40, height: 40, borderRadius: 20 }} />
          <View style={{ marginLeft: 8, flex: 1 }}>
            <Block style={{ width: '50%', height: 13, borderRadius: 4, marginBottom: 4 }} />
            <Block style={{ width: '35%', height: 12, borderRadius: 4 }} />
          </View>
          <Block style={{ width: 18, height: 4, borderRadius: 2 }} />
        </View>
        <Block style={{ width: '100%', height: feedImageHeight, borderRadius: 0 }} />
        <View style={styles.dotsRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Block key={i} style={{ width: 6, height: 6, borderRadius: 3, marginHorizontal: 3 }} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  sectionWrap: { paddingHorizontal: 16, marginTop: 8, marginBottom: 16 },
  horizontalRow: { flexDirection: 'row' },
  feedHeader: { flexDirection: 'row', alignItems: 'center' },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 2,
  },
});
