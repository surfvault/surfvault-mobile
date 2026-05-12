import { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RATIO_OPTIONS, type AspectRatioKey } from '../helpers/aspectRatio';

interface AspectRatioSheetProps {
  visible: boolean;
  /** Current ratio key, or null when using the surface default. */
  current: AspectRatioKey | null;
  onClose: () => void;
  /** Fired immediately on chip tap. Null = clear (revert to default). */
  onSelect: (next: AspectRatioKey | null) => void;
  /**
   * Optional thumbnail URI to render inside each preview rectangle so the
   * owner sees how their actual photo will be cropped at each ratio.
   */
  thumbnailUri?: string;
}

/**
 * Owner-only aspect-ratio picker for the session ellipsis menu. Taps fire
 * `onSelect` immediately — parent runs the optimistic mutation so the feed
 * thumbnail reflows on the next render. No confirm button.
 */
export default function AspectRatioSheet({
  visible,
  current,
  onClose,
  onSelect,
  thumbnailUri,
}: AspectRatioSheetProps) {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const [pendingKey, setPendingKey] = useState<AspectRatioKey | null>(current);

  useEffect(() => {
    if (visible) {
      setPendingKey(current);
      slide.setValue(0);
    }
  }, [visible, current, slide]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => { if (g.dy > 0) slide.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(slide, { toValue: 500, duration: 180, useNativeDriver: true }).start(() => {
            slide.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(slide, { toValue: 0, damping: 28, stiffness: 300, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const handlePick = useCallback(
    (key: AspectRatioKey) => {
      // Tap the already-selected chip → clear (revert to default).
      const next: AspectRatioKey | null = pendingKey === key ? null : key;
      setPendingKey(next);
      onSelect(next);
    },
    [pendingKey, onSelect],
  );

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={s.kbFill}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            s.sheet,
            {
              backgroundColor: isDark ? '#000000' : '#ffffff',
              paddingBottom: insets.bottom + 16,
              transform: [{ translateY: slide }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={s.handleRow}>
            <View style={[s.handle, { backgroundColor: isDark ? '#374151' : '#d1d5db' }]} />
          </View>

          <View style={[s.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
            <View style={s.iconChip}>
              <Ionicons name="resize" size={16} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: isDark ? '#fff' : '#0f172a' }]}>
                Card aspect ratio
              </Text>
              <Text style={[s.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]} numberOfLines={2}>
                How this session's card appears in feeds. Tap again to use the default.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={isDark ? '#94a3b8' : '#64748b'} />
            </Pressable>
          </View>

          <View style={s.body}>
            <View style={s.chipsRow}>
              {RATIO_OPTIONS.map((opt) => {
                const isSelected = pendingKey === opt.key;
                // Preview is sized so the tallest ratio (4:5 portrait) fits
                // a fixed visual height — every chip's preview has the same
                // max-height "envelope" so chips line up neatly.
                const PREVIEW_MAX_HEIGHT = 78;
                // Width tracks the ratio off a constant height for portrait
                // and squarish ratios; for landscape we cap the width and
                // let height shrink so wide chips don't blow the row out.
                const PREVIEW_MAX_WIDTH = 78;
                let previewWidth: number;
                let previewHeight: number;
                if (opt.value <= 1) {
                  previewHeight = PREVIEW_MAX_HEIGHT;
                  previewWidth = previewHeight * opt.value;
                } else {
                  previewWidth = PREVIEW_MAX_WIDTH;
                  previewHeight = previewWidth / opt.value;
                }
                const selectedBorder = isDark ? '#38bdf8' : '#0284c7';
                const idleBorder = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';
                return (
                  <TouchableOpacity
                    key={opt.key}
                    activeOpacity={0.8}
                    onPress={() => handlePick(opt.key)}
                    style={[
                      s.chip,
                      {
                        borderColor: isSelected ? selectedBorder : idleBorder,
                        borderWidth: isSelected ? 2 : 1,
                        backgroundColor: isSelected
                          ? (isDark ? 'rgba(14,165,233,0.12)' : '#f0f9ff')
                          : 'transparent',
                      },
                    ]}
                  >
                    {/* Constant-size envelope so previews of different shapes
                        share a baseline — keeps chips visually aligned. */}
                    <View style={[s.previewEnvelope, { height: PREVIEW_MAX_HEIGHT, width: PREVIEW_MAX_WIDTH }]}>
                      <View
                        style={[
                          s.preview,
                          {
                            width: previewWidth,
                            height: previewHeight,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#e5e7eb',
                          },
                        ]}
                      >
                        {thumbnailUri ? (
                          <Image
                            source={{ uri: thumbnailUri }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                            transition={120}
                          />
                        ) : null}
                      </View>
                    </View>
                    <Text style={[s.chipKey, { color: isDark ? '#fff' : '#0f172a' }]}>
                      {opt.key}
                    </Text>
                    <Text style={[s.chipLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {pendingKey === null && (
              <Text style={[s.hint, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                Using the feed default.
              </Text>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  kbFill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handleRow: { alignItems: 'center', paddingVertical: 8 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconChip: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(14,165,233,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  subtitle: { fontSize: 13, lineHeight: 17, marginTop: 2 },
  body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  chip: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
  },
  previewEnvelope: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  chipKey: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  chipLabel: { fontSize: 11 },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    fontStyle: 'italic',
  },
});
