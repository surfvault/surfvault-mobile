import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  Alert,
  Switch,
  ActivityIndicator,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useUser } from '../../src/context/UserProvider';
import { useAuth } from '../../src/context/AuthProvider';
import { useKeyboardVisible } from '../../src/hooks/useKeyboardVisible';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useTabBar } from '../../src/context/TabBarContext';
import {
  useGetSurfBreaksQuery,
  useCreateSurfSessionMutation,
  useSaveSurfMediaMutation,
} from '../../src/store';
import { useUpload } from '../../src/context/UploadContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_SIZE = (SCREEN_WIDTH - 48 - 8) / 4; // 4 columns with gaps

interface SelectedFile {
  uri: string;
  name: string;
  size: number;
  type: string;
}

// Build the YYYY-MM-DD string from LOCAL date components, not UTC.
// DateTimePicker returns a Date that keeps the current time-of-day, so
// `toISOString()` can roll into UTC's calendar day — storing April 13
// when the user picked April 14 in their local tz. getFullYear/getMonth/
// getDate preserves the picked calendar day regardless of time. Matches
// the pattern used in app/break/[...breakRoute].tsx.
const formatDateParam = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

import { generateUUID } from '../../src/helpers/uuid';
import { checkStorageCapacity, showStorageLimitAlert } from '../../src/helpers/storage';
const formatDateLabel = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function CreateSessionScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { visible: kbVisible, height: kbHeight } = useKeyboardVisible();
  const { user } = useUser();
  const { isAuthenticated, login } = useAuth();
  const requireAuth = useRequireAuth();
  const { setTabBarVisible } = useTabBar();

  // Form state
  const [sessionName, setSessionName] = useState('');
  const [selectedBreak, setSelectedBreak] = useState<any>(null);
  const [breakSearch, setBreakSearch] = useState('');
  const [showBreakSearch, setShowBreakSearch] = useState(false);
  const [sessionDate, setSessionDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hideLocation, setHideLocation] = useState(false);
  const [notifyFollowers, setNotifyFollowers] = useState(true);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Break search
  const { data: breaksData, isFetching: searchingBreaks } = useGetSurfBreaksQuery(
    { search: debouncedSearch, limit: 10, continuationToken: '' },
    { skip: debouncedSearch.length < 2 }
  );
  const breakResults = breaksData?.results?.breaks ?? breaksData?.results?.surfBreaks ?? [];

  // Mutations
  const [createSession] = useCreateSurfSessionMutation();
  const [saveSurfMedia] = useSaveSurfMediaMutation();
  const { startUpload } = useUpload();

  const handleBreakSearch = useCallback((text: string) => {
    setBreakSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 400);
  }, []);

  const selectBreak = useCallback((brk: any) => {
    setSelectedBreak(brk);
    setShowBreakSearch(false);
    setTabBarVisible(true);
    setBreakSearch('');
    setDebouncedSearch('');
  }, [setTabBarVisible]);

  const handleDateChange = useCallback((_event: any, date?: Date) => {
    if (Platform.OS === 'android') { setShowDatePicker(false); setTabBarVisible(true); }
    if (date) setSessionDate(date);
  }, []);

  // Pick photos
  const handlePickPhotos = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.95,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newFiles: SelectedFile[] = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        size: asset.fileSize ?? 0,
        type: asset.mimeType ?? 'image/jpeg',
      }));

      // Dedupe by name + size
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => `${f.name}_${f.size}`));
        const unique = newFiles.filter((f) => !existing.has(`${f.name}_${f.size}`));
        return [...prev, ...unique];
      });
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => setFiles([]), []);

  // Validate
  const canSubmit = sessionName.trim() && selectedBreak && files.length > 0 && !isSubmitting;

  // Submit
  const handleCreateSession = useCallback(async () => {
    if (!canSubmit) return;
    if (!requireAuth()) return;

    // Storage check
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const storageCheck = checkStorageCapacity(user, totalBytes);
    if (!storageCheck.hasSpace) {
      showStorageLimitAlert(storageCheck);
      return;
    }
    const totalSizeGB = storageCheck.totalSizeGB;

    setIsSubmitting(true);

    try {
      // Create session — returns presigned URLs + upload file IDs in one call
      const filesMapped = files.map((f) => ({
        uuid: generateUUID(),
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: Date.now(),
        source: 'device',
      }));

      const sessionResult = await createSession({
        surfBreakId: selectedBreak.id,
        sessionName: sessionName.trim(),
        sessionDate: formatDateParam(sessionDate),
        hideLocation,
        notifyFollowers,
        files: filesMapped,
        totalSizeInGB: totalSizeGB,
      }).unwrap();

      const presignedUrlMap = sessionResult?.results?.presignedUrlMap;
      const uploadFileIdMap = sessionResult?.results?.uploadFileIdMap;
      const uploadSession = sessionResult?.results?.uploadSession; // "country#region#break#uploadId"
      const uploadId = uploadSession?.split('#').pop();

      if (!presignedUrlMap || !uploadId) {
        throw new Error('Failed to create session');
      }

      // Build file list for upload manager
      // presignedUrlMap is keyed by file UUID, uploadFileIdMap maps UUID -> DB row ID
      const uploadFiles = filesMapped.map((f) => ({
        name: f.name,
        uri: files.find((orig) => orig.name === f.name)!.uri,
        type: f.type,
        uploadFileId: uploadFileIdMap?.[f.uuid] ?? '',
        presignedUrl: presignedUrlMap[f.uuid] ?? '',
      })).filter((f) => f.presignedUrl && f.uploadFileId);

      // Start background upload via context
      startUpload({
        uploadId,
        sessionName: sessionName.trim(),
        files: uploadFiles,
      });

      // Reset form
      setSessionName('');
      setSelectedBreak(null);
      setFiles([]);
      setHideLocation(false);
      setNotifyFollowers(true);
      setSessionDate(new Date());

      // Navigate to home
      router.push('/(tabs)' as any);
    } catch (error: any) {
      Alert.alert('Error', error?.data?.message ?? 'Failed to create session. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, requireAuth, user, files, selectedBreak, sessionName, sessionDate, hideLocation, notifyFollowers, createSession, saveSurfMedia, startUpload, router]);

  // Not logged in
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={['top']}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconRow}>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#1f2937' : '#f0f9ff' }]}>
              <Ionicons name="camera-outline" size={24} color="#0ea5e9" />
            </View>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#1f2937' : '#f0fdf4' }]}>
              <Ionicons name="people-outline" size={24} color="#10b981" />
            </View>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#1f2937' : '#fef3c7' }]}>
              <Ionicons name="share-outline" size={24} color="#f59e0b" />
            </View>
          </View>
          <Text style={[styles.emptyTitle, { color: isDark ? '#fff' : '#111827' }]}>
            Upload your first session
          </Text>
          <Text style={[styles.emptySubtitle, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            Upload photos, organize them into groups, tag surfers, and share your sessions with the community
          </Text>
          <Pressable onPress={login} style={styles.signInBtn}>
            <Text style={styles.signInText}>Sign In to Get Started</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111827' }]}>New Session</Text>
        <Pressable
          onPress={handleCreateSession}
          disabled={!canSubmit}
          style={[styles.createBtn, { backgroundColor: canSubmit ? '#0ea5e9' : (isDark ? '#1f2937' : '#e5e7eb') }]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.createBtnText, { color: canSubmit ? '#fff' : '#9ca3af' }]}>Create</Text>
          )}
        </Pressable>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Session Name */}
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151' }]}>Session Name</Text>
          <TextInput
            value={sessionName}
            onChangeText={setSessionName}
            placeholder="e.g. Morning Glass-off"
            placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
            style={[styles.textInput, {
              backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
              color: isDark ? '#fff' : '#111827',
            }]}
          />
        </View>

        {/* Surf Break */}
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151' }]}>Surf Break</Text>
          {selectedBreak ? (
            <View style={[styles.selectedBreakRow, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectedBreakName, { color: isDark ? '#fff' : '#111827' }]}>
                  {selectedBreak.name}
                </Text>
                <Text style={[styles.selectedBreakSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                  {selectedBreak.region?.replaceAll('_', ' ')} · {selectedBreak.country_code}
                </Text>
              </View>
              <Pressable onPress={() => setSelectedBreak(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={isDark ? '#6b7280' : '#9ca3af'} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => { setShowBreakSearch(true); setTabBarVisible(false); }}
              style={[styles.textInput, styles.selectBtn, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}
            >
              <Ionicons name="search-outline" size={16} color={isDark ? '#6b7280' : '#9ca3af'} />
              <Text style={{ color: isDark ? '#4b5563' : '#9ca3af', flex: 1, marginLeft: 8 }}>Search surf breaks...</Text>
            </Pressable>
          )}
        </View>

        {/* Date */}
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151' }]}>Date</Text>
          <Pressable
            onPress={() => { setShowDatePicker(true); setTabBarVisible(false); }}
            style={[styles.textInput, styles.selectBtn, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}
          >
            <Ionicons name="calendar-outline" size={16} color={isDark ? '#6b7280' : '#9ca3af'} />
            <Text style={{ color: isDark ? '#fff' : '#111827', marginLeft: 8 }}>
              {formatDateLabel(sessionDate)}
            </Text>
          </Pressable>
        </View>

        {/* Hide Location */}
        <View style={[styles.fieldWrap, styles.switchRow]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151', marginBottom: 0 }]}>Hide Location</Text>
            <Text style={[styles.switchDesc, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
              Hidden from all users except you. Session still appears in feeds.
            </Text>
          </View>
          <Switch
            value={hideLocation}
            onValueChange={setHideLocation}
            trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#0ea5e9' }}
          />
        </View>

        {/* Notify Followers */}
        <View style={[styles.fieldWrap, styles.switchRow]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151', marginBottom: 0 }]}>Notify Followers</Text>
            <Text style={[styles.switchDesc, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
              Alert followers and users who favorited this break. Turn off for backfills.
            </Text>
          </View>
          <Switch
            value={notifyFollowers}
            onValueChange={setNotifyFollowers}
            trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#0ea5e9' }}
          />
        </View>

        {/* Photos */}
        <View style={styles.fieldWrap}>
          <View style={styles.photosHeader}>
            <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151', marginBottom: 0 }]}>
              Photos {files.length > 0 && `(${files.length})`}
            </Text>
            {files.length > 0 && (
              <Pressable onPress={clearFiles}>
                <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '500' }}>Clear All</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={handlePickPhotos}
            style={[styles.addPhotosBtn, { borderColor: isDark ? '#374151' : '#d1d5db', backgroundColor: isDark ? '#1f2937' : '#fafafa' }]}
          >
            <Ionicons name="images-outline" size={28} color={isDark ? '#6b7280' : '#9ca3af'} />
            <Text style={[styles.addPhotosText, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
              Tap to select photos
            </Text>
            <Text style={{ color: isDark ? '#4b5563' : '#9ca3af', fontSize: 12 }}>
              JPG, PNG, HEIC, RAW supported
            </Text>
          </Pressable>

          {/* Preview grid */}
          {files.length > 0 && (
            <View style={styles.previewGrid}>
              {files.map((file, index) => (
                <View key={`${file.name}_${index}`} style={styles.previewItem}>
                  <Image
                    source={{ uri: file.uri }}
                    style={styles.previewImage}
                    contentFit="cover"
                  />
                  <Pressable onPress={() => removeFile(index)} style={styles.removeBtn}>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Surf break search bottom sheet */}
      {showBreakSearch && (
        <View style={[styles.sheetOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowBreakSearch(false); setTabBarVisible(true); setBreakSearch(''); setDebouncedSearch(''); }} />
          <View style={[styles.breakSheet, { backgroundColor: isDark ? '#111827' : '#fff' }, kbVisible && { paddingBottom: kbHeight }]}>
            {/* Handle bar */}
            <View style={styles.sheetHandle}>
              <View style={[styles.sheetHandleBar, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
            </View>

            {/* Search input */}
            <View style={[styles.breakSheetSearch, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
              <Ionicons name="search-outline" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
              <TextInput
                value={breakSearch}
                onChangeText={handleBreakSearch}
                placeholder="Search surf breaks..."
                placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                autoFocus
                style={[styles.breakSheetInput, { color: isDark ? '#fff' : '#111827' }]}
              />
              {breakSearch.length > 0 && (
                <Pressable onPress={() => { setBreakSearch(''); setDebouncedSearch(''); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
                </Pressable>
              )}
            </View>

            {/* Results */}
            <ScrollView style={styles.breakSheetResults} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {searchingBreaks && <ActivityIndicator size="small" style={{ marginVertical: 16 }} />}
              {breakResults.map((brk: any) => (
                <Pressable
                  key={brk.id}
                  onPress={() => selectBreak(brk)}
                  style={[styles.breakSheetOption, { borderBottomColor: isDark ? '#1f2937' : '#f3f4f6' }]}
                >
                  <Ionicons name="location-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={[styles.breakOptionName, { color: isDark ? '#fff' : '#111827' }]}>{brk.name}</Text>
                    <Text style={[styles.breakOptionSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      {brk.region?.replaceAll('_', ' ')} · {brk.country_code}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {debouncedSearch.length >= 2 && !searchingBreaks && breakResults.length === 0 && (
                <Text style={{ color: '#9ca3af', textAlign: 'center', paddingVertical: 24, fontSize: 14 }}>No breaks found</Text>
              )}
              {debouncedSearch.length < 2 && !searchingBreaks && (
                <Text style={{ color: isDark ? '#4b5563' : '#9ca3af', textAlign: 'center', paddingVertical: 24, fontSize: 14 }}>
                  Type to search for a surf break
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Date picker overlay */}
      {showDatePicker && (
        <View style={[styles.dateOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowDatePicker(false); setTabBarVisible(true); }} />
          <View style={[styles.dateSheet, { backgroundColor: isDark ? '#1f2937' : '#fff' }]}>
            <View style={styles.dateSheetHeader}>
              <Pressable onPress={() => { setShowDatePicker(false); setTabBarVisible(true); }}>
                <Text style={{ fontSize: 16, color: '#0ea5e9', fontWeight: '600' }}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={sessionDate}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              maximumDate={new Date()}
              themeVariant={isDark ? 'dark' : 'light'}
              style={{ height: 200 }}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  createBtn: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10,
  },
  createBtnText: { fontSize: 15, fontWeight: '600' },
  scrollContent: { flex: 1, paddingHorizontal: 16 },
  fieldWrap: { marginBottom: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  textInput: {
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  selectBtn: {
    flexDirection: 'row', alignItems: 'center',
  },
  selectedBreakRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  selectedBreakName: { fontSize: 15, fontWeight: '600' },
  selectedBreakSub: { fontSize: 12, marginTop: 1 },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 100 },
  breakSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '75%', paddingBottom: 34,
  },
  sheetHandle: { alignItems: 'center', paddingVertical: 10 },
  sheetHandleBar: { width: 36, height: 4, borderRadius: 2 },
  breakSheetSearch: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  breakSheetInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  breakSheetResults: { marginTop: 8, paddingHorizontal: 8 },
  breakSheetOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  breakOptionName: { fontSize: 14, fontWeight: '600' },
  breakOptionSub: { fontSize: 12, marginTop: 1 },
  switchRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  switchDesc: { fontSize: 12, marginTop: 2 },
  photosHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  addPhotosBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 24, alignItems: 'center', gap: 6,
  },
  addPhotosText: { fontSize: 15, fontWeight: '500' },
  previewGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 12,
  },
  previewItem: {
    width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: 8, overflow: 'hidden',
  },
  previewImage: {
    width: '100%', height: '100%',
  },
  removeBtn: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 32 },
  emptyIconRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  emptyIconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
  signInBtn: { marginTop: 16, backgroundColor: '#0ea5e9', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
  signInText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  dateOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 100 },
  dateSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  dateSheetHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 14 },
});
