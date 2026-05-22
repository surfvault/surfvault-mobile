import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  PanResponder,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AddSurfBreakSheetProps {
  visible: boolean;
  coordinate: { latitude: number; longitude: number } | null;
  onClose: () => void;
  // Resolve on success; reject with an Error whose message is shown inline.
  onCreate: (name: string) => Promise<void>;
}

export default function AddSurfBreakSheet({
  visible,
  coordinate,
  onClose,
  onCreate,
}: AddSurfBreakSheetProps) {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setName('');
      setSubmitting(false);
      setError(null);
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

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleConfirm = useCallback(async () => {
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(trimmed);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create surf break');
      setSubmitting(false);
    }
  }, [trimmed, submitting, onCreate]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={submitting ? undefined : onClose}>
      <KeyboardAvoidingView
        style={s.kbFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={s.backdrop} onPress={submitting ? undefined : onClose} />
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
          {/* Drag handle */}
          <View style={s.handleRow}>
            <View style={[s.handle, { backgroundColor: isDark ? '#374151' : '#d1d5db' }]} />
          </View>

          {/* Header */}
          <View style={[s.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
            <View style={s.iconChip}>
              <Ionicons name="add-circle" size={16} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: isDark ? '#fff' : '#0f172a' }]}>
                New surf break
              </Text>
              <Text style={[s.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]} numberOfLines={2}>
                Country and region are derived from the coordinates automatically.
              </Text>
            </View>
            <Pressable onPress={submitting ? undefined : onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={isDark ? '#94a3b8' : '#64748b'} />
            </Pressable>
          </View>

          {/* Body */}
          <View style={s.body}>
            <Text style={[s.sectionLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              Break name
            </Text>
            <TextInput
              value={name}
              onChangeText={(t) => { setName(t); if (error) setError(null); }}
              placeholder="e.g. Pipeline"
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
              autoFocus
              autoCorrect={false}
              editable={!submitting}
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
              style={[
                s.input,
                {
                  color: isDark ? '#fff' : '#0f172a',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                },
              ]}
            />

            {/* Coordinates */}
            <View style={s.coordRow}>
              <Ionicons name="location-outline" size={14} color={isDark ? '#94a3b8' : '#64748b'} />
              <Text style={[s.coordText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                {coordinate
                  ? `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`
                  : '—'}
              </Text>
            </View>

            {error && (
              <View style={s.errorRow}>
                <Ionicons name="alert-circle" size={14} color="#ef4444" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
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
              disabled={!canSubmit}
              style={[
                s.confirmBtn,
                {
                  backgroundColor: !canSubmit
                    ? (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0')
                    : '#0284c7',
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={[s.confirmText, {
                  color: !canSubmit ? (isDark ? '#64748b' : '#94a3b8') : '#fff',
                }]}>
                  Create break
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
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
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  coordText: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  errorText: { fontSize: 13, color: '#ef4444', flex: 1 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 14,
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
