import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReportUserMutation } from '../store';

// Keep values in sync with USER_REPORT_REASONS in surfvault-api/services/user/handler.ts
const REPORT_REASONS = [
  { value: 'inappropriate', label: 'Inappropriate or offensive content' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'other', label: 'Other', description: "Tell us what's wrong" },
];

const DETAILS_MAX = 500;

interface ReportUserSheetProps {
  visible: boolean;
  userId?: string;
  userHandle?: string;
  onClose: () => void;
  onBlocked?: () => void;
}

export default function ReportUserSheet({ visible, userId, userHandle, onClose, onBlocked }: ReportUserSheetProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [report, { isLoading }] = useReportUserMutation();

  const [selected, setSelected] = useState<string>('');
  const [details, setDetails] = useState<string>('');
  // Apple Guideline 1.2: pair reporting with blocking by default so the
  // reporter immediately stops seeing the abuser's content.
  const [alsoBlock, setAlsoBlock] = useState<boolean>(true);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (visible) {
      setSelected('');
      setDetails('');
      setAlsoBlock(true);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!userId || !selected) return;
    if (selected === 'other' && !details.trim()) {
      Alert.alert('Please describe the issue', "Tell us briefly what's wrong so we can review.");
      return;
    }
    Keyboard.dismiss();
    try {
      await report({ userId, reason: selected, details: details.trim(), alsoBlock }).unwrap();
      onClose();
      if (alsoBlock && onBlocked) onBlocked();
      Alert.alert(
        'Report submitted',
        alsoBlock
          ? `Thanks — our team will review it.${userHandle ? ` @${userHandle} has been blocked.` : ' This user has been blocked.'}`
          : 'Thanks — our team will review it and take appropriate action.'
      );
    } catch (e: any) {
      const msg = e?.data?.message || 'Could not submit report. Please try again.';
      Alert.alert('Error', msg);
    }
  }, [report, userId, userHandle, selected, details, alsoBlock, onClose, onBlocked]);

  const canSubmit = !!selected && (selected !== 'other' || details.trim().length > 0) && !isLoading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[s.flex, { backgroundColor: isDark ? '#0b1120' : '#ffffff' }]} edges={['top']}>
        <View style={s.header}>
          <Pressable onPress={handleClose} hitSlop={10} style={s.headerBtn}>
            <Text style={{ fontSize: 15, color: '#007AFF' }}>Cancel</Text>
          </Pressable>
          <Text style={[s.headerTitle, { color: isDark ? '#fff' : '#111827' }]}>
            Report {userHandle ? `@${userHandle}` : 'User'}
          </Text>
          <Pressable onPress={handleSubmit} disabled={!canSubmit} hitSlop={10} style={s.headerBtn}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <Text style={{
                fontSize: 15,
                fontWeight: '600',
                color: canSubmit ? '#ef4444' : (isDark ? '#4b5563' : '#cbd5e1'),
              }}>
                Submit
              </Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            ref={scrollRef}
            style={s.flex}
            contentContainerStyle={{ paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
              <Text style={[s.intro, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                Help us understand the issue. Your report is anonymous to the user — our team
                will review and take action as needed.
              </Text>
            </View>

            <View style={{ paddingHorizontal: 12 }}>
              {REPORT_REASONS.map((r) => {
                const isSelected = selected === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setSelected(r.value)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 12,
                      paddingVertical: 14,
                      borderRadius: 12,
                      marginBottom: 6,
                      backgroundColor: isSelected
                        ? (isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2')
                        : 'transparent',
                    }}
                  >
                    <View style={{
                      width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                      borderColor: isSelected ? '#ef4444' : (isDark ? '#4b5563' : '#cbd5e1'),
                      alignItems: 'center', justifyContent: 'center', marginRight: 12,
                    }}>
                      {isSelected && (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' }} />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#fff' : '#111827' }}>
                        {r.label}
                      </Text>
                      {r.description && (
                        <Text style={{ fontSize: 12, color: isDark ? '#9ca3af' : '#6b7280', marginTop: 2 }}>
                          {r.description}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {selected && (
              <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                <Text style={[s.label, { color: isDark ? '#d1d5db' : '#374151' }]}>
                  {selected === 'other' ? "What's happening?" : 'Additional details (optional)'}
                </Text>
                <TextInput
                  value={details}
                  onChangeText={(t) => t.length <= DETAILS_MAX && setDetails(t)}
                  onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
                  placeholder={selected === 'other' ? "Tell us what's wrong..." : 'Add any context that would help our review'}
                  placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                  multiline
                  style={{
                    backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
                    color: isDark ? '#fff' : '#111827',
                    borderRadius: 10, padding: 12, fontSize: 14, minHeight: 100,
                    textAlignVertical: 'top',
                  }}
                />
                <Text style={{ fontSize: 11, color: isDark ? '#6b7280' : '#9ca3af', textAlign: 'right', marginTop: 4 }}>
                  {details.length}/{DETAILS_MAX}
                </Text>
              </View>
            )}

            <Pressable
              onPress={() => setAlsoBlock((v) => !v)}
              style={{
                marginTop: 20,
                marginHorizontal: 20,
                paddingHorizontal: 14,
                paddingVertical: 14,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark ? 'rgba(148,163,184,0.1)' : '#f8fafc',
              }}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                borderColor: alsoBlock ? '#ef4444' : (isDark ? '#4b5563' : '#cbd5e1'),
                backgroundColor: alsoBlock ? '#ef4444' : 'transparent',
                alignItems: 'center', justifyContent: 'center', marginRight: 12,
              }}>
                {alsoBlock && (
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 }}>✓</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#fff' : '#111827' }}>
                  Also block this user
                </Text>
                <Text style={{ fontSize: 12, color: isDark ? '#9ca3af' : '#6b7280', marginTop: 2 }}>
                  Their content will be hidden from your feed and they won't be able to contact you.
                </Text>
              </View>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerBtn: { minWidth: 60 },
  intro: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
});
