import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  useCreateMyBoardMutation,
  useCreateMyBoardPhotosMutation,
} from '../store';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_SIZE = (SCREEN_WIDTH - 48 - 8) / 4; // 4-column grid with gaps

const BOARD_TYPE_OPTIONS = [
  { label: 'Shortboard', value: 'shortboard' },
  { label: 'Longboard', value: 'longboard' },
  { label: 'Fish', value: 'fish' },
  { label: 'Midlength', value: 'midlength' },
  { label: 'Gun', value: 'gun' },
  { label: 'Foamie', value: 'foamie' },
  { label: 'Other', value: 'other' },
];

interface PickedFile {
  uri: string;
  name: string;
  size: number;
  type: string;
}

/**
 * Mobile board-creation surface for shapers. Mirrors the Upload Session
 * tab's chrome (header + scrollable form + thumbnail grid + Create button)
 * but with board-specific fields. Triggers the `newBoard` notification
 * server-side; user stays on the screen and can navigate away while uploads
 * complete in the background.
 */
export default function UploadBoard() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { visible: kbVisible, height: kbHeight } = useKeyboardVisible();

  const [name, setName] = useState('');
  const [boardType, setBoardType] = useState<string | undefined>(undefined);
  const [dimensions, setDimensions] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [createMyBoard] = useCreateMyBoardMutation();
  const [createMyBoardPhotos] = useCreateMyBoardPhotosMutation();

  // Compress is unnecessary on mobile — the picker already gives us a usable
  // size. Files are uploaded directly to the public-read boards bucket.
  const handlePickPhotos = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'SurfVault needs photo library access to upload board photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (result.canceled) return;
    const picked: PickedFile[] = result.assets.map((a) => ({
      uri: a.uri,
      name: a.fileName ?? a.uri.split('/').pop() ?? 'photo.jpg',
      size: a.fileSize ?? 0,
      type: a.mimeType ?? 'image/jpeg',
    }));
    setFiles((prev) => [...prev, ...picked]);
  }, []);

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setName('');
    setBoardType(undefined);
    setDimensions('');
    setDescription('');
    setFiles([]);
  };

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a board name.');
      return;
    }
    setIsSubmitting(true);
    try {
      const boardRes = await createMyBoard({
        name: name.trim(),
        board_type: boardType ?? null,
        dimensions: dimensions.trim() || null,
        description: description.trim() || null,
        is_featured: false, // Featured toggle lives on the profile.
      }).unwrap();

      const boardId = boardRes?.results?.boardId;
      if (!boardId) throw new Error('Missing boardId in response');

      if (files.length) {
        const presigned = await createMyBoardPhotos({
          boardId,
          payload: {
            files: files.map((f) => ({
              file_uuid: cryptoRandomUUID(),
              file_type: f.type || 'image/jpeg',
            })),
          },
        }).unwrap();
        const photos = presigned?.results?.photos ?? [];
        // Pair returned presigned URLs back to the picked files by index.
        await Promise.all(
          photos.map(async (p: any, i: number) => {
            const file = files[i];
            const blob = await (await fetch(file.uri)).blob();
            await fetch(p.url, {
              method: 'PUT',
              headers: { 'Content-Type': file.type || 'image/jpeg' },
              body: blob,
            });
          })
        );
      }

      const msg = files.length
        ? `Board "${name.trim()}" created with ${files.length} photo${files.length === 1 ? '' : 's'}.`
        : `Board "${name.trim()}" created.`;
      reset();
      Alert.alert('Board created', msg);
    } catch (err: any) {
      Alert.alert('Create failed', err?.data?.message || err?.message || 'Try again');
    } finally {
      setIsSubmitting(false);
    }
  }, [name, boardType, dimensions, description, files, createMyBoard, createMyBoardPhotos]);

  // Reset the focus when the screen mounts (helpful after first install).
  useEffect(() => {
    return () => {};
  }, []);

  const canSubmit = !!name.trim() && !isSubmitting;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}>
            <MaterialCommunityIcons name="hammer-wrench" size={18} color="#0ea5e9" />
          </View>
          <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111827' }]}>New Board</Text>
        </View>
        <Pressable
          onPress={handleCreate}
          disabled={!canSubmit}
          style={[
            styles.createBtn,
            !canSubmit && styles.createBtnDisabled,
            { backgroundColor: canSubmit ? '#0ea5e9' : (isDark ? '#1f2937' : '#e5e7eb') },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.createBtnText, { color: canSubmit ? '#fff' : (isDark ? '#6b7280' : '#9ca3af') }]}>
              Create
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
          {/* Name */}
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

          {/* Type — pill row. Tap to toggle; tap again to clear. */}
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
                        backgroundColor: active
                          ? '#0ea5e9'
                          : (isDark ? '#1f2937' : '#f3f4f6'),
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

          {/* Dimensions */}
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

          {/* Description */}
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

          {/* Photos */}
          <View style={styles.field}>
            <View style={styles.photoHeaderRow}>
              <Text style={[styles.label, { color: isDark ? '#d1d5db' : '#374151', marginBottom: 0 }]}>
                Photos
              </Text>
              <Pressable
                onPress={handlePickPhotos}
                style={[
                  styles.addPhotosBtn,
                  { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' },
                ]}
              >
                <Ionicons name="add" size={16} color={isDark ? '#d1d5db' : '#374151'} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#d1d5db' : '#374151' }}>
                  {files.length ? 'Add more' : 'Choose photos'}
                </Text>
              </Pressable>
            </View>

            {files.length === 0 ? (
              <Pressable
                onPress={handlePickPhotos}
                style={[
                  styles.dropZone,
                  { borderColor: isDark ? '#374151' : '#d1d5db', backgroundColor: isDark ? '#0b0b0b' : '#f9fafb' },
                ]}
              >
                <Ionicons name="cloud-upload-outline" size={32} color={isDark ? '#6b7280' : '#9ca3af'} />
                <Text style={{ fontSize: 14, fontWeight: '500', color: isDark ? '#9ca3af' : '#6b7280', marginTop: 8 }}>
                  Tap to add photos
                </Text>
                <Text style={{ fontSize: 12, color: isDark ? '#6b7280' : '#9ca3af', marginTop: 4 }}>
                  You can also add more later from your profile
                </Text>
              </Pressable>
            ) : (
              <View style={styles.photoGrid}>
                {files.map((f, idx) => (
                  <View key={`${f.uri}-${idx}`} style={[styles.photoTile, { width: PREVIEW_SIZE, height: PREVIEW_SIZE }]}>
                    <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    <Pressable
                      onPress={() => removeFile(idx)}
                      hitSlop={6}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          <Text style={{ fontSize: 11, color: isDark ? '#6b7280' : '#9ca3af', textAlign: 'center', marginTop: 12 }}>
            Featured status is managed from your profile so you can curate which boards surface in Discover and Boardroom.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// crypto.randomUUID isn't reliably available in React Native runtimes. Fall
// back to a v4-shape generated from Math.random — fine for a per-file key
// that's only meaningful client-side.
function cryptoRandomUUID(): string {
  // @ts-ignore - some RN runtimes expose this
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  createBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnDisabled: { opacity: 1 },
  createBtnText: { fontSize: 14, fontWeight: '700' },

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

  photoHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addPhotosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  dropZone: {
    height: 160,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  photoTile: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#222',
    position: 'relative',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
