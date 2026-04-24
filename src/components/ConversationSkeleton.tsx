import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, useColorScheme } from 'react-native';

/**
 * Skeleton for the conversation messages list. Renders alternating
 * inbound/outbound message bubble placeholders. Rendered INSIDE the
 * conversation screen so the floating header (with the back button)
 * stays visible during load.
 */
export default function ConversationSkeleton({ topPadding = 0 }: { topPadding?: number }) {
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

  // inbound / outbound bubble widths to vary the rhythm
  const layout: Array<{ side: 'in' | 'out'; width: number }> = [
    { side: 'in', width: 180 },
    { side: 'in', width: 120 },
    { side: 'out', width: 160 },
    { side: 'out', width: 220 },
    { side: 'in', width: 240 },
    { side: 'out', width: 140 },
    { side: 'in', width: 100 },
    { side: 'out', width: 200 },
  ];

  return (
    <View style={[styles.wrap, { paddingTop: topPadding }]}>
      {/* Date separator placeholder */}
      <View style={styles.dateSep}>
        <Animated.View
          style={{ width: 80, height: 20, borderRadius: 10, backgroundColor: blockColor, opacity: pulse }}
        />
      </View>

      {layout.map((m, i) => (
        <View key={i} style={[styles.bubbleWrap, m.side === 'out' ? styles.out : styles.in]}>
          <Animated.View
            style={{
              width: m.width,
              height: 36,
              borderRadius: 18,
              backgroundColor: blockColor,
              opacity: pulse,
              borderBottomRightRadius: m.side === 'out' ? 4 : 18,
              borderTopLeftRadius: m.side === 'in' ? 4 : 18,
            }}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  dateSep: { alignItems: 'center', paddingVertical: 12 },
  bubbleWrap: { marginBottom: 8, maxWidth: '80%' },
  out: { alignSelf: 'flex-end' },
  in: { alignSelf: 'flex-start' },
});
