import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Skeleton for the messages tab. Mirrors the conversation list layout
 * (header + rows of avatar + two lines of text) so there's no jarring
 * shift when conversations load.
 */
export default function MessagesSkeleton() {
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
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? '#030712' : '#ffffff' }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <Block style={{ width: 130, height: 24, borderRadius: 6 }} />
      </View>

      {/* Rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} style={[styles.row, { borderBottomColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <Block style={{ width: 48, height: 48, borderRadius: 24 }} />
          <View style={styles.info}>
            <View style={styles.topLine}>
              <Block style={{ width: '40%', height: 14, borderRadius: 4 }} />
              <Block style={{ width: 38, height: 11, borderRadius: 4 }} />
            </View>
            <Block style={{ width: '85%', height: 12, borderRadius: 4, marginTop: 8 }} />
            <Block style={{ width: '55%', height: 12, borderRadius: 4, marginTop: 4 }} />
          </View>
        </View>
      ))}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: { flex: 1, marginLeft: 12 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
