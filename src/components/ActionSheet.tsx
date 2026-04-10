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
                    <View style={styles.rowContent}>
                      {renderIcon(opt, itemColor)}
                      <Text
                        style={[
                          styles.rowText,
                          { color: itemColor },
                          opt.destructive && styles.rowTextDestructive,
                        ]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </View>
                    {!isLast && (
                      <View
                        style={[
                          styles.separator,
                          { backgroundColor: isDark ? '#38383a' : '#e5e5ea' },
                          opt.icon ? { marginLeft: 52 } : undefined,
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
