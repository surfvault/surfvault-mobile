import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  PanResponder,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DURATIONS = [
  { value: '1 week', label: '1 week', sublabel: 'Short-term view', icon: 'time-outline' as const },
  { value: '2 weeks', label: '2 weeks', sublabel: null, icon: 'time-outline' as const },
  { value: '1 month', label: '1 month', sublabel: null, icon: 'time-outline' as const },
  { value: '3 months', label: '3 months', sublabel: null, icon: 'time-outline' as const },
  { value: '6 months', label: '6 months', sublabel: null, icon: 'time-outline' as const },
  { value: '1 year', label: '1 year', sublabel: 'Long-term access', icon: 'time-outline' as const },
  { value: 'Unlimited', label: 'Unlimited', sublabel: 'Until you revoke', icon: 'infinite-outline' as const },
];

interface ApproveAccessRequestSheetProps {
  visible: boolean;
  handle: string | null;
  onClose: () => void;
  onConfirm: (accessLength: string) => Promise<void> | void;
}

export default function ApproveAccessRequestSheet({
  visible,
  handle,
  onClose,
  onConfirm,
}: ApproveAccessRequestSheetProps) {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setSelected(null);
      setSubmitting(false);
      slide.setValue(0);
    }
  }, [visible, slide]);

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

  const handleConfirm = useCallback(async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(selected);
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, onConfirm]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={submitting ? undefined : onClose}>
      <View style={s.kbFill}>
        <Pressable style={s.backdrop} onPress={submitting ? undefined : onClose} />
        <Animated.View
          style={[
            s.sheet,
            {
              backgroundColor: isDark ? '#030712' : '#ffffff',
              paddingBottom: insets.bottom + 16,
              transform: [{ translateY: slide }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Drag handle */}
          <View style={s.handleRow}>
            <View style={[s.handle, { backgroundColor: isDark ? '#374151' : '#d1d5db' }]} />
          </View>

          {/* Header */}
          <View style={[s.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
            <View style={s.iconChip}>
              <Ionicons name="lock-closed" size={16} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: isDark ? '#fff' : '#0f172a' }]}>
                Grant profile access
              </Text>
              <Text style={[s.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]} numberOfLines={2}>
                Choose how long <Text style={{ fontWeight: '700', color: isDark ? '#fff' : '#0f172a' }}>@{handle}</Text> can view your sessions.
              </Text>
            </View>
            <Pressable onPress={submitting ? undefined : onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={isDark ? '#94a3b8' : '#64748b'} />
            </Pressable>
          </View>

          {/* Body */}
          <View style={s.body}>
            <Text style={[s.sectionLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              Access duration
            </Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {DURATIONS.map((d) => {
                const isSelected = selected === d.value;
                return (
                  <TouchableOpacity
                    key={d.value}
                    activeOpacity={0.8}
                    onPress={() => setSelected(d.value)}
                    disabled={submitting}
                    style={[
                      s.optionRow,
                      {
                        borderColor: isSelected
                          ? (isDark ? '#38bdf8' : '#0284c7')
                          : (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'),
                        backgroundColor: isSelected
                          ? (isDark ? 'rgba(14,165,233,0.12)' : '#f0f9ff')
                          : 'transparent',
                      },
                    ]}
                  >
                    <View style={[
                      s.optionIcon,
                      {
                        backgroundColor: isSelected
                          ? 'rgba(14,165,233,0.15)'
                          : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                      },
                    ]}>
                      <Ionicons
                        name={d.icon}
                        size={14}
                        color={isSelected ? (isDark ? '#38bdf8' : '#0284c7') : (isDark ? '#94a3b8' : '#64748b')}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.optionLabel, {
                        color: isSelected
                          ? (isDark ? '#fff' : '#0f172a')
                          : (isDark ? '#e2e8f0' : '#334155'),
                      }]}>
                        {d.label}
                      </Text>
                      {d.sublabel && (
                        <Text style={[s.optionSub, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                          {d.sublabel}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[
                        s.radio,
                        {
                          borderColor: isSelected
                            ? (isDark ? '#38bdf8' : '#0284c7')
                            : (isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1'),
                          backgroundColor: isSelected
                            ? (isDark ? '#38bdf8' : '#0284c7')
                            : 'transparent',
                        },
                      ]}
                    >
                      {isSelected && (
                        <View style={[s.radioInner, { backgroundColor: isDark ? '#030712' : '#ffffff' }]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Footer */}
          <View style={[s.footer, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={submitting ? undefined : onClose}
              style={[s.cancelBtn, { opacity: submitting ? 0.5 : 1 }]}
            >
              <Text style={[s.cancelText, { color: isDark ? '#e2e8f0' : '#334155' }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleConfirm}
              disabled={!selected || submitting}
              style={[
                s.confirmBtn,
                {
                  backgroundColor: !selected || submitting
                    ? (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0')
                    : '#0284c7',
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={[s.confirmText, {
                  color: !selected ? (isDark ? '#64748b' : '#94a3b8') : '#fff',
                }]}>
                  Grant access
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  kbFill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
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
  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  optionIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionSub: { fontSize: 11, marginTop: 1 },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 6, height: 6, borderRadius: 3 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    height: 40, paddingHorizontal: 16, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    height: 40, paddingHorizontal: 18, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 130,
  },
  confirmText: { fontSize: 14, fontWeight: '700' },
});
