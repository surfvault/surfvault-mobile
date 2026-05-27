import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Dimensions,
  useColorScheme,
  Alert,
  StyleSheet,
  Share,
  Platform,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Animated,
  PanResponder,
  RefreshControl,
  Switch,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { getOrCreateDeviceId, getDevicePlatform } from '../../src/helpers/deviceId';
import { useUser } from '../../src/context/UserProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import {
  useGetSessionQuery,
  useGetSessionPhotosQuery,
  useGetSessionGroupsQuery,
  useRequestAccessToSurfMediaMutation,
  useDownloadSurfMediaMutation,
  useDeleteSurfMediaMutation,
  useUpdateUserFavoritesMutation,
  useSaveSurfMediaMutation,
  useUpdateSessionThumbnailMutation,
  useGetUsersForSessionTaggingQuery,
  useUpdateSessionsTaggedUsersMutation,
  useCreateSessionGroupMutation,
  useUpdateSessionGroupMutation,
  useDeleteSessionGroupMutation,
  useUpdateGroupPhotosMutation,
  useUpdateSessionMutation,
  useCreateSurfSessionViewReportMutation,
  useGetAccessRequestQuery,
  useRequestAccessToUserMutation,
  useFollowUserMutation,
  useRegisterDeviceMutation,
} from '../../src/store';
import { AccessBanner, PrivateGalleryCard } from '../../src/components/PrivateGalleryGate';
import ImageViewing from 'react-native-image-viewing';
import UserAvatar from '../../src/components/UserAvatar';
import SearchBar from '../../src/components/SearchBar';
import ActionSheet from '../../src/components/ActionSheet';
import type { ActionSheetSection } from '../../src/components/ActionSheet';
import ReportSessionSheet from '../../src/components/ReportSessionSheet';
import { toOriginalKey, getDirectWatermarkUrl } from '../../src/helpers/mediaUrl';
import { savePhotoToCameraRoll, savePhotosToCameraRoll, checkMediaLibraryPermission } from '../../src/helpers/saveToPhotos';
import { useUpload } from '../../src/context/UploadContext';
import { generateUUID } from '../../src/helpers/uuid';
import { checkStorageCapacity, showStorageLimitAlert } from '../../src/helpers/storage';
import { parseExifTakenAt, bakeOrderedTimestamps } from '../../src/helpers/photoTimestamps';
import { getViewerHash } from '../../src/helpers/viewerHash';
import SessionHero from '../../src/components/SessionHero';
import SessionSkeleton from '../../src/components/SessionSkeleton';
import { useKeyboardVisible } from '../../src/hooks/useKeyboardVisible';

// Page size for the gallery. Sized generously so the densest zoom (5 columns)
// still fills well past one screen before paginating.
const FETCH_AMOUNT = 60;

// Per-target cooldown so the post-request follow/notify prompt doesn't nag on
// repeat requests to the same photographer.
const POST_REQUEST_PROMPT_COOLDOWN_DAYS = 7;
const postRequestPromptKey = (targetUserId: string) => `post_request_prompt_dismissed_at:${targetUserId}`;

// Module-level gate: one view-report per session id per app launch
const viewedSessionIds = new Set<string>();
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GAP = 4;
// Pinch-to-zoom column range: MIN = most zoomed in (biggest tiles),
// MAX = most zoomed out (smallest tiles).
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 5;
const DEFAULT_COLUMNS = 3;
const photoWidthForColumns = (cols: number) => (SCREEN_WIDTH - GAP * (cols + 1)) / cols;

