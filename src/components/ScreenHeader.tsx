import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenHeaderProps {
  title?: string;
  center?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export default function ScreenHeader({ title, center, left, right }: ScreenHeaderProps) {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: isDark ? '#030712' : '#ffffff' }]}>
      <View style={styles.row}>
        <View style={styles.side}>{left}</View>
        <View style={styles.center}>
          {center ?? (title ? (
            <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null)}
        </View>
        <View style={[styles.side, styles.rightSide]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 0,
  },
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  side: {
    minWidth: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightSide: {
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
});
