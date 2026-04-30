import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useUpdateMyBoardMutation, type Board } from '../../store';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';

// Keep in lockstep with `MAX_FEATURED_BOARDS_PER_SHAPER` in
// surfvault-api/services/boards/handler.ts. Carousels in Boardroom +
// Discover show up to 9 board slides before the trailing "View Shaper's
// Bay" CTA — so a shaper can fill every slot before the CTA.
const MAX_FEATURED_BOARDS = 9;

const BOARD_TYPE_OPTIONS = [
  { label: 'Shortboard', value: 'shortboard' },
  { label: 'Longboard', value: 'longboard' },
  { label: 'Fish', value: 'fish' },
  { label: 'Midlength', value: 'midlength' },
  { label: 'Gun', value: 'gun' },
  { label: 'Foamie', value: 'foamie' },
  { label: 'Other', value: 'other' },
];

interface BoardEditSheetProps {
  visible: boolean;
  board: Board | null;
  featuredCount: number;
  onClose: () => void;
}

/**
 * Edit-only board sheet for self-service shapers. Mobile counterpart of
 * the web BoardEditDrawer (edit case). New-board creation goes through
 * the (tabs)/upload screen instead, so this sheet doesn't handle creates —
 * it's always rendered against an existing board.
 */
export default function BoardEditSheet({
  visible,
  board,
  featuredCount,
  onClose,
}: BoardEditSheetProps) {
  const isDark = useColorScheme() === 'dark';
  const { visible: kbVisible, height: kbHeight } = useKeyboardVisible();

  const [name, setName] = useState('');
  const [boardType, setBoardType] = useState<string | undefined>(undefined);
  const [dimensions, setDimensions] = useState('');
  const [description, setDescription] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [updateMyBoard] = useUpdateMyBoardMutation();

  useEffect(() => {
    if (visible && board) {
      setName(board.name ?? '');
      setBoardType(board.board_type ?? undefined);
      setDimensions(board.dimensions ?? '');
      setDescription(board.description ?? '');
      setIsFeatured(!!board.is_featured);
    }
  }, [visible, board?.id]);

  const wouldExceedFeaturedCap =
    isFeatured && !board?.is_featured && featuredCount >= MAX_FEATURED_BOARDS;

  const handleSave = async () => {
    if (!board) return;
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a board name.');
      return;
    }
    if (wouldExceedFeaturedCap) {
      Alert.alert(
        'Featured cap reached',
        `You already have ${MAX_FEATURED_BOARDS} featured boards. Unfeature one before flagging another.`
      );
      return;
    }
    setSubmitting(true);
    try {
      await updateMyBoard({
        boardId: board.id,
        payload: {
          name: name.trim(),
          board_type: boardType ?? null,
          dimensions: dimensions.trim() || null,
          description: description.trim() || null,
          is_featured: isFeatured,
        },
      }).unwrap();
      onClose();
    } catch (err: any) {
      Alert.alert('Save failed', err?.data?.message || err?.message || 'Try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
          <Pressable onPress={onClose} disabled={submitting} hitSlop={8}>
            <Text style={[styles.headerBtn, { color: isDark ? '#9ca3af' : '#6b7280' }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111827' }]}>Edit board</Text>
          <Pressable onPress={handleSave} disabled={submitting || !name.trim() || wouldExceedFeaturedCap} hitSlop={8}>
            {submitting ? (
              <ActivityIndicator size="small" color="#0ea5e9" />
            ) : (
              <Text
                style={[
                  styles.headerBtn,
                  {
                    color:
                      !name.trim() || wouldExceedFeaturedCap
                        ? (isDark ? '#4b5563' : '#9ca3af')
                        : '#0ea5e9',
                    fontWeight: '700',
                  },
                ]}
              >
                Save
              </Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: kbVisible ? kbHeight + 24 : 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.field}>
              <Text style={[styles.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="The Salt Stick"
                placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                maxLength={120}
                style={[
                  styles.textInput,
                  {
                    color: isDark ? '#fff' : '#111827',
                    backgroundColor: isDark ? '#0b0b0b' : '#f9fafb',
                    borderColor: isDark ? '#1f2937' : '#e5e7eb',
                  },
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {BOARD_TYPE_OPTIONS.map((opt) => {
                  const active = boardType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setBoardType(active ? undefined : opt.value)}
                      style={[
                        styles.typePill,
                        {
                          backgroundColor: active ? '#0ea5e9' : (isDark ? '#1f2937' : '#f3f4f6'),
                          borderColor: active ? '#0ea5e9' : (isDark ? '#374151' : '#e5e7eb'),
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: active ? '#fff' : (isDark ? '#d1d5db' : '#374151'),
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Dimensions</Text>
              <TextInput
                value={dimensions}
                onChangeText={setDimensions}
                placeholder='5&apos;10" x 19" x 2 1/2"'
                placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                maxLength={60}
                style={[
                  styles.textInput,
                  {
                    color: isDark ? '#fff' : '#111827',
                    backgroundColor: isDark ? '#0b0b0b' : '#f9fafb',
                    borderColor: isDark ? '#1f2937' : '#e5e7eb',
                  },
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: isDark ? '#d1d5db' : '#374151' }]}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What this board is built for..."
                placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                maxLength={500}
                multiline
                style={[
                  styles.textInput,
                  styles.textArea,
                  {
                    color: isDark ? '#fff' : '#111827',
                    backgroundColor: isDark ? '#0b0b0b' : '#f9fafb',
                    borderColor: isDark ? '#1f2937' : '#e5e7eb',
                  },
                ]}
              />
            </View>

            {/* Featured toggle */}
            <View style={[styles.field, styles.featuredRow, { borderColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="star" size={14} color="#f59e0b" />
                  <Text style={[styles.label, { color: isDark ? '#d1d5db' : '#374151', marginBottom: 0 }]}>
                    Featured
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af', marginTop: 4 }}>
                  Featured boards surface in Boardroom + Discover. {MAX_FEATURED_BOARDS}-board cap.
                </Text>
              </View>
              <Switch
                value={isFeatured}
                onValueChange={setIsFeatured}
                trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#f59e0b' }}
              />
            </View>

            {wouldExceedFeaturedCap && (
              <View style={[styles.warningBox, { backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb', borderColor: isDark ? 'rgba(245,158,11,0.2)' : '#fde68a' }]}>
                <Ionicons name="warning-outline" size={16} color="#f59e0b" />
                <Text style={{ fontSize: 12, color: isDark ? '#fbbf24' : '#92400e', flex: 1, marginLeft: 6 }}>
                  You already have {MAX_FEATURED_BOARDS} featured boards. Unfeature one before flagging another.
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerBtn: { fontSize: 16, fontWeight: '600' },

  field: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  textInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  textArea: { height: 100, paddingVertical: 10, textAlignVertical: 'top' },

  typePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },

  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
});