const COLOR_PRESETS = [
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#64748b', '#78716c',
];

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr.split('T')[0] + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function SessionDetailScreen() {
  const { sessionId, group: groupNameFromUrl } = useLocalSearchParams<{ sessionId: string; group?: string }>();
  const { user } = useUser();
  const router = useRouter();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { visible: kbVisible, height: kbHeight } = useKeyboardVisible();
  const requireAuth = useRequireAuth();

  const [sessionMedia, setSessionMedia] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const seenMediaRef = useRef(new Set<string>());
  const shouldReplaceRef = useRef(false);
  const nextTokenRef = useRef<string>('');
  const prevInitialFingerprintRef = useRef<string | null>(null);
  const flatListRef = useRef<any>(null);

  // Pinch-to-zoom gallery density. Keeps the virtualized FlatList, so column
  // changes are committed LIVE as you pinch — items snap straight into the new
  // column layout (instant reflow: more columns = content packs up into the row
  // before; fewer = it spreads down). Clamped to [MIN, MAX] so it's a no-op once
  // you hit a limit. Changing numColumns remounts the FlatList (RN requires a
  // key change), so after each step we re-anchor scroll to the photo that was
  // under your fingers, keeping you in place.
  const [numColumns, setNumColumns] = useState(DEFAULT_COLUMNS);
  const numColumnsRef = useRef(DEFAULT_COLUMNS);
  const scrollYRef = useRef(0);
  // Header height measured at runtime so we can compute the exact pixel offset
  // of any photo row regardless of how the header expands. Declared here (not
  // lower) so the pinch gesture/scroll-restore closures can read it.
  const headerHeightRef = useRef(0);
  const photoWidth = useMemo(() => photoWidthForColumns(numColumns), [numColumns]);
  useEffect(() => { numColumnsRef.current = numColumns; }, [numColumns]);

  // Column count when the pinch began + the photo under the focal point (in the
  // start layout), so scroll can be re-anchored to it after each reflow.
  const pinchStartColsRef = useRef(DEFAULT_COLUMNS);
  const pinchAnchorRef = useRef<{ index: number; fy: number } | null>(null);

  const capturePinchAnchor = useCallback((fx: number, fy: number) => {
    const cols = numColumnsRef.current;
    pinchStartColsRef.current = cols;
    const tileW = photoWidthForColumns(cols);
    const rowHeight = tileW * 1.2 + GAP;
    const gridY = scrollYRef.current + fy - headerHeightRef.current;
    const row = Math.max(0, Math.floor((gridY - GAP / 2) / rowHeight));
    const col = Math.min(cols - 1, Math.max(0, Math.floor((fx - GAP / 2) / (tileW + GAP))));
    pinchAnchorRef.current = { index: row * cols + col, fy };
  }, []);

  const setColumnsLive = useCallback((cols: number) => {
    if (cols === numColumnsRef.current) return; // already there → no-op
    numColumnsRef.current = cols; // update now so onUpdate won't re-fire the step
    setNumColumns(cols);
  }, []);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart((e) => {
          capturePinchAnchor(e.focalX, e.focalY);
        })
        .onUpdate((e) => {
          // scale > 1 = pinch out = zoom in (fewer columns); < 1 = more columns.
          const target = Math.round(pinchStartColsRef.current / e.scale);
          setColumnsLive(Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, target)));
        }),
    [capturePinchAnchor, setColumnsLive]
  );

  // After each live column change remounts the grid, re-anchor scroll to the
  // photo that was under the pinch focal point so the gallery doesn't jump.
  useEffect(() => {
    const a = pinchAnchorRef.current;
    if (!a) return;
    const rowHeight = photoWidthForColumns(numColumns) * 1.2 + GAP;
    const newRow = Math.floor(a.index / numColumns);
    const targetScrollY = Math.max(0, headerHeightRef.current + GAP / 2 + newRow * rowHeight - a.fy);
    requestAnimationFrame(() => flatListRef.current?.scrollToOffset?.({ offset: targetScrollY, animated: false }));
  }, [numColumns]);

  // Photo viewer (lightbox) — windowed to avoid slow FlatList layout for large sessions
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerWindowStart, setViewerWindowStart] = useState(0);

  // Watermark URL — always use direct S3 URL (backend pre-generates via SQS)
  const getPhotoKey = useCallback((m: any) => {
    return m.original_s3_key || toOriginalKey(m.thumbnail) || '';
  }, []);

  // Action mode: "request" | "download" | "delete" | null
  const [sessionAction, setSessionAction] = useState<string | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isStartingUpload, setIsStartingUpload] = useState(false);

  // Tag management state
  const [tagSheetVisible, setTagSheetVisible] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  // Group management state
  const [groupSheetVisible, setGroupSheetVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#0ea5e9');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupColor, setEditGroupColor] = useState('');

  // Edit session state
  const [editSheetVisible, setEditSheetVisible] = useState(false);
  const [editSessionName, setEditSessionName] = useState('');
  const [editHideLocation, setEditHideLocation] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Swipeable modal helpers
  const tagSlide = useRef(new Animated.Value(0)).current;
  const groupSlide = useRef(new Animated.Value(0)).current;
  const editSlide = useRef(new Animated.Value(0)).current;

  const makeModalPanResponder = (slideAnim: Animated.Value, onClose: () => void) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          Animated.timing(slideAnim, { toValue: 500, duration: 200, useNativeDriver: true }).start(() => {
            onClose();
            slideAnim.setValue(0);
          });
        } else {
          Animated.spring(slideAnim, { toValue: 0, damping: 28, stiffness: 300, useNativeDriver: true }).start();
        }
      },
    });

  const tagPanResponder = useRef(makeModalPanResponder(tagSlide, () => setTagSheetVisible(false))).current;
  const groupPanResponder = useRef(makeModalPanResponder(groupSlide, () => setGroupSheetVisible(false))).current;
  const editPanResponder = useRef(makeModalPanResponder(editSlide, () => setEditSheetVisible(false))).current;

  // Mutations
  const [requestAccessToPhotos] = useRequestAccessToSurfMediaMutation();
  const [followUser] = useFollowUserMutation();
  const [registerDevice] = useRegisterDeviceMutation();
  const [downloadSurfMedia] = useDownloadSurfMediaMutation();
  const [deleteSurfMedia] = useDeleteSurfMediaMutation();
  const [favoriteSurfBreak] = useUpdateUserFavoritesMutation();
  const [saveSurfMedia] = useSaveSurfMediaMutation();
  const [updateSessionThumbnail] = useUpdateSessionThumbnailMutation();
  const [reportSessionView] = useCreateSurfSessionViewReportMutation();
  const [updateTaggedUsers] = useUpdateSessionsTaggedUsersMutation();
  const [createGroup] = useCreateSessionGroupMutation();
  const [updateGroup] = useUpdateSessionGroupMutation();
  const [deleteGroup] = useDeleteSessionGroupMutation();
  const [updateGroupPhotos] = useUpdateGroupPhotosMutation();
  const [updateSession] = useUpdateSessionMutation();
  const { startUpload, upload: activeUpload } = useUpload();

  // Thumbnail tracking
  const [thumbnailPhotoId, setThumbnailPhotoId] = useState<string | null>(null);

  // Session data
  const { data: sessionData, isLoading, refetch } = useGetSessionQuery({
    sessionId: sessionId ?? '',
    userId: user?.id,
    limit: FETCH_AMOUNT,
  });
  const [refreshing, setRefreshing] = useState(false);

  const session = sessionData?.results?.session;
  const initialMedia = sessionData?.results?.media ?? [];
  const initialToken = sessionData?.results?.continuationToken ?? '';
  const sessionHandle = session?.handle ?? session?.user_handle;
  const isOwner = !!user?.handle && user.handle === sessionHandle;
  const isFavorited = session?.surf_break_is_favorited;

  // Private-profile access gating. Same fresh-read strategy as the user page.
  const isPrivate = session?.user_access === 'private' && !isOwner;
  const { data: accessData, refetch: refetchAccess } = useGetAccessRequestQuery(
    { photographerHandle: sessionHandle ?? '' },
    {
      skip: !user || !isPrivate || !sessionHandle,
      refetchOnMountOrArgChange: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }
  );
  const accessRequest = accessData?.results?.accessRequest;

  // Poll for approve/reject decisions made from another device.
  useEffect(() => {
    if (!isPrivate) return;
    if (accessRequest?.access_status === 'approved') return;
    const id = setInterval(() => { refetchAccess(); }, 10000);
    return () => clearInterval(id);
  }, [isPrivate, accessRequest?.access_status, refetchAccess]);
  const isLocked = isPrivate && accessRequest?.access_status !== 'approved';
  const [requestAccessToUser, { isLoading: isSendingAccessRequest }] = useRequestAccessToUserMutation();
  const handleRequestAccess = useCallback(() => {
    if (!requireAuth()) return;
    if (!sessionHandle) return;
    if (accessRequest?.access_status === 'pending') return;
    requestAccessToUser({ photographerHandle: sessionHandle });
  }, [requireAuth, sessionHandle, accessRequest, requestAccessToUser]);

  // Sync thumbnail from session data
  useEffect(() => {
    if (session?.thumbnail_photo_id !== undefined) {
      setThumbnailPhotoId(session.thumbnail_photo_id ?? null);
    }
  }, [session?.thumbnail_photo_id]);

  // Record session view (debounced 3s, once per app session per session id, skip self-views)
  useEffect(() => {
    const sid = session?.id;
    if (!sid) return;
    if (isOwner) return;
    if (viewedSessionIds.has(sid)) return;

    const timer = setTimeout(async () => {
      if (viewedSessionIds.has(sid)) return;
      try {
        const viewerHash = await getViewerHash(user?.id);
        await reportSessionView({ sessionId: sid, viewerHash }).unwrap();
        viewedSessionIds.add(sid);
      } catch {
        // Silent — view tracking is best-effort
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [session?.id, user?.id, isOwner, reportSessionView]);

  // Groups
  const { data: groupsData } = useGetSessionGroupsQuery(
    { sessionId: session?.id ?? '' },
    { skip: !session?.id }
  );
  const groups = groupsData?.results?.groups ?? [];

  // Tag search query
  const { data: tagSearchData } = useGetUsersForSessionTaggingQuery(
    { sessionId: session?.id ?? '', search: tagSearch },
    { skip: !session?.id || !tagSheetVisible }
  );

  // Tagged users
  const taggedUsers = session?.tagged_users ?? [];

  // Load initial media
  // Skip replace on metadata-only refetches (e.g., favorite toggle, tag updates) and on
  // post-delete refetches where the optimistic handler has already pre-set the fingerprint.
  // Only reset pagination/scroll when the actual first-page media changed (upload, server-side change).
  useEffect(() => {
    if (!activeGroupId && initialMedia.length > 0) {
      const fingerprint = initialMedia.map((m: any) => m?.id).join(',');
      if (fingerprint === prevInitialFingerprintRef.current && seenMediaRef.current.size > 0) {
        return;
      }
      prevInitialFingerprintRef.current = fingerprint;
      seenMediaRef.current = new Set();
      const unique = initialMedia.filter((m: any) => {
        const key = m.id ?? m.thumbnail;
        if (seenMediaRef.current.has(key)) return false;
        seenMediaRef.current.add(key);
        return true;
      });
      setSessionMedia(unique);
      setContinuationToken(initialToken);
    }
  }, [sessionData, activeGroupId]);

  // Paginated photos
  const shouldFetchMore = !!session?.id && (
    (activeGroupId !== null) || (!!continuationToken)
  );

  const { data: morePhotos, isFetching: loadingMore, refetch: refetchPhotos } = useGetSessionPhotosQuery(
    {
      sessionId: session?.id ?? '',
      limit: FETCH_AMOUNT,
      continuationToken,
      groupId: activeGroupId ?? '',
      viewerId: user?.id,
    },
    { skip: !shouldFetchMore }
  );

  useEffect(() => {
    if (!morePhotos?.results) return;
    const media = morePhotos.results.media ?? [];
    if (shouldReplaceRef.current && media.length === 0) {
      // Group with no photos — show empty state
      setSessionMedia([]);
      shouldReplaceRef.current = false;
      nextTokenRef.current = '';
      return;
    }
    if (!media.length) return;
    const newMedia = media.filter((m: any) => {
      const key = m.id ?? m.thumbnail;
      if (seenMediaRef.current.has(key)) return false;
      seenMediaRef.current.add(key);
      return true;
    });
    if (newMedia.length > 0) {
      if (shouldReplaceRef.current) {
        setSessionMedia(newMedia);
        shouldReplaceRef.current = false;
      } else {
        setSessionMedia((prev) => [...prev, ...newMedia]);
      }
    }
    // Store next token in ref — only promote to state on scroll (onEndReached)
    nextTokenRef.current = morePhotos?.results?.continuationToken ?? '';
  }, [morePhotos]);

  const handleLoadMore = useCallback(() => {
    if (nextTokenRef.current && !loadingMore) {
      setContinuationToken(nextTokenRef.current);
      nextTokenRef.current = '';
    }
  }, [loadingMore]);

  // Pull-to-refresh returns the user to the top, so fully reset pagination
  // regardless of how far they had scrolled or whether a group filter is active.
  // State is rebuilt directly from the refetch result rather than relying on the
  // initial-load effect: RTK structural sharing can keep sessionData's reference
  // stable when the data is unchanged (the common refresh case), so that effect
  // would NOT re-run — which previously left the cursor stuck and scroll dead.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeGroupId === null) {
        // All view: page 1 + the next cursor live on getSession.
        const res: any = await refetch().unwrap();
        const media: any[] = res?.results?.media ?? [];
        const nextToken: string = res?.results?.continuationToken ?? '';
        seenMediaRef.current = new Set();
        const deduped = media.filter((m: any) => {
          const key = m.id ?? m.thumbnail;
          if (!key || seenMediaRef.current.has(key)) return false;
          seenMediaRef.current.add(key);
          return true;
        });
        prevInitialFingerprintRef.current = media.map((m: any) => m?.id).join(',');
        shouldReplaceRef.current = false;
        nextTokenRef.current = nextToken; // page 2 loads on the first scroll
        setSessionMedia(deduped);
        setContinuationToken(''); // keep the paginated query idle until scroll
      } else {
        // Group view: every page comes from the paginated query. Refresh header
        // metadata first (initial-load effect ignores it while a group is active).
        await refetch().unwrap().catch(() => {});
        if (continuationToken !== '') {
          // Not at page 1. Pointing args back to '' targets group page 1; the
          // paginated effect rebuilds the list because switching args always
          // resolves to that cache entry's (different) result reference.
          seenMediaRef.current = new Set();
          nextTokenRef.current = '';
          shouldReplaceRef.current = true;
          setContinuationToken('');
        } else {
          // Already at page 1: args won't change, so rebuild directly from the
          // refetch result — structural sharing can keep morePhotos' reference
          // stable, which would otherwise leave the paginated effect dormant.
          const res: any = await refetchPhotos().unwrap();
          const media: any[] = res?.results?.media ?? [];
          const nextToken: string = res?.results?.continuationToken ?? '';
          seenMediaRef.current = new Set();
          const deduped = media.filter((m: any) => {
            const key = m.id ?? m.thumbnail;
            if (!key || seenMediaRef.current.has(key)) return false;
            seenMediaRef.current.add(key);
            return true;
          });
          shouldReplaceRef.current = false;
          nextTokenRef.current = nextToken;
          setSessionMedia(deduped);
        }
      }
    } catch {}
    setRefreshing(false);
  }, [refetch, refetchPhotos, activeGroupId, continuationToken]);

  // Mirrors web ViewableSurfPhotos: trigger pagination as user swipes near
  // the end of the lightbox, and track the current photo so the gallery can
  // scroll back to it on close. Use photo id (not index) since indices can
  // shift when pagination/cache invalidation reorders sessionMedia.
  const fetchFromViewerRef = useRef(false);
  const viewerCurrentPhotoIdRef = useRef<string | null>(null);
  // Keep the latest sessionMedia in a ref so the index-change handler can
  // resolve the current photo even when its useCallback closure is stale.
  const sessionMediaRef = useRef<any[]>([]);
  useEffect(() => { sessionMediaRef.current = sessionMedia; }, [sessionMedia]);
  useEffect(() => {
    fetchFromViewerRef.current = false;
  }, [sessionMedia.length]);

  const handleViewerIndexChange = useCallback((relativeIndex: number) => {
    const all = sessionMediaRef.current;
    const photo = all[viewerWindowStart + relativeIndex];
    viewerCurrentPhotoIdRef.current = photo?.id ?? null;
    const absoluteIndex = viewerWindowStart + relativeIndex;
    if (
      absoluteIndex >= all.length - 5 &&
      !fetchFromViewerRef.current &&
      !loadingMore &&
      nextTokenRef.current
    ) {
      fetchFromViewerRef.current = true;
      setContinuationToken(nextTokenRef.current);
      nextTokenRef.current = '';
    }
  }, [viewerWindowStart, loadingMore]);

  const handleViewerClose = useCallback(() => {
    setViewerVisible(false);
    const id = viewerCurrentPhotoIdRef.current;
    if (!id || !flatListRef.current) return;
    const idx = sessionMediaRef.current.findIndex((m: any) => m.id === id);
    if (idx < 0) return;
    const cols = numColumnsRef.current;
    const rowIdx = Math.floor(idx / cols);
    const rowHeight = photoWidthForColumns(cols) * 1.2 + GAP;
    const offset = headerHeightRef.current + GAP / 2 + rowIdx * rowHeight;
    // Defer past the modal close animation so the FlatList has settled.
    setTimeout(() => {
      flatListRef.current?.scrollToOffset?.({ offset, animated: false });
    }, 50);
  }, []);

  // Group filter — don't clear sessionMedia immediately to avoid FlatList crash mid-scroll.
  // shouldReplaceRef handles atomic data swap when new group data arrives.
  const handleGroupFilter = useCallback((groupId: string | null) => {
    seenMediaRef.current = new Set();
    nextTokenRef.current = '';
    setContinuationToken('');
    if (groupId === null) {
      // "All" — restore initial media from getSession response
      const unique = initialMedia.filter((m: any) => {
        const key = m.id ?? m.thumbnail;
        if (seenMediaRef.current.has(key)) return false;
        seenMediaRef.current.add(key);
        return true;
      });
      setSessionMedia(unique);
      setContinuationToken(initialToken);
      shouldReplaceRef.current = false;
    } else {
      shouldReplaceRef.current = true;
    }
    setActiveGroupId(groupId);
    setTimeout(() => flatListRef.current?.scrollToOffset?.({ offset: 0, animated: true }), 100);
  }, [initialMedia, initialToken]);

  // Resolve ?group=name from share URL to activeGroupId once groups load
  const groupFromUrlAppliedRef = useRef(false);
  useEffect(() => {
    if (groupFromUrlAppliedRef.current) return;
    if (!groupNameFromUrl || !groups.length) return;
    const decoded = decodeURIComponent(groupNameFromUrl).toLowerCase();
    const match = groups.find((g: any) => g.name.toLowerCase() === decoded);
    if (match) {
      groupFromUrlAppliedRef.current = true;
      handleGroupFilter(match.id);
    }
  }, [groupNameFromUrl, groups, handleGroupFilter]);

  // Photo selection
  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotoIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  }, []);

  const cancelAction = useCallback(() => {
    setSessionAction(null);
    setSelectedPhotoIds([]);
  }, []);

  // Start action modes
  const handleStartAction = useCallback(async (action: string) => {
    if (!requireAuth()) return;
    if (action === 'download') {
      const granted = await checkMediaLibraryPermission();
      if (!granted) return;
    }
    setSessionAction(action);
    setSelectedPhotoIds([]);
  }, [requireAuth]);

  // After granting notification permission, immediately sync the push token so
  // the server can deliver right away (don't wait for the next foreground).
  const registerPushTokenNow = useCallback(async () => {
    if (!user?.id || !Device.isDevice) return;
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!token) return;
      const deviceId = await getOrCreateDeviceId();
      const platform = getDevicePlatform();
      await registerDevice({ deviceId, expoPushToken: token, platform }).unwrap();
    } catch {
      // best-effort; _layout re-registers on foreground
    }
  }, [user?.id, registerDevice]);

  // Ensure OS notification permission. Shows the system prompt when undetermined,
  // routes to Settings when previously denied.
  const enableNotifications = useCallback(async () => {
    if (!Device.isDevice) return;
    let status: Notifications.PermissionStatus;
    try {
      ({ status } = await Notifications.getPermissionsAsync());
    } catch {
      return;
    }
    if (status === 'granted') {
      await registerPushTokenNow();
      return;
    }
    if (status === 'undetermined') {
      try {
        const res = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
        if (res.status === 'granted') await registerPushTokenNow();
      } catch {
        // no-op
      }
      return;
    }
    // denied — can only be changed in Settings
    Alert.alert(
      'Notifications are off',
      'Turn on notifications in Settings to get alerts when your request is approved and when photographers you follow post new sessions.',
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
  }, [registerPushTokenNow]);

  // After a successful photo request, nudge the requester to follow the
  // photographer (so they hear about future sessions) and/or turn on
  // notifications (so they hear when this request is approved). Chained:
  // a non-follower who taps Follow is then asked for notification permission.
  //
  // This is a pure post-success nicety. The whole body is wrapped so it can
  // NEVER throw or reject — the photo request has already completed and been
  // confirmed before this runs, so the worst case here is "no prompt shown".
  const promptAfterRequest = useCallback(async () => {
    try {
      const targetUserId: string | undefined = session?.user_id;
      if (!targetUserId) return;

      const alreadyFollowing = !!session?.is_following;

      let notifGranted = true;
      if (Device.isDevice) {
        try {
          const { status } = await Notifications.getPermissionsAsync();
          notifGranted = status === 'granted';
        } catch {
          notifGranted = true;
        }
      }

      // Nothing actionable to offer
      if (alreadyFollowing && notifGranted) return;

      // Respect per-target dismissal cooldown
      try {
        const dismissedAt = await SecureStore.getItemAsync(postRequestPromptKey(targetUserId));
        if (dismissedAt) {
          const msSince = Date.now() - parseInt(dismissedAt, 10);
          if (msSince < POST_REQUEST_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return;
        }
      } catch {
        // ignore; prompting is best-effort
      }

      const recordDismissal = () => {
        SecureStore.setItemAsync(postRequestPromptKey(targetUserId), String(Date.now())).catch(() => {});
      };

      if (!alreadyFollowing) {
        Alert.alert(
          `Follow @${sessionHandle}?`,
          'Get notified when they approve your request and when they post new sessions.',
          [
            { text: 'Not Now', style: 'cancel', onPress: recordDismissal },
            {
              text: 'Follow',
              onPress: async () => {
                try {
                  await followUser({ userId: targetUserId, action: 'follow' }).unwrap();
                  if (!notifGranted) await enableNotifications();
                } catch {
                  // follow / notify are best-effort
                }
              },
            },
          ],
        );
        return;
      }

      // Already following but notifications are off
      Alert.alert(
        'Turn on notifications?',
        `Get notified when @${sessionHandle} approves your request and posts new sessions.`,
        [
          { text: 'Not Now', style: 'cancel', onPress: recordDismissal },
          { text: 'Enable', onPress: () => { enableNotifications().catch(() => {}); } },
        ],
      );
    } catch {
      // Never let a post-success nudge surface as an error.
    }
  }, [session?.user_id, session?.is_following, sessionHandle, followUser, enableNotifications]);

  // Confirm action
  const handleConfirmAction = useCallback(async () => {
    if (!selectedPhotoIds.length || !session?.id || isProcessingAction) return;

    // Delete goes through an Alert confirmation — only set loading once user confirms
    if (sessionAction === 'delete') {
      const count = selectedPhotoIds.length;
      Alert.alert(
        'Delete Photos',
        `${count} photo${count !== 1 ? 's' : ''} will be permanently deleted from all storage. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setIsProcessingAction(true);
              const deletedIds = [...selectedPhotoIds];
              const deletedSet = new Set(deletedIds);

              // Snapshot the paginated state so we can roll back cleanly if the
              // server rejects. sessionMediaRef mirrors the current list.
              const prevMedia = sessionMediaRef.current;
              const prevSeen = new Set(seenMediaRef.current);
              const prevFingerprint = prevInitialFingerprintRef.current;

              // Proactive: remove the photos from the UI immediately, before the
              // network call. Preserves scroll position and pages 2+. Pre-set
              // the initial-load fingerprint to match what getSession returns
              // after the SurfBreak tag invalidation refetch so the initial-load
              // effect skips its replace step (no scroll reset).
              deletedIds.forEach((id) => seenMediaRef.current.delete(id));
              setSessionMedia((prev) => {
                const next = prev.filter((m) => !deletedSet.has(m.id));
                prevInitialFingerprintRef.current = next.slice(0, FETCH_AMOUNT).map((m: any) => m?.id).join(',');
                return next;
              });
              cancelAction();

              try {
                await deleteSurfMedia({ sessionId: session.id, photos: deletedIds as any }).unwrap();
              } catch {
                // Revert to the pre-delete snapshot so the UI never lies about
                // what's actually persisted.
                seenMediaRef.current = prevSeen;
                prevInitialFingerprintRef.current = prevFingerprint;
                setSessionMedia(prevMedia);
                Alert.alert('Error', 'Failed to delete photos. They have been restored.');
              } finally {
                setIsProcessingAction(false);
              }
            },
          },
        ],
      );
      return;
    }

    setIsProcessingAction(true);
    try {
      switch (sessionAction) {
        case 'request':
          await requestAccessToPhotos({
            handle: sessionHandle!,
            photos: selectedPhotoIds,
            sessionId: session.id,
            surfBreakId: session.surf_break_id,
          }).unwrap();
          // Request is committed at this point. The follow/notify nudge is
          // fully decoupled — it only runs when the user taps OK, and it can
          // never throw, so a bug in it cannot affect the request.
          Alert.alert(
            'Request Sent',
            `Photo request sent to @${sessionHandle}. (${selectedPhotoIds.length} photo${selectedPhotoIds.length > 1 ? 's' : ''})`,
            [{ text: 'OK', onPress: () => { void promptAfterRequest().catch(() => {}); } }],
          );
          break;
        case 'download': {
          const total = selectedPhotoIds.length;
          const result = await savePhotosToCameraRoll(selectedPhotoIds);
          if (result.saved === total) {
            Alert.alert('Saved', `${result.saved} photo${result.saved > 1 ? 's' : ''} saved to your camera roll.`);
          } else if (result.saved > 0) {
            Alert.alert('Partially Saved', `${result.saved}/${total} photos saved. ${result.failed} failed.`);
          } else {
            Alert.alert('Error', result.errors[0] ?? 'Failed to save photos.');
          }
          break;
        }
      }
      cancelAction();
    } catch {
      Alert.alert('Error', 'Action failed. Please try again.');
    } finally {
      setIsProcessingAction(false);
    }
  }, [sessionAction, selectedPhotoIds, session, sessionHandle, requestAccessToPhotos, downloadSurfMedia, deleteSurfMedia, cancelAction, isProcessingAction, promptAfterRequest]);

  // Group photo assignment
  const handleGroupPhotoAction = useCallback(async (groupId: string) => {
    if (!selectedPhotoIds.length || !session?.id) return;
    const action = sessionAction === 'group' ? 'add' : 'remove';
    try {
      await updateGroupPhotos({ sessionId: session.id, groupId, photoIds: selectedPhotoIds, action }).unwrap();
      const group = groups.find((g: any) => g.id === groupId);
      if (action === 'add' && group) {
        setSessionMedia((prev) => prev.map((m) => {
          if (!selectedPhotoIds.includes(m.id)) return m;
          const existing = m.groups ?? [];
          if (existing.some((g: any) => g.id === groupId)) return m;
          return { ...m, groups: [...existing, { id: group.id, name: group.name, color: group.color }] };
        }));
      } else {
        setSessionMedia((prev) => prev.map((m) => {
          if (!selectedPhotoIds.includes(m.id)) return m;
          return { ...m, groups: (m.groups ?? []).filter((g: any) => g.id !== groupId) };
        }));
      }
      Alert.alert('Done', `${action === 'add' ? 'Added' : 'Removed'} ${selectedPhotoIds.length} photo${selectedPhotoIds.length !== 1 ? 's' : ''} ${action === 'add' ? 'to' : 'from'} group.`);
      cancelAction();
    } catch {
      Alert.alert('Error', 'Failed to update group photos.');
    }
  }, [sessionAction, selectedPhotoIds, session?.id, groups, updateGroupPhotos, cancelAction]);

  // Share
  const handleShare = useCallback(async () => {
    if (!session?.id) return;
    const activeGroup = groups.find((g: any) => g.id === activeGroupId);
    const query = activeGroup ? `?group=${encodeURIComponent(activeGroup.name)}` : '';
    const shareUrl = `https://share.surf-vault.com/s/${session.id}${query}`;
    await Share.share(
      Platform.OS === 'ios'
        ? { url: shareUrl }
        : { message: shareUrl }
    );
  }, [session, activeGroupId, groups]);

  // Favorite
  const handleFavorite = useCallback(async () => {
    if (!requireAuth()) return;
    if (!session?.surf_break_id) return;
    const action = isFavorited ? 'unfavorite' : 'favorite';
    await favoriteSurfBreak({ surfBreakId: session.surf_break_id, action });
  }, [requireAuth, session, isFavorited, favoriteSurfBreak]);

  // Upload photos to existing session
  const handleUploadPhotos = useCallback(async () => {
    if (!session?.id || activeUpload?.isUploading || isStartingUpload) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.95,
      exif: true,
    });

    if (result.canceled || result.assets.length === 0) return;

    // Storage check
    const totalBytes = result.assets.reduce((sum, a) => sum + (a.fileSize ?? 0), 0);
    const storageCheck = checkStorageCapacity(user, totalBytes);
    if (!storageCheck.hasSpace) {
      showStorageLimitAlert(storageCheck, { email: (user as any)?.email });
      return;
    }

    setIsStartingUpload(true);
    try {
      const picked = result.assets.map((asset) => ({
        uuid: generateUUID(),
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        size: asset.fileSize ?? 0,
        type: asset.mimeType ?? 'image/jpeg',
        takenAt: parseExifTakenAt(asset),
      }));
      // Bake capture-ordered timestamps so the gallery (sorted by
      // photo_taken_at, file_name, id) shows photos in shot order.
      const orderedTimestamps = bakeOrderedTimestamps(picked);
      const filesMapped = picked.map((f, idx) => ({
        ...f,
        lastModified: orderedTimestamps[idx],
      }));

      const totalSizeInGB = storageCheck.totalSizeGB;

      const uploadResult = await saveSurfMedia({
        sessionId: session.id,
        mediaFiles: filesMapped.map((f) => ({ uuid: f.uuid, name: f.name, size: f.size, type: f.type, lastModified: f.lastModified, source: 'device' })),
        totalSizeInGB,
      }).unwrap();

      const presignedUrlMap = uploadResult?.results?.presignedUrlMap;
      const uploadFileIdMap = uploadResult?.results?.uploadFileIdMap;
      const uploadSession = uploadResult?.results?.uploadSession;
      const uploadId = uploadResult?.results?.uploadId ?? uploadSession?.split('#').pop();

      if (!presignedUrlMap || !uploadId) {
        throw new Error('Failed to get upload URLs');
      }

      const uploadFiles = filesMapped.map((f) => ({
        name: f.name,
        uri: f.uri,
        type: f.type,
        uploadFileId: uploadFileIdMap?.[f.uuid] ?? '',
        presignedUrl: presignedUrlMap[f.uuid] ?? '',
      })).filter((f) => f.presignedUrl && f.uploadFileId);

      startUpload({
        uploadId,
        sessionName: session.session_name ?? 'Session',
        files: uploadFiles,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', error?.data?.message ?? 'Please try again.');
    } finally {
      setIsStartingUpload(false);
    }
  }, [session?.id, session?.session_name, activeUpload?.isUploading, isStartingUpload, saveSurfMedia, startUpload, user]);

  // Ellipsis menu
  const handleEllipsisMenu = useCallback(() => setSheetVisible(true), []);

  // Edit session
  const hideLocationLocked = Boolean(session?.source_access_request_id) && session?.hide_location === true;

  const openEditSession = useCallback(() => {
    setEditSessionName(session?.session_name ?? '');
    setEditHideLocation(Boolean(session?.hide_location));
    setEditSheetVisible(true);
  }, [session?.session_name, session?.hide_location]);

  const handleSaveEdit = useCallback(async () => {
    if (!session?.id) return;
    const trimmed = editSessionName.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a session name.');
      return;
    }
    setSavingEdit(true);
    try {
      await updateSession({
        sessionId: session.id,
        sessionName: trimmed,
        hideLocation: hideLocationLocked ? true : editHideLocation,
      }).unwrap();
      setEditSheetVisible(false);
      try { await refetch(); } catch {}
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message ?? 'Failed to update session.');
    } finally {
      setSavingEdit(false);
    }
  }, [session?.id, editSessionName, editHideLocation, hideLocationLocked, updateSession]);

  const ellipsisSections: ActionSheetSection[] = [
    {
      options: [
        {
          label: 'Share Session',
          icon: 'share-outline',
          onPress: handleShare,
        },
        ...(isOwner ? [{ label: 'Edit Session', icon: 'create-outline' as const, onPress: openEditSession }] : []),
      ],
    },
    {
      options: [
        ...((session?.hide_location && !isOwner) ? [] : [{
          label: isFavorited ? 'Unfavorite Break' : 'Favorite Break',
          icon: isFavorited ? ('heart-dislike-outline' as const) : ('heart-outline' as const),
          onPress: handleFavorite,
        }]),
        ...((session?.surf_break_identifier && (!session?.hide_location || isOwner)) ? [{
          label: 'View Break' as const,
          icon: 'location-outline' as const,
          onPress: () => {
            const country = session.country_code ?? session.surf_break_country ?? '';
            const reg = (session.region ?? session.surf_break_region) && (session.region ?? session.surf_break_region) !== '0'
              ? (session.region ?? session.surf_break_region) : '0';
            trackedPush(`/break/${country}/${reg}/${session.surf_break_identifier}` as any);
          },
        }] : []),
      ],
    },
    ...(isOwner && groups.length > 0 ? [{
      options: [
        { label: 'Manage Groups', icon: 'color-palette-outline' as const, onPress: () => setGroupSheetVisible(true) },
        { label: 'Assign to Group', icon: 'add-circle-outline' as const, onPress: () => handleStartAction('group') },
        { label: 'Remove from Group', icon: 'remove-circle-outline' as const, onPress: () => handleStartAction('ungroup') },
      ],
    }] : isOwner ? [{
      options: [
        { label: 'Create Group', icon: 'color-palette-outline' as const, onPress: () => setGroupSheetVisible(true) },
      ],
    }] : []),
    ...(isOwner ? [{
      options: [
        { label: 'Upload Photos', icon: 'cloud-upload-outline' as const, onPress: handleUploadPhotos },
        { label: 'Save Photos', icon: 'download-outline' as const, onPress: () => handleStartAction('download') },
        { label: 'Delete Photos', icon: 'trash-outline' as const, destructive: true, onPress: () => handleStartAction('delete') },
      ],
    }] : []),
    ...(!isOwner ? [{
      options: [
        {
          label: 'Report',
          icon: 'flag-outline' as const,
          destructive: true,
          onPress: () => {
            // Auth required — prompts Auth0 login if guest.
            // Accountability matters for moderation reports.
            if (!requireAuth()) return;
            setReportSheetVisible(true);
          },
        },
      ],
    }] : []),
  ];

  // Action bar color config
  const actionColors = {
    request: { bg: 'rgba(240, 253, 244, 0.97)', bgDark: 'rgba(5, 46, 22, 0.95)', border: '#bbf7d0', borderDark: '#166534', text: '#166534', textDark: '#86efac', btn: '#22c55e' },
    download: { bg: 'rgba(239, 246, 255, 0.97)', bgDark: 'rgba(23, 37, 84, 0.95)', border: '#bfdbfe', borderDark: '#1e3a5f', text: '#1e40af', textDark: '#93c5fd', btn: '#3b82f6' },
    delete: { bg: 'rgba(254, 242, 242, 0.97)', bgDark: 'rgba(69, 10, 10, 0.95)', border: '#fecaca', borderDark: '#7f1d1d', text: '#991b1b', textDark: '#fca5a5', btn: '#ef4444' },
    group: { bg: 'rgba(245, 243, 255, 0.97)', bgDark: 'rgba(46, 16, 101, 0.95)', border: '#ddd6fe', borderDark: '#581c87', text: '#6b21a8', textDark: '#c4b5fd', btn: '#8b5cf6' },
    ungroup: { bg: 'rgba(245, 243, 255, 0.97)', bgDark: 'rgba(46, 16, 101, 0.95)', border: '#ddd6fe', borderDark: '#581c87', text: '#6b21a8', textDark: '#c4b5fd', btn: '#8b5cf6' },
  };
  const ac = actionColors[sessionAction as keyof typeof actionColors] ?? actionColors.request;

  // Set thumbnail via long-press
  const handleSetThumbnail = useCallback((photoId: string) => {
    if (!session?.id) return;
    if (photoId === thumbnailPhotoId) return;
    setThumbnailPhotoId(photoId);
    updateSessionThumbnail({ sessionId: session.id, photoId });
  }, [session?.id, thumbnailPhotoId, updateSessionThumbnail]);

  // Photo long-press action sheet
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [photoSheetItem, setPhotoSheetItem] = useState<any>(null);

  const handlePhotoLongPress = useCallback((item: any) => {
    if (!isOwner || !!sessionAction) return;
    setPhotoSheetItem(item);
    setPhotoSheetVisible(true);
  }, [isOwner, sessionAction]);

  const photoSheetSections: ActionSheetSection[] = photoSheetItem ? [
    {
      options: [
        ...(photoSheetItem.id !== thumbnailPhotoId ? [{
          label: 'Set as Thumbnail' as const,
          icon: 'image-outline' as const,
          onPress: () => handleSetThumbnail(photoSheetItem.id),
        }] : [{
          label: 'Current Thumbnail' as const,
          icon: 'checkmark-circle-outline' as const,
          onPress: () => {},
        }]),
        ...(groups.length > 0 ? groups.map((g: any) => {
          const photoGroups = photoSheetItem.groups ?? [];
          const isInGroup = photoGroups.some((pg: any) => pg.id === g.id);
          return {
            label: isInGroup ? `Remove from ${g.name}` as const : `Add to ${g.name}` as const,
            icon: (isInGroup ? 'remove-circle-outline' : 'add-circle-outline') as const,
            destructive: isInGroup,
            onPress: () => {
              const action = isInGroup ? 'remove' : 'add';
              updateGroupPhotos({ sessionId: session!.id, groupId: g.id, photoIds: [photoSheetItem.id], action }).unwrap()
                .then(() => {
                  setSessionMedia((prev) => prev.map((m) => {
                    if (m.id !== photoSheetItem.id) return m;
                    const existing = m.groups ?? [];
                    if (action === 'add') {
                      if (existing.some((eg: any) => eg.id === g.id)) return m;
                      return { ...m, groups: [...existing, { id: g.id, name: g.name, color: g.color }] };
                    }
                    return { ...m, groups: existing.filter((eg: any) => eg.id !== g.id) };
                  }));
                });
            },
          };
        }) : [{
          label: 'Create Group' as const,
          icon: 'color-palette-outline' as const,
          onPress: () => setGroupSheetVisible(true),
        }]),
      ],
    },
  ] : [];

  // Location display
  const showLocation = !session?.hide_location && session?.surf_break_name;

  const renderPhoto = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      const photoGroups: any[] = item.groups ?? [];
      const isSelected = selectedPhotoIds.includes(item.id);
      const inActionMode = !!sessionAction;
      const isThumbnail = isOwner && item.id === thumbnailPhotoId;

      return (
        <Pressable
          onPress={async () => {
            if (inActionMode) {
              togglePhotoSelection(item.id);
            } else {
              const WINDOW = 20;
              const start = Math.max(0, index - WINDOW);
              setViewerWindowStart(start);
              setViewerIndex(index - start);
              viewerCurrentPhotoIdRef.current = item?.id ?? null;
              setViewerVisible(true);
            }
          }}
          onLongPress={() => handlePhotoLongPress(item)}
          style={{ width: photoWidth, margin: GAP / 2 }}
        >
          <View style={{ position: 'relative' }}>
            <View style={[styles.photoPlaceholder, { width: photoWidth, height: photoWidth * 1.2, backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
              <Ionicons name="image-outline" size={28} color={isDark ? '#374151' : '#d1d5db'} />
            </View>
            <Image
              source={{ uri: item.thumbnail ?? item.url }}
              style={[
                { width: photoWidth, height: photoWidth * 1.2, borderRadius: 6, position: 'absolute', top: 0, left: 0 },
                inActionMode && isSelected && { borderWidth: 3, borderColor: ac.btn },
              ]}
              contentFit="cover"
              transition={200}
              recyclingKey={item.id}
            />
            {inActionMode && (
              <View style={[styles.checkbox, isSelected && { backgroundColor: ac.btn, borderColor: ac.btn }]}>
                {isSelected && <Ionicons name="checkmark" size={12} color="#ffffff" />}
              </View>
            )}
            {!inActionMode && isThumbnail && (
              <View style={styles.thumbnailBadge}>
                <Ionicons name="image-outline" size={12} color="#ffffff" />
              </View>
            )}
            {photoGroups.length > 0 && (
              <View style={styles.groupDots}>
                {photoGroups.map((g: any) => (
                  <View key={g.id} style={[styles.groupDot, { backgroundColor: g.color }]} />
                ))}
              </View>
            )}
          </View>
        </Pressable>
      );
    },
    [sessionAction, selectedPhotoIds, togglePhotoSelection, ac.btn, isOwner, thumbnailPhotoId, handlePhotoLongPress, getPhotoKey, isDark, photoWidth]
  );

  // The break name renders as its own tappable link with a pin glyph, so the
  // gray subtitle below the username only carries the date.
  const sessionDateLabel = session?.session_date ? formatDate(session.session_date) : '';
  const breakIsTappable = Boolean(showLocation && session?.surf_break_identifier);

  // Hero background: the session's chosen thumbnail photo, else the first
  // loaded photo. Locked/private sessions have no photos → null → hero falls
  // back to an ocean color.
  const heroImageUri = useMemo(() => {
    if (isLocked) return null;
    const heroPhoto =
      (thumbnailPhotoId && sessionMedia.find((m: any) => m.id === thumbnailPhotoId)) ||
      sessionMedia[0];
    return heroPhoto?.url ?? heroPhoto?.thumbnail ?? null;
  }, [isLocked, thumbnailPhotoId, sessionMedia]);

  const goToPhotographer = useCallback(() => {
    if (sessionHandle) trackedPush(`/user/${sessionHandle}`);
  }, [sessionHandle, trackedPush]);
  const openTagSheet = useCallback(() => setTagSheetVisible(true), []);
  const handleBreakPress = useCallback(() => {
    if (!breakIsTappable) return;
    const country = session.country_code ?? session.surf_break_country ?? '';
    const reg = (session.region ?? session.surf_break_region) && (session.region ?? session.surf_break_region) !== '0'
      ? (session.region ?? session.surf_break_region) : '0';
    trackedPush(`/break/${country}/${reg}/${session.surf_break_identifier}` as any);
  }, [breakIsTappable, session, trackedPush]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={[]}>
        {isLoading ? (
          <SessionSkeleton />
        ) : (
          <GestureDetector gesture={pinchGesture}>
          {/* Stable wrapper (gesture target): the FlatList remounts on column
              change (key) but this View doesn't, so the pinch isn't interrupted. */}
          <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={isLocked ? [] : sessionMedia}
            keyExtractor={(item) => item.id ?? item.thumbnail}
            renderItem={renderPhoto}
            numColumns={isLocked ? 1 : numColumns}
            key={isLocked ? 'locked' : `grid-${numColumns}`}
            onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: sessionAction ? (sessionAction === 'group' || sessionAction === 'ungroup' ? 150 : 80) : 0 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={isDark ? '#fff' : '#000'}
                colors={[isDark ? '#ffffff' : '#000000']}
                progressViewOffset={insets.top}
              />
            }
            ListHeaderComponent={
              <View
                onLayout={(e) => { headerHeightRef.current = e.nativeEvent.layout.height; }}
              >
                {session && (
                  <SessionHero
                    imageUri={heroImageUri}
                    sessionName={session.session_name ?? 'Session'}
                    userPicture={session.user_picture}
                    userName={session.user_name}
                    userHandle={sessionHandle}
                    userType={session.user_type}
                    userVerified={session.user_verified}
                    surfBreakName={showLocation ? session.surf_break_name : null}
                    breakIsTappable={breakIsTappable}
                    onBreakPress={handleBreakPress}
                    dateLabel={sessionDateLabel}
                    onAvatarPress={goToPhotographer}
                    taggedUsers={taggedUsers}
                    isOwner={isOwner}
                    onTagPress={openTagSheet}
                    isDark={isDark}
                    topInset={insets.top}
                  />
                )}

                <View style={styles.belowHero}>
                {/* Group filter chips — horizontally scrollable */}
                {(groups.length > 0 || isOwner) && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.groupChipsScroll}
                  >
                    {groups.length > 0 && (
                      <Pressable
                        onPress={() => handleGroupFilter(null)}
                        style={[styles.chip, {
                          backgroundColor: !activeGroupId ? (isDark ? '#ffffff' : '#111827') : (isDark ? '#1f2937' : '#f3f4f6'),
                        }]}
                      >
                        <Text style={[styles.chipText, {
                          color: !activeGroupId ? (isDark ? '#111827' : '#ffffff') : (isDark ? '#d1d5db' : '#374151'),
                        }]}>All</Text>
                      </Pressable>
                    )}
                    {groups.map((group: any) => (
                      <Pressable
                        key={group.id}
                        onPress={() => handleGroupFilter(group.id)}
                        style={[styles.chip, {
                          backgroundColor: activeGroupId === group.id ? group.color : isDark ? '#1f2937' : '#f3f4f6',
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                        }]}
                      >
                        {activeGroupId !== group.id && (
                          <View style={[styles.chipDot, { backgroundColor: group.color }]} />
                        )}
                        <Text style={[styles.chipText, {
                          color: activeGroupId === group.id ? '#ffffff' : isDark ? '#d1d5db' : '#374151',
                        }]}>{group.name}</Text>
                      </Pressable>
                    ))}
                    {isOwner && (
                      <Pressable
                        onPress={() => setGroupSheetVisible(true)}
                        style={[styles.chip, {
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          // Dark: dashed see-through outline (reads well there).
                          // Light: a violet-tinted action chip — ties to the
                          // group-mode accent and stands apart from the gray
                          // filter pills instead of blending in.
                          backgroundColor: isDark ? 'transparent' : '#f5f3ff',
                          borderWidth: 1,
                          borderStyle: isDark ? 'dashed' : 'solid',
                          borderColor: isDark ? '#4b5563' : '#ddd6fe',
                        }]}
                      >
                        <Ionicons
                          name="add"
                          size={14}
                          color={isDark ? '#d1d5db' : '#7c3aed'}
                        />
                        <Text style={[styles.chipText, {
                          color: isDark ? '#d1d5db' : '#7c3aed',
                        }]}>{groups.length === 0 ? 'Create Group' : 'New'}</Text>
                      </Pressable>
                    )}
                  </ScrollView>
                )}

                <View style={styles.accessBannerWrap}>
                  <AccessBanner isPrivate={isPrivate} accessRequest={accessRequest} scope="session" />
                </View>
                </View>
              </View>
            }
            ListEmptyComponent={
              isLocked ? (
                <PrivateGalleryCard
                  scope="session"
                  accessRequest={accessRequest}
                  onRequestAccess={handleRequestAccess}
                  isSending={isSendingAccessRequest}
                />
              ) : !isLoading && !loadingMore ? (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Ionicons name="images-outline" size={32} color="#9ca3af" style={{ marginBottom: 8 }} />
                  <Text style={{ color: '#9ca3af', fontSize: 15 }}>
                    {activeGroupId ? 'No photos in this group' : 'No photos'}
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              loadingMore ? <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View> : null
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
          </View>
          </GestureDetector>
        )}

        {/* Floating controls — pinned over the hero */}
        <View pointerEvents="box-none" style={[styles.controls, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={smartBack} hitSlop={8} style={styles.ctrlBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Pressable onPress={handleEllipsisMenu} hitSlop={8} style={styles.ctrlBtn}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Floating "Request Photos" — non-owners, no active action, not gated */}
        {!isOwner && session && !sessionAction && !isLocked && (
          <Pressable onPress={() => handleStartAction('request')} style={[styles.requestFab, { bottom: insets.bottom + 16 }]}>
            <Ionicons name="camera-outline" size={18} color="#ffffff" />
            <Text style={styles.requestFabText}>Request Photos</Text>
          </Pressable>
        )}

        {/* Bottom action bar */}
        {sessionAction && (
          (sessionAction === 'group' || sessionAction === 'ungroup') ? (
            <View style={[styles.actionBarTall, {
              backgroundColor: isDark ? ac.bgDark : ac.bg,
              borderTopColor: isDark ? ac.borderDark : ac.border,
              paddingBottom: insets.bottom + 14,
            }]}>
              <View style={styles.actionBarTopRow}>
                <Pressable onPress={cancelAction} hitSlop={8}>
                  <Ionicons name="close" size={24} color={isDark ? ac.textDark : ac.text} />
                </Pressable>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.actionBarCount, { color: isDark ? ac.textDark : ac.text }]}>
                    {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected
                  </Text>
                  <Text style={[styles.actionBarHint, { color: isDark ? ac.textDark : ac.text }]}>
                    {selectedPhotoIds.length === 0
                      ? 'Select photos, then tap a group below'
                      : `Tap a group to ${sessionAction === 'group' ? 'assign' : 'remove'}`}
                  </Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.groupPillScroll}
              >
                {groups.map((g: any) => (
                  <Pressable
                    key={g.id}
                    onPress={() => handleGroupPhotoAction(g.id)}
                    disabled={selectedPhotoIds.length === 0}
                    style={[styles.groupPillLg, {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff',
                      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)',
                      opacity: selectedPhotoIds.length === 0 ? 0.4 : 1,
                    }]}
                  >
                    <View style={[styles.groupPillDotLg, { backgroundColor: g.color }]} />
                    <Text style={[styles.groupPillTextLg, { color: isDark ? '#f3f4f6' : '#111827' }]}>
                      {g.name}
                    </Text>
                  </Pressable>
                ))}
                {sessionAction === 'group' && (
                  <Pressable
                    onPress={() => setGroupSheetVisible(true)}
                    style={[styles.groupPillLg, {
                      backgroundColor: 'transparent',
                      borderColor: isDark ? ac.textDark : ac.text,
                      borderStyle: 'dashed',
                    }]}
                  >
                    <Ionicons name="add" size={14} color={isDark ? ac.textDark : ac.text} />
                    <Text style={[styles.groupPillTextLg, { color: isDark ? ac.textDark : ac.text }]}>
                      New
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.actionBar, {
              backgroundColor: isDark ? ac.bgDark : ac.bg,
              borderTopColor: isDark ? ac.borderDark : ac.border,
              paddingBottom: insets.bottom + 14,
            }]}>
              <Pressable onPress={cancelAction} hitSlop={8}>
                <Ionicons name="close" size={24} color={isDark ? ac.textDark : ac.text} />
              </Pressable>
              <Text style={[styles.actionBarCount, { color: isDark ? ac.textDark : ac.text }]}>
                {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected
              </Text>
              <Pressable
                onPress={handleConfirmAction}
                disabled={selectedPhotoIds.length === 0 || isProcessingAction}
                style={[styles.confirmBtn, {
                  backgroundColor: selectedPhotoIds.length > 0 && !isProcessingAction ? ac.btn : (isDark ? '#374151' : '#d1d5db'),
                  opacity: isProcessingAction ? 0.7 : 1,
                }]}
              >
                {isProcessingAction ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.confirmBtnText, {
                    color: selectedPhotoIds.length > 0 ? '#ffffff' : '#9ca3af',
                  }]}>Confirm</Text>
                )}
              </Pressable>
            </View>
          )
        )}
      </SafeAreaView>

      <ActionSheet
        visible={sheetVisible}
        sections={ellipsisSections}
        onClose={() => setSheetVisible(false)}
      />

      <ReportSessionSheet
        visible={reportSheetVisible}
        sessionId={session?.id}
        ownerUserId={session?.user_id}
        ownerHandle={session?.handle ?? session?.user_handle}
        onClose={() => setReportSheetVisible(false)}
      />

      {/* Photo long-press action sheet */}
      <ActionSheet
        visible={photoSheetVisible}
        sections={photoSheetSections}
        onClose={() => { setPhotoSheetVisible(false); setPhotoSheetItem(null); }}
        header={photoSheetItem ? {
          title: photoSheetItem.file_name ?? 'Photo Options',
          imageUri: photoSheetItem.thumbnail ?? photoSheetItem.url,
        } : undefined}
      />

      {/* Tag Management Modal */}
      <Modal visible={tagSheetVisible} transparent animationType="slide" onRequestClose={() => setTagSheetVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setTagSheetVisible(false)}>
          <Animated.View style={[styles.modalCard, { backgroundColor: isDark ? '#111827' : '#ffffff', transform: [{ translateY: tagSlide }] }, kbVisible && { paddingBottom: kbHeight }]}>
            <View {...tagPanResponder.panHandlers}>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View style={[styles.modalHandle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
              </Pressable>
            </View>
            <Text style={[styles.modalTitle, { color: isDark ? '#ffffff' : '#111827' }]}>{isOwner ? 'Tag Users' : 'Tagged Users'}</Text>
            <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
              <SearchBar onSearch={setTagSearch} placeholder={isOwner ? 'Search users to tag...' : 'Search...'} />
            </View>
            <ScrollView style={{ maxHeight: kbVisible ? 200 : 350 }} keyboardShouldPersistTaps="handled">
              {(() => {
                const searchResults = (tagSearchData?.results?.availableUsers ?? []).filter((u: any) => !taggedUsers.some((tu: any) => tu.id === u.id));
                const isSearching = tagSearch.length > 0;
                // Non-owners see a read-only roster: search filters the
                // already-tagged list, taps navigate to the user's profile.
                const filteredTagged = isSearching
                  ? taggedUsers.filter((tu: any) => {
                      const q = tagSearch.toLowerCase();
                      return (tu.handle ?? '').toLowerCase().includes(q) || (tu.name ?? '').toLowerCase().includes(q);
                    })
                  : taggedUsers;

                const goToProfile = (handle?: string) => {
                  if (!handle) return;
                  setTagSheetVisible(false);
                  trackedPush(`/user/${handle}` as any);
                };

                // Show search results when searching (owner only — non-owner
                // searches within the already-tagged list below).
                if (isSearching && isOwner) {
                  if (searchResults.length === 0) {
                    return (
                      <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', textAlign: 'center', paddingVertical: 24, fontSize: 14 }}>
                        No users found matching "{tagSearch}"
                      </Text>
                    );
                  }
                  return searchResults.map((u: any) => (
                    <View key={u.id ?? u.handle} style={styles.tagResultRow}>
                      <UserAvatar uri={u.picture} name={u.name ?? u.handle} size={36} />
                      <View style={styles.tagResultInfo}>
                        <Text style={[styles.tagResultName, { color: isDark ? '#ffffff' : '#111827' }]}>{u.name ?? u.handle}</Text>
                        <Text style={[styles.tagResultHandle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>@{u.handle}</Text>
                      </View>
                      <Pressable
                        onPress={async () => {
                          try {
                            await updateTaggedUsers({ sessionId: session!.id, userId: u.id, action: 'add' }).unwrap();
                          } catch {
                            Alert.alert('Error', 'Failed to tag user.');
                          }
                        }}
                        style={[styles.tagActionBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff' }]}
                      >
                        <Text style={[styles.tagActionText, { color: '#3b82f6' }]}>Tag</Text>
                      </Pressable>
                    </View>
                  ));
                }

                // Show tagged users (full list for owner when not searching,
                // filtered list for non-owner when searching, full otherwise).
                if (filteredTagged.length > 0) {
                  return filteredTagged.map((tu: any) => (
                    <Pressable
                      key={tu.id ?? tu.handle}
                      onPress={isOwner ? undefined : () => goToProfile(tu.handle)}
                      style={styles.tagResultRow}
                    >
                      <UserAvatar uri={tu.picture} name={tu.name ?? tu.handle} size={36} />
                      <View style={styles.tagResultInfo}>
                        <Text style={[styles.tagResultName, { color: isDark ? '#ffffff' : '#111827' }]}>{tu.name ?? tu.handle}</Text>
                        <Text style={[styles.tagResultHandle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>@{tu.handle}</Text>
                      </View>
                      {isOwner && (
                        <Pressable
                          onPress={async () => {
                            try {
                              await updateTaggedUsers({ sessionId: session!.id, userId: tu.id, action: 'remove' }).unwrap();
                            } catch {
                              Alert.alert('Error', 'Failed to remove tag.');
                            }
                          }}
                          style={[styles.tagActionBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2' }]}
                        >
                          <Text style={[styles.tagActionText, { color: '#ef4444' }]}>Remove</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  ));
                }

                // Non-owner with a search that matched nothing in tagged list.
                if (isSearching && !isOwner) {
                  return (
                    <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', textAlign: 'center', paddingVertical: 24, fontSize: 14 }}>
                      No tagged users matching "{tagSearch}"
                    </Text>
                  );
                }

                // No tagged users and not searching
                return (
                  <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', textAlign: 'center', paddingVertical: 24, fontSize: 14 }}>
                    {isOwner ? 'No tagged users yet. Search to tag surfers.' : 'No tagged users yet.'}
                  </Text>
                );
              })()}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Group Management Modal */}
      <Modal visible={groupSheetVisible} transparent animationType="slide" onRequestClose={() => setGroupSheetVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setGroupSheetVisible(false)}>
          <Animated.View style={[styles.modalCard, { backgroundColor: isDark ? '#111827' : '#ffffff', transform: [{ translateY: groupSlide }] }, kbVisible && { paddingBottom: kbHeight }]}>
            <View {...groupPanResponder.panHandlers}>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View style={[styles.modalHandle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
              </Pressable>
            </View>
            <Text style={[styles.modalTitle, { color: isDark ? '#ffffff' : '#111827', marginBottom: 4 }]}>Manage Groups</Text>
            <ScrollView style={{ maxHeight: kbVisible ? 150 : 300 }} keyboardShouldPersistTaps="handled">
              {groups.length > 0 ? groups.map((g: any) => (
                <View key={g.id} style={styles.groupManageRow}>
                  {editingGroupId === g.id ? (
                    <>
                      <Pressable onPress={() => {
                        const idx = COLOR_PRESETS.indexOf(editGroupColor);
                        setEditGroupColor(COLOR_PRESETS[(idx + 1) % COLOR_PRESETS.length]);
                      }}>
                        <View style={[styles.groupColorDot, { backgroundColor: editGroupColor }]} />
                      </Pressable>
                      <TextInput
                        value={editGroupName}
                        onChangeText={setEditGroupName}
                        style={[styles.createGroupInput, {
                          color: isDark ? '#ffffff' : '#111827',
                          borderColor: isDark ? '#374151' : '#d1d5db',
                          backgroundColor: isDark ? '#1f2937' : '#f9fafb',
                        }]}
                      />
                      <Pressable onPress={async () => {
                        if (!editGroupName.trim()) return;
                        try {
                          await updateGroup({ sessionId: session!.id, groupId: g.id, name: editGroupName.trim(), color: editGroupColor }).unwrap();
                          setEditingGroupId(null);
                        } catch {
                          Alert.alert('Error', 'Failed to update group.');
                        }
                      }}>
                        <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
                      </Pressable>
                      <Pressable onPress={() => setEditingGroupId(null)}>
                        <Ionicons name="close-circle" size={24} color="#9ca3af" />
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <View style={[styles.groupColorDot, { backgroundColor: g.color }]} />
                      <Text style={[styles.groupManageName, { color: isDark ? '#ffffff' : '#111827' }]}>{g.name}</Text>
                      <View style={styles.groupManageActions}>
                        <Pressable onPress={() => { setEditingGroupId(g.id); setEditGroupName(g.name); setEditGroupColor(g.color); }}>
                          <Ionicons name="pencil" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                        </Pressable>
                        <Pressable onPress={() => {
                          Alert.alert('Delete Group', `Delete "${g.name}"? Photos will not be deleted.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteGroup({ sessionId: session!.id, groupId: g.id }) },
                          ]);
                        }}>
                          <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              )) : (
                <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', textAlign: 'center', paddingVertical: 24, fontSize: 14 }}>
                  No groups yet. Create one below.
                </Text>
              )}
            </ScrollView>

            {/* Color picker — always visible */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              <View style={styles.colorPickerRow}>
                {COLOR_PRESETS.map((c) => (
                  <Pressable key={c} onPress={() => setNewGroupColor(c)} style={[styles.colorCircle, { backgroundColor: c }]}>
                    {newGroupColor === c && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Create group — always visible */}
            <View style={styles.createGroupRow}>
              <TextInput
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="New group name"
                placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                style={[styles.createGroupInput, {
                  color: isDark ? '#ffffff' : '#111827',
                  borderColor: isDark ? '#374151' : '#d1d5db',
                  backgroundColor: isDark ? '#1f2937' : '#f9fafb',
                }]}
              />
              <Pressable
                onPress={async () => {
                  if (!newGroupName.trim() || !session?.id) return;
                  try {
                    await createGroup({ sessionId: session.id, name: newGroupName.trim(), color: newGroupColor }).unwrap();
                    setNewGroupName('');
                  } catch {
                    Alert.alert('Error', 'Failed to create group.');
                  }
                }}
                style={styles.createGroupBtn}
              >
                <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>Create</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Edit Session Modal */}
      <Modal visible={editSheetVisible} transparent animationType="slide" onRequestClose={() => setEditSheetVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditSheetVisible(false)}>
          <Animated.View style={[styles.modalCard, { backgroundColor: isDark ? '#111827' : '#ffffff', transform: [{ translateY: editSlide }] }, kbVisible && { paddingBottom: kbHeight }]}>
            <View {...editPanResponder.panHandlers}>
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View style={[styles.modalHandle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
              </Pressable>
            </View>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: isDark ? '#ffffff' : '#111827' }]}>Edit Session</Text>
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#9ca3af' : '#6b7280', marginBottom: 6 }}>SESSION NAME</Text>
                <TextInput
                  value={editSessionName}
                  onChangeText={setEditSessionName}
                  placeholder="Session name"
                  placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                  style={{
                    color: isDark ? '#ffffff' : '#111827',
                    borderColor: isDark ? '#374151' : '#d1d5db',
                    backgroundColor: isDark ? '#1f2937' : '#f9fafb',
                    borderWidth: 1,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    fontSize: 15,
                    marginBottom: 20,
                  }}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 15, fontWeight: '500', color: isDark ? '#ffffff' : '#111827' }}>Hide Location</Text>
                      {hideLocationLocked && (
                        <Ionicons name="lock-closed" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
                      )}
                    </View>
                    <Text style={{ fontSize: 12, color: isDark ? '#9ca3af' : '#6b7280', marginTop: 2 }}>
                      {hideLocationLocked
                        ? "This session was saved from a photographer's hidden session, so the location stays hidden."
                        : 'Hide the surf break on this session. Share via direct link only.'}
                    </Text>
                  </View>
                  <View style={{ opacity: hideLocationLocked ? 0.6 : 1 }}>
                    <Switch
                      value={hideLocationLocked ? true : editHideLocation}
                      onValueChange={setEditHideLocation}
                      disabled={hideLocationLocked}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                  <Pressable
                    onPress={() => setEditSheetVisible(false)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#374151' : '#d1d5db', alignItems: 'center' }}
                  >
                    <Text style={{ color: isDark ? '#e5e7eb' : '#374151', fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveEdit}
                    disabled={savingEdit}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#3b82f6', alignItems: 'center', opacity: savingEdit ? 0.6 : 1 }}
                  >
                    {savingEdit ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 14 }}>Save</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* Photo lightbox viewer — slice from viewerWindowStart with no upper
          bound; ImageViewing's internal FlatList virtualizes, and the slice
          grows as more photos are paginated in via handleViewerIndexChange. */}
      {viewerVisible && (
        <ImageViewing
          images={sessionMedia
            .slice(viewerWindowStart)
            .map((m) => {
              const key = getPhotoKey(m);
              return { uri: getDirectWatermarkUrl(key) };
            })}
          keyExtractor={(src, idx) => `${viewerWindowStart + idx}-${src?.uri?.slice(-40) ?? idx}`}
          imageIndex={viewerIndex}
          visible
          onRequestClose={handleViewerClose}
          onImageIndexChange={handleViewerIndexChange}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  belowHero: { marginTop: -28, paddingTop: 12 },
  groupChipsScroll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 18 },
  accessBannerWrap: { paddingHorizontal: 16 },
  headerWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  sessionName: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  photographerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photographerName: { fontSize: 14, fontWeight: '600' },
  typeIcon: { marginLeft: 2 },
  subtitle: { fontSize: 12, marginTop: 1 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  breakLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '70%',
    paddingVertical: 3, paddingRight: 4,
  },
  breakLinkText: { fontSize: 13, fontWeight: '600' },
  groupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '500' },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  groupDots: { position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', gap: 4 },
  groupDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  checkbox: {
    position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)', backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoPlaceholder: {
    borderRadius: 6, alignItems: 'center', justifyContent: 'center',
  },
  thumbnailBadge: {
    position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  requestFab: {
    position: 'absolute', bottom: 24, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#22c55e', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  requestFabText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 34, borderTopWidth: 1,
  },
  actionBarTall: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingTop: 12, paddingBottom: 30, borderTopWidth: 1,
  },
  actionBarTopRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10,
  },
  actionBarCount: { fontSize: 14, fontWeight: '600' },
  actionBarHint: { fontSize: 11, fontWeight: '500', marginTop: 2, opacity: 0.75 },
  groupPillScroll: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  groupPillLg: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1,
  },
  groupPillDotLg: { width: 10, height: 10, borderRadius: 5 },
  groupPillTextLg: { fontSize: 13, fontWeight: '600' },
  confirmBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
  confirmBtnText: { fontSize: 14, fontWeight: '600' },
  taggedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(156,163,175,0.12)',
  },
  taggedBadgeLarge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, gap: 5,
  },
  taggedBadgeText: { fontSize: 11, fontWeight: '600' },
  taggedBadgeTextLarge: { fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8, paddingBottom: 34, maxHeight: '70%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginBottom: 12 },
  tagResultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  tagResultInfo: { flex: 1, marginLeft: 10 },
  tagResultName: { fontSize: 14, fontWeight: '500' },
  tagResultHandle: { fontSize: 12 },
  tagActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  tagActionText: { fontSize: 12, fontWeight: '600' },
  groupManageRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  groupColorDot: { width: 16, height: 16, borderRadius: 8 },
  groupManageName: { flex: 1, fontSize: 14, fontWeight: '500' },
  groupManageActions: { flexDirection: 'row', gap: 12 },
  colorPickerRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 10 },
  colorCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  createGroupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
  createGroupInput: { flex: 1, height: 36, borderRadius: 8, paddingHorizontal: 10, fontSize: 14, borderWidth: 1 },
  createGroupBtn: { height: 36, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8b5cf6' },
  groupPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  groupPillText: { fontSize: 11, fontWeight: '600', color: '#6b21a8' },
});
