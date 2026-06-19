import { useState, useCallback, useRef, useEffect } from 'react';
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
import { useSelector, useDispatch } from 'react-redux';
import { setPendingUploadBreak, type PendingUploadBreak } from '../../src/store/slices/surf';
import {
  useCreateMyBoardMutation,
  useCreateMyBoardPhotosMutation,
} from '../../src/store';
import CampaignUpload from '../../src/components/CampaignUpload';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_SIZE = (SCREEN_WIDTH - 48 - 8) / 4; // 4 columns with gaps

interface SelectedFile {
  uri: string;
  name: string;
  size: number;
  type: string;
  // Real capture time from EXIF (epoch ms), or null when the photo has none.
  // Drives upload ordering — see bakeOrderedTimestamps.
  takenAt?: number | null;
  // Video only — measured from the picker asset, for the cap + backend stamp.
  durationSeconds?: number | null;
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
import { MAX_CLIP_SECONDS, MAX_CLIP_BYTES, MAX_CLIP_GB } from '../../src/helpers/clipMedia';
import { checkStorageCapacity, showStorageLimitAlert } from '../../src/helpers/storage';
import { parseExifTakenAt, bakeOrderedTimestamps } from '../../src/helpers/photoTimestamps';
const formatDateLabel = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// M:SS for the clip-preview duration badge.
const formatClipDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function CreateSessionScreen() {
  const { user } = useUser();

  // Advertisers don't upload sessions or boards — they submit ad campaigns
  // for review. The full advertiser flow is a self-contained component so
  // the existing surfer/photographer/shaper logic below stays untouched.
  // Early return BEFORE any other hooks fire so the advertiser render path
  // has its own clean hook tree.
  if ((user as any)?.user_type === 'advertiser') {
    return <CampaignUpload />;
  }

  return <SessionOrBoardCreate />;
}

function SessionOrBoardCreate() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { visible: kbVisible, height: kbHeight } = useKeyboardVisible();
  const { user } = useUser();
  const { isAuthenticated, login } = useAuth();
  const requireAuth = useRequireAuth();
  const { setTabBarVisible } = useTabBar();

  // Shapers reuse this same screen (photo picker + thumbnail grid + Create
  // button) but with board-specific metadata fields and a different submit
  // handler that hits /boards. Branch here so the rest of the component can
  // keep its session hooks running unconditionally.
  const isShaper = (user as any)?.user_type === 'shaper';

  // Form state
  const [sessionName, setSessionName] = useState('');
  const [selectedBreak, setSelectedBreak] = useState<any>(null);
  const [breakSearch, setBreakSearch] = useState('');
  const [showBreakSearch, setShowBreakSearch] = useState(false);

  // Consume a break handed off by an "upload here" affordance (e.g. the + on a
  // surf-break hero): preselect it once, then clear so it doesn't re-apply on a
  // later visit or clobber a manual change.
  const dispatch = useDispatch();
  const pendingBreak = useSelector(
    (s: any) => s.surf.pendingUploadBreak as PendingUploadBreak | null
  );
  useEffect(() => {
    if (!pendingBreak) return;
    setSelectedBreak(pendingBreak);
    dispatch(setPendingUploadBreak(null));
  }, [pendingBreak, dispatch]);
  const [sessionDate, setSessionDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hideLocation, setHideLocation] = useState(false);
  const [notifyFollowers, setNotifyFollowers] = useState(true);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Covers the gap between tapping "Add" in the native picker and thumbnails
  // appearing. expo-image-picker copies every selected asset into app cache
  // before resolving — seconds for a large session selection — and the picker
  // modal is already dismissed during that copy, leaving the screen silent.
  const [isImporting, setIsImporting] = useState(false);

