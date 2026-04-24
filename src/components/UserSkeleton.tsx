import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, useColorScheme, Dimensions } from 'react-native';

/**
 * Skeleton for the user profile page (other users). Rendered BELOW the
 * existing ScreenHeader, so this covers only the profile header block,
 * tab bar, and 3-column session grid.
 */
export default function UserSkeleton() {
  const isDark = useColorScheme() === 'dark';
  const pulse = useRef(new Animated.Value(0.4)).current;
  const screenWidth = Dimensions.get('window').width;
  const GRID_GAP = 1;
  const GRID_SIZE = (screenWidth - GRID_GAP * 2) / 3;

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
      {/* Profile header block */}
      <View style={styles.profileWrap}>
        <View style={styles.topRow}>
          <Block style={{ width: 80, height: 80, borderRadius: 40 }} />
          <View style={styles.rightColumn}>
            <Block style={{ width: '70%', height: 18, borderRadius: 6, marginBottom: 10 }} />
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Block style={{ width: 28, height: 16, borderRadius: 4, marginBottom: 4 }} />
                <Block style={{ width: 38, height: 10, borderRadius: 4 }} />
              </View>
              <View style={styles.statItem}>
                <Block style={{ width: 28, height: 16, borderRadius: 4, marginBottom: 4 }} />
                <Block style={{ width: 52, height: 10, borderRadius: 4 }} />
              </View>
              <View style={styles.statItem}>
                <Block style={{ width: 28, height: 16, borderRadius: 4, marginBottom: 4 }} />
                <Block style={{ width: 52, height: 10, borderRadius: 4 }} />
              </View>
            </View>
          </View>
        </View>

        {/* Tag pills */}
        <View style={styles.pillsRow}>
          <Block style={{ width: 96, height: 22, borderRadius: 999 }} />
          <Block style={{ width: 68, height: 22, borderRadius: 999 }} />
        </View>

        {/* Location/active row */}
        <Block style={{ width: '60%', height: 16, borderRadius: 6, marginBottom: 12 }} />

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Block style={{ flex: 1, height: 34, borderRadius: 8 }} />
          <Block style={{ flex: 1, height: 34, borderRadius: 8 }} />
          <Block style={{ width: 38, height: 34, borderRadius: 8 }} />
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
        <View style={styles.tabBtn}>
          <Block style={{ width: 24, height: 24, borderRadius: 4 }} />
        </View>
        <View style={styles.tabBtn}>
          <Block style={{ width: 24, height: 24, borderRadius: 4 }} />
        </View>
      </View>

      {/* Grid placeholders */}
      <View style={styles.grid}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Block
            key={i}
            style={{
              width: GRID_SIZE,
              height: GRID_SIZE * 1.3,
              borderRadius: 0,
              margin: 0.5,
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  profileWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rightColumn: { flex: 1, marginLeft: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 16 },
  statItem: { alignItems: 'flex-start' },
  pillsRow: { flexDirection: 'row', gap: 5, marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
