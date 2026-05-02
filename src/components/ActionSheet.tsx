import { useCallback, useMemo, useRef, useEffect, type ComponentProps } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  useColorScheme,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];
type MaterialCommunityIconsName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface ActionSheetOption {
  label: string;
  destructive?: boolean;
  onPress: () => void;
  icon?: IoniconsName | MaterialCommunityIconsName;
  iconLibrary?: 'ionicons' | 'material-community';
  /**
   * If set, renders the image (typically a profile picture) in place of the
   * icon slot. Falls back to `icon` if the image fails to load.
   */
  imageUri?: string | null;
  /** Optional secondary line under the label (e.g. user_type pill text). */
  subtitle?: string;
  /** Renders an active checkmark on the right side of the row. */
  trailingCheckmark?: boolean;
  /** Centers the label text horizontally and suppresses the icon slot. */
  centered?: boolean;
}

export interface ActionSheetSection {
  options: ActionSheetOption[];
}

export interface ActionSheetHeader {
  title: string;
  subtitle?: string;
  imageUri?: string;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  options?: ActionSheetOption[];
  sections?: ActionSheetSection[];
  title?: string;
  header?: ActionSheetHeader;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ActionSheet({ visible, options, sections, title, header, onClose }: ActionSheetProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 28,
          stiffness: 300,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [onClose, slideAnim, backdropAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) slideAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          handleClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            damping: 28,
            stiffness: 300,
            mass: 0.8,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const resolvedSections = useMemo(() => {
    if (sections && sections.length > 0) return sections;
    if (options && options.length > 0) return [{ options }];
    return [];
  }, [sections, options]);

  const handlePress = useCallback((opt: ActionSheetOption) => {
    handleClose();
    setTimeout(() => opt.onPress(), 250);
  }, [handleClose]);

  const renderIcon = (opt: ActionSheetOption, color: string) => {
    // Image takes precedence over icon — used for profile pictures in the
    // account switcher. The View wrapper preserves consistent sizing with
    // icon-style rows so labels stay vertically aligned across mixed rows.
    if (opt.imageUri) {
      return (
        <View style={styles.iconWrap}>
          <Image
            source={{ uri: opt.imageUri }}
            style={{ width: 36, height: 36, borderRadius: 18 }}
            contentFit="cover"
          />
        </View>
      );
    }
    if (!opt.icon) return null;
    const iconBg = opt.destructive
      ? (isDark ? 'rgba(255,59,48,0.12)' : 'rgba(255,59,48,0.08)')
      : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)');

    const IconComponent = opt.iconLibrary === 'material-community'
      ? MaterialCommunityIcons
      : Ionicons;

    return (
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <IconComponent
          name={opt.icon as any}
          size={20}
          color={color}
        />
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.container}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBg(isDark),
              paddingBottom: Math.max(insets.bottom, 24),
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Handle */}
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: isDark ? '#5a5a5e' : '#d1d1d6' }]} />
          </View>

          {/* Header — contextual info about what was selected */}
          {header ? (
            <View style={styles.headerSection}>
              {header.imageUri ? (
                <Image
                  source={{ uri: header.imageUri }}
                  style={styles.headerImage}
                  contentFit="cover"
                />
              ) : null}
              <View style={styles.headerText}>
                <Text
                  style={[styles.headerTitle, { color: isDark ? '#f5f5f7' : '#1d1d1f' }]}
                  numberOfLines={1}
                >
                  {header.title}
                </Text>
                {header.subtitle ? (
                  <Text
                    style={[styles.headerSubtitle, { color: isDark ? '#98989f' : '#86868b' }]}
                    numberOfLines={1}
                  >
                    {header.subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Title */}
          {title ? (
            <Text style={[styles.title, { color: isDark ? '#98989f' : '#86868b' }]}>
              {title}
            </Text>
          ) : null}

          {/* Sections */}
          {resolvedSections.map((section, sIdx) => (
            <View
              key={sIdx}
              style={[styles.card, { backgroundColor: cardBg(isDark) }]}
            >
              {section.options.map((opt, i) => {
                const itemColor = opt.destructive ? '#FF3B30' : (isDark ? '#f5f5f7' : '#1d1d1f');
                const isLast = i === section.options.length - 1;
                return (
                  <Pressable
                    key={i}
                    onPress={() => handlePress(opt)}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: pressedBg(isDark) },
                    ]}
                  >
                    <View
                      style={[
                        styles.rowContent,
                        opt.centered && { justifyContent: 'center' },
                      ]}
                    >
                      {!opt.centered && renderIcon(opt, itemColor)}
                      {opt.subtitle ? (
                        // Two-line variant: stack label + subtitle. Wrapper
                        // takes flex:1 so the row layout matches the
                        // single-line variant.
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.rowText,
                              { color: itemColor },
                              opt.destructive && styles.rowTextDestructive,
                              opt.centered && { textAlign: 'center' },
                              { flex: undefined },
                            ]}
                            numberOfLines={1}
                          >
                            {opt.label}
                          </Text>
                          <Text
                            style={{
                              fontSize: 10,
                              color: isDark ? '#9ca3af' : '#6b7280',
                              marginTop: 2,
                              textTransform: 'capitalize',
                              textAlign: opt.centered ? 'center' : 'left',
                            }}
                            numberOfLines={1}
                          >
                            {opt.subtitle}
                          </Text>
                        </View>
                      ) : (
                        // Single-line variant: keep the original direct-child
                        // Text so vertical alignment matches every other
                        // ActionSheet usage in the app exactly.
                        <Text
                          style={[
                            styles.rowText,
                            { color: itemColor },
                            opt.destructive && styles.rowTextDestructive,
                            opt.centered && { textAlign: 'center' },
                          ]}
                          numberOfLines={1}
                        >
                          {opt.label}
                        </Text>
                      )}
                      {!opt.centered && opt.trailingCheckmark ? (
                        <Ionicons name="checkmark" size={20} color="#0ea5e9" style={{ marginLeft: 8 }} />
                      ) : null}
                    </View>
                    {!isLast && (
                      <View
                        style={[
                          styles.separator,
                          { backgroundColor: isDark ? '#38383a' : '#e5e5ea' },
                          (opt.icon || opt.imageUri) ? { marginLeft: 52 } : undefined,
                        ]}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const sheetBg = (isDark: boolean) => isDark ? '#1c1c1e' : '#ffffff';
const cardBg = (isDark: boolean) => isDark ? '#2c2c2e' : '#f2f2f7';
const pressedBg = (isDark: boolean) => isDark ? '#3a3a3c' : '#e8e8ed';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 2,
  },
  headerImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 2,
    paddingHorizontal: 16,
    letterSpacing: -0.1,
  },
  card: {
    marginHorizontal: 12,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
  },
  row: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    marginRight: 0,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowText: {
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: -0.2,
    flex: 1,
  },
  rowTextDestructive: {
    fontWeight: '400',
  },
});