  // Board form state — only used when isShaper. Featured toggle lives on the
  // profile, not here. See app/(tabs)/profile.tsx + ShaperBoardsGrid.
  const [boardName, setBoardName] = useState('');
  const [boardType, setBoardType] = useState<string | undefined>(undefined);
  const [boardDimensions, setBoardDimensions] = useState('');
  const [boardDescription, setBoardDescription] = useState('');
  const [createMyBoard] = useCreateMyBoardMutation();
  const [createMyBoardPhotos] = useCreateMyBoardPhotosMutation();

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

    // expo-image-picker exposes no "picker dismissed" event, and for sessions
    // the asset copy happens INSIDE this await (URIs already point to cached
    // files by the time it resolves). So the loader must be armed during the
    // await — the only lever is how long to wait first. We delay past the
    // native sheet's present animation (which can run ~1s on large photo
    // libraries) so the overlay never flashes on the form: by the time it
    // fires, the sheet is covering the screen, and it only becomes visible
    // once the picker dismisses and expo is copying the selection. Picking a
    // large batch takes well over this delay, so the loader is ready the
    // instant the sheet closes; quick/small selections finish first and never
    // show it. Bump this if the flash returns on a slower device.
    const loaderTimer = setTimeout(() => setIsImporting(true), 1100);
    try {
      // Boards stay photo-only (no session video gallery there); sessions accept
      // clips. Same shared picker, so gate by user type.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isShaper ? ['images'] : ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.95,
        exif: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        // Clip caps (primary gate; backend is the net). ImagePicker reports
        // video duration in ms.
        let rejected: string | null = null;
        const accepted = result.assets.filter((a) => {
          if (a.type !== 'video') return true;
          const durSec = a.duration != null ? a.duration / 1000 : null;
          const bytes = Number(a.fileSize ?? 0);
          if ((durSec != null && durSec > MAX_CLIP_SECONDS) || (bytes > 0 && bytes > MAX_CLIP_BYTES)) {
            rejected = `Videos must be ${MAX_CLIP_SECONDS}s and ${MAX_CLIP_GB}GB or less.`;
            return false;
          }
          return true;
        });
        if (rejected) Alert.alert('Clip too large', rejected);

        const newFiles: SelectedFile[] = accepted.map((asset) => {
          const isVideo = asset.type === 'video';
          return {
            uri: asset.uri,
            name: asset.fileName ?? (isVideo ? `clip_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`),
            size: asset.fileSize ?? 0,
            type: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
            takenAt: parseExifTakenAt(asset),
            durationSeconds: isVideo && asset.duration != null ? asset.duration / 1000 : null,
          };
        });

        // Dedupe by name + size
        setFiles((prev) => {
          const existing = new Set(prev.map((f) => `${f.name}_${f.size}`));
          const unique = newFiles.filter((f) => !existing.has(`${f.name}_${f.size}`));
          return [...prev, ...unique];
        });
      }
    } catch (err) {
      console.error('Failed to pick photos:', err);
      Alert.alert('Could not open photos', 'Something went wrong opening your library. Please try again.');
    } finally {
      clearTimeout(loaderTimer);
      setIsImporting(false);
    }
  }, [isShaper]);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => setFiles([]), []);

  // Validate
  const canSubmit = isShaper
    ? !!boardName.trim() && !isSubmitting
    : !!sessionName.trim() && !!selectedBreak && files.length > 0 && !isSubmitting;

  // Shaper-only board create flow. Uses the same `files` state populated by
  // the existing photo picker — board photos are public-read so we can PUT
  // straight to S3 via presigned URLs without OPFS staging.
  const handleCreateBoard = useCallback(async () => {
    if (!boardName.trim()) {
      Alert.alert('Name required', 'Please enter a board name.');
      return;
    }
    if (!requireAuth()) return;
    setIsSubmitting(true);
    try {
      const boardRes = await createMyBoard({
        name: boardName.trim(),
        board_type: boardType ?? null,
        dimensions: boardDimensions.trim() || null,
        description: boardDescription.trim() || null,
        is_featured: false,
      }).unwrap();
      const boardId = boardRes?.results?.boardId;
      if (!boardId) throw new Error('Missing boardId in response');

      if (files.length) {
        const presigned = await createMyBoardPhotos({
          boardId,
          payload: {
            files: files.map((f) => ({
              file_uuid: generateUUID(),
              file_type: f.type || 'image/jpeg',
              // Backend increments users.current_storage atomically with the
              // photo INSERT off this value — omitting it means board photos
              // created here never count toward the shaper's storage.
              file_size_bytes: Number(f.size) || 0,
            })),
          },
        }).unwrap();
        const photos = presigned?.results?.photos ?? [];
        await Promise.all(
          photos.map(async (p: any, i: number) => {
            const f = files[i];
            const blob = await (await fetch(f.uri)).blob();
            await fetch(p.url, {
              method: 'PUT',
              headers: { 'Content-Type': f.type || 'image/jpeg' },
              body: blob,
            });
          })
        );
      }

      // Reset and let the user keep browsing while followers receive the
      // newBoard notification server-side.
      setBoardName('');
      setBoardType(undefined);
      setBoardDimensions('');
      setBoardDescription('');
      setFiles([]);
      Alert.alert('Board created', `"${boardName.trim()}" is live.`);
    } catch (err: any) {
      Alert.alert('Create failed', err?.data?.message || err?.message || 'Try again');
    } finally {
      setIsSubmitting(false);
    }
  }, [boardName, boardType, boardDimensions, boardDescription, files, requireAuth, createMyBoard, createMyBoardPhotos]);

  // Submit
  const handleCreateSession = useCallback(async () => {
    // Shapers branch through the simpler board flow.
    if (isShaper) return handleCreateBoard();
    if (!canSubmit) return;
    if (!requireAuth()) return;

    // Storage check
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const storageCheck = checkStorageCapacity(user, totalBytes);
    if (!storageCheck.hasSpace) {
      showStorageLimitAlert(storageCheck, { email: (user as any)?.email });
      return;
    }
    const totalSizeGB = storageCheck.totalSizeGB;

    setIsSubmitting(true);

    try {
      // Create session — returns presigned URLs + upload file IDs in one call.
      // Bake capture-ordered timestamps so the gallery (sorted by
      // photo_taken_at, file_name, id) shows photos in the order they were shot
      // rather than alphabetically/randomly.
      const orderedTimestamps = bakeOrderedTimestamps(files);
      const filesMapped = files.map((f, idx) => ({
        uuid: generateUUID(),
        name: f.name,
        size: f.size,
        type: f.type,
        lastModified: orderedTimestamps[idx],
        source: 'device',
        // Video only; backend classifies media_type from MIME + gates duration.
        durationSeconds: f.durationSeconds ?? null,
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
      const uploadFiles = filesMapped.map((f, idx) => ({
        name: f.name,
        uri: files[idx].uri,
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
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#fff' }]} edges={['top']}>
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
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#fff' }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111827' }]}>{isShaper ? 'New Board' : 'New Session'}</Text>
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

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Board fields — shaper-only. */}
        {isShaper && (
          <>
            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151' }]}>Board Name</Text>
              <TextInput
                value={boardName}
                onChangeText={setBoardName}
                placeholder="The Salt Stick"
                placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                maxLength={120}
                style={[styles.textInput, {
                  backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
                  color: isDark ? '#fff' : '#111827',
                }]}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151' }]}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {[
                  { label: 'Shortboard', value: 'shortboard' },
                  { label: 'Longboard', value: 'longboard' },
                  { label: 'Fish', value: 'fish' },
                  { label: 'Midlength', value: 'midlength' },
                  { label: 'Gun', value: 'gun' },
                  { label: 'Foamie', value: 'foamie' },
                  { label: 'Other', value: 'other' },
                ].map((opt) => {
                  const active = boardType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setBoardType(active ? undefined : opt.value)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        borderWidth: StyleSheet.hairlineWidth,
                        backgroundColor: active ? '#0ea5e9' : (isDark ? '#1f2937' : '#f3f4f6'),
                        borderColor: active ? '#0ea5e9' : (isDark ? '#374151' : '#e5e7eb'),
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : (isDark ? '#d1d5db' : '#374151') }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151' }]}>Dimensions</Text>
              <TextInput
                value={boardDimensions}
                onChangeText={setBoardDimensions}
                placeholder='5&apos;10" x 19" x 2 1/2"'
                placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                maxLength={60}
                style={[styles.textInput, {
                  backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
                  color: isDark ? '#fff' : '#111827',
                }]}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151' }]}>Description</Text>
              <TextInput
                value={boardDescription}
                onChangeText={setBoardDescription}
                placeholder="What this board is built for…"
                placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
                maxLength={500}
                multiline
                style={[styles.textInput, {
                  height: 100,
                  paddingVertical: 10,
                  textAlignVertical: 'top',
                  backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
                  color: isDark ? '#fff' : '#111827',
                }]}
              />
            </View>
          </>
        )}

        {/* Session Name — session-only. */}
        {!isShaper && (
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
        )}

        {/* Surf Break + Date + Hide Location + Notify Followers — session-only. */}
        {!isShaper && (<>
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
        </>)}

        {/* Photos */}
        <View style={styles.fieldWrap}>
          <View style={styles.photosHeader}>
            <Text style={[styles.fieldLabel, { color: isDark ? '#d1d5db' : '#374151', marginBottom: 0 }]}>
              Media {files.length > 0 && `(${files.length})`}
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
              {isShaper ? 'Tap to select media' : 'Tap to select photos or clips'}
            </Text>
            <Text style={{ color: isDark ? '#4b5563' : '#9ca3af', fontSize: 12 }}>
              {isShaper ? 'JPG, PNG, HEIC, RAW supported' : 'Photos (JPG, PNG, HEIC, RAW) + video clips'}
            </Text>
          </Pressable>

          {/* Preview grid */}
          {files.length > 0 && (
            <View style={styles.previewGrid}>
              {files.map((file, index) => {
                const isVideo =
                  file.durationSeconds != null || (file.type ?? '').startsWith('video');
                return (
                  <View key={`${file.name}_${index}`} style={styles.previewItem}>
                    {isVideo ? (
                      // Clip indicator — a videocam glyph (not a play control; the
                      // preview isn't tappable to play) + duration. No frame
                      // extraction here (it crashed on device).
                      <View style={styles.previewVideo}>
                        <Ionicons name="videocam" size={22} color="rgba(255,255,255,0.85)" />
                        {file.durationSeconds != null && (
                          <Text style={styles.clipBadgeText}>
                            {formatClipDuration(file.durationSeconds)}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Image
                        source={{ uri: file.uri }}
                        style={styles.previewImage}
                        contentFit="cover"
                      />
                    )}
                    <Pressable onPress={() => removeFile(index)} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={20} color="#fff" />
                    </Pressable>
                  </View>
                );
              })}
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

      {/* Importing overlay — shown while the native picker copies selected
          assets into cache, before the preview grid populates. */}
      {isImporting && (
        <View style={[styles.importingOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)' }]}>
          <View style={[styles.importingCard, { backgroundColor: isDark ? '#1f2937' : '#fff' }]}>
            <ActivityIndicator size="large" color="#0ea5e9" />
            <Text style={[styles.importingText, { color: isDark ? '#fff' : '#111827' }]}>Importing media…</Text>
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
  previewVideo: {
    width: '100%', height: '100%', backgroundColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  clipBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
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
  importingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  importingCard: { paddingHorizontal: 32, paddingVertical: 28, borderRadius: 16, alignItems: 'center', gap: 14, minWidth: 180 },
  importingText: { fontSize: 15, fontWeight: '600' },
});
