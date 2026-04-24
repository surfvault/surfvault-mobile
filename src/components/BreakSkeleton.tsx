import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, useColorScheme, Dimensions } from 'react-native';

/**
 * Skeleton for the surf break detail feed. Rendered BELOW the existing
 * ScreenHeader (which already renders back/favorite/share buttons), so
 * this component only covers the break name, date picker, and feed cards.
 */
export default function BreakSkeleton() {
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
      {/* Break name + location + date pill */}
      <View style={styles.headerWrap}>
        <Block style={{ width: '55%', height: 22, borderRadius: 6 }} />
        <Block style={{ width: '40%', height: 13, borderRadius: 4, marginTop: 8 }} />
        <Block style={{ width: 110, height: 32, borderRadius: 10, marginTop: 12 }} />
      </View>

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
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  card: { marginBottom: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
});
