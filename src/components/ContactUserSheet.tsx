import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  Animated,
  PanResponder,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStartConversationWithUserMutation } from '../store';

const MAX_LEN = 1000;

interface ContactUserSheetProps {
  visible: boolean;
  user: { id?: string; handle?: string } | null;
  onClose: () => void;
  onSent?: (conversationId: string) => void;
}

export default function ContactUserSheet({ visible, user, onClose, onSent }: ContactUserSheetProps) {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [startConversation, { isLoading: sending }] = useStartConversationWithUserMutation();

  const slide = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (visible) {
      setMessage('');
      setError('');
      slide.setValue(0);
    }
  }, [visible, slide]);

  const handleSend = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError('Please enter a message.');
      return;
    }
    if (!user?.id) return;
    setError('');
    try {
      const res: any = await startConversation({ userId: user.id, message: trimmed }).unwrap();
      const conversationId = res?.results?.conversationId;
      onClose();
      if (conversationId && onSent) onSent(conversationId);
    } catch {
      setError("Couldn't send your message. Please try again.");
    }
  }, [message, user, startConversation, onClose, onSent]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.kbFill}
      >
        <Pressable style={s.backdrop} onPress={sending ? undefined : onClose} />
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
              <Ionicons name="chatbubble-ellipses" size={16} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: isDark ? '#fff' : '#0f172a' }]}>
                Message @{user?.handle}
              </Text>
              <Text style={[s.subtitle, { color: isDark ? '#94a3b8' : '#64748b' }]} numberOfLines={2}>
                Start a new conversation. They'll be notified right away.
              </Text>
            </View>
            <Pressable onPress={sending ? undefined : onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={isDark ? '#94a3b8' : '#64748b'} />
            </Pressable>
          </View>

          {/* Body */}
          <View style={s.body}>
            <Text style={[s.sectionLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              Message
            </Text>
            <View style={[
              s.inputWrap,
              {
                borderColor: error
                  ? (isDark ? 'rgba(239,68,68,0.4)' : '#fecaca')
                  : (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'),
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
              },
            ]}>
              <TextInput
                multiline
                value={message}
                onChangeText={(t) => { setMessage(t); if (error) setError(''); }}
                placeholder={`Hey @${user?.handle ?? ''} …`}
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                maxLength={MAX_LEN}
                autoFocus
                style={[s.input, { color: isDark ? '#fff' : '#0f172a' }]}
              />
              <Text style={[s.counter, { color: isDark ? '#475569' : '#94a3b8' }]}>
                {message.length}/{MAX_LEN}
              </Text>
            </View>

            {!!error && (
              <View style={[s.errorPill, {
                backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2',
                borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#fecaca',
              }]}>
                <Text style={[s.errorText, { color: isDark ? '#fca5a5' : '#b91c1c' }]}>{error}</Text>
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={[s.footer, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
            <Pressable
              onPress={onClose}
              disabled={sending}
              style={[s.cancelBtn, { opacity: sending ? 0.5 : 1 }]}
            >
              <Text style={[s.cancelText, { color: isDark ? '#e2e8f0' : '#334155' }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSend}
              disabled={sending || !message.trim()}
              style={[
                s.sendBtn,
                {
                  backgroundColor: sending || !message.trim()
                    ? (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0')
                    : '#0284c7',
                },
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={14} color={!message.trim() ? (isDark ? '#64748b' : '#94a3b8') : '#fff'} />
                  <Text style={[s.sendText, {
                    color: !message.trim() ? (isDark ? '#64748b' : '#94a3b8') : '#fff',
                  }]}>
                    Send
                  </Text>
                </>
              )}
            </Pressable>
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
  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputWrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  input: {
    minHeight: 100,
    maxHeight: 160,
    fontSize: 15,
    lineHeight: 21,
    padding: 0,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 11, textAlign: 'right', marginTop: 4 },
  errorPill: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: { fontSize: 12 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    height: 38, paddingHorizontal: 16, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600' },
  sendBtn: {
    height: 38, paddingHorizontal: 16, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  sendText: { fontSize: 14, fontWeight: '700' },
});
