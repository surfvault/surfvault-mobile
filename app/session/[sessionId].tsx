import { useState, useRef, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
} from '../../src/store';
import ImageViewing from 'react-native-image-viewing';
import UserAvatar from '../../src/components/UserAvatar';
import SearchBar from '../../src/components/SearchBar';
import ActionSheet from '../../src/components/ActionSheet';
import type { ActionSheetSection } from '../../src/components/ActionSheet';
import { toOriginalKey, getWatermarkUrl, getDirectWatermarkUrl } from '../../src/helpers/mediaUrl';
import { savePhotoToCameraRoll, savePhotosToCameraRoll } from '../../src/helpers/saveToPhotos';
import { useUpload } from '../../src/context/UploadContext';

const FETCH_AMOUNT = 30;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const GAP = 4;
const PHOTO_WIDTH = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

const COLOR_PRESETS = [
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#64748b', '#78716c',
];

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function SessionDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { user } = useUser();
  const router = useRouter();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const requireAuth = useRequireAuth();

  const [sessionMedia, setSessionMedia] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const seenMediaRef = useRef(new Set<string>());
  const shouldReplaceRef = useRef(false);
  const nextTokenRef = useRef<string>('');
  const flatListRef = useRef<any>(null);

  // Photo viewer (lightbox) — windowed to avoid slow FlatList layout for large sessions
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerWindowStart, setViewerWindowStart] = useState(0);

  // Watermark URL resolution: S3 first, Lambda fallback
  const wmCacheRef = useRef(new Map<string, string>());
  const wmInflightRef = useRef(new Set<string>());
  const [, wmForceRender] = useState(0);

  const getPhotoKey = useCallback((m: any) => {
    return m.original_s3_key || toOriginalKey(m.thumbnail) || '';
  }, []);

  const resolveWatermark = useCallback((key: string) => {
    if (!key || wmCacheRef.current.has(key) || wmInflightRef.current.has(key)) return;
    wmInflightRef.current.add(key);

    const directUrl = getDirectWatermarkUrl(key);
    // 1. Check if watermark already exists in S3
    fetch(directUrl, { method: 'HEAD' })
      .then((res) => {
        if (res.ok) {
          // Cached in S3 — use direct URL
          wmCacheRef.current.set(key, directUrl);
          wmInflightRef.current.delete(key);
          wmForceRender((x) => x + 1);
        } else {
          // 2. Not cached — call Lambda to generate it, then use S3 URL
          fetch(getWatermarkUrl(key), { redirect: 'follow' })
            .then(() => {
              wmCacheRef.current.set(key, directUrl);
            })
            .catch(() => {
              wmCacheRef.current.set(key, directUrl);
            })
            .finally(() => {
              wmInflightRef.current.delete(key);
              wmForceRender((x) => x + 1);
            });
        }
      })
      .catch(() => {
        // HEAD failed — try Lambda anyway
        fetch(getWatermarkUrl(key), { redirect: 'follow' })
          .finally(() => {
            wmCacheRef.current.set(key, directUrl);
            wmInflightRef.current.delete(key);
            wmForceRender((x) => x + 1);
          });
      });
  }, []);

  // Pre-resolve watermark URLs as media loads
  useEffect(() => {
    sessionMedia.forEach((m) => resolveWatermark(getPhotoKey(m)));
  }, [sessionMedia, resolveWatermark, getPhotoKey]);

  // Action mode: "request" | "download" | "delete" | null
  const [sessionAction, setSessionAction] = useState<string | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);

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

  // Swipeable modal helpers
  const tagSlide = useRef(new Animated.Value(0)).current;
  const groupSlide = useRef(new Animated.Value(0)).current;

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

  // Mutations
  const [requestAccessToPhotos] = useRequestAccessToSurfMediaMutation();
  const [downloadSurfMedia] = useDownloadSurfMediaMutation();
  const [deleteSurfMedia] = useDeleteSurfMediaMutation();
  const [favoriteSurfBreak] = useUpdateUserFavoritesMutation();
  const [saveSurfMedia] = useSaveSurfMediaMutation();
  const [updateSessionThumbnail] = useUpdateSessionThumbnailMutation();
  const [updateTaggedUsers] = useUpdateSessionsTaggedUsersMutation();
  const [createGroup] = useCreateSessionGroupMutation();
  const [updateGroup] = useUpdateSessionGroupMutation();
  const [deleteGroup] = useDeleteSessionGroupMutation();
  const [updateGroupPhotos] = useUpdateGroupPhotosMutation();
  const { startUpload, upload: activeUpload } = useUpload();

  // Thumbnail tracking
  const [thumbnailPhotoId, setThumbnailPhotoId] = useState<string | null>(null);

  // Session data
  const { data: sessionData, isLoading } = useGetSessionQuery({
    sessionId: sessionId ?? '',
    userId: user?.id,
    limit: FETCH_AMOUNT,
  });

  const session = sessionData?.results?.session;
  const initialMedia = sessionData?.results?.media ?? [];
  const initialToken = sessionData?.results?.continuationToken ?? '';
  const sessionHandle = session?.handle ?? session?.user_handle;
  const isOwner = !!user?.handle && user.handle === sessionHandle;
  const isFavorited = session?.surf_break_is_favorited;

  // Sync thumbnail from session data
  useEffect(() => {
    if (session?.thumbnail_photo_id !== undefined) {
      setThumbnailPhotoId(session.thumbnail_photo_id ?? null);
    }
  }, [session?.thumbnail_photo_id]);

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
  useEffect(() => {
    if (!activeGroupId && initialMedia.length > 0) {
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

  const { data: morePhotos, isFetching: loadingMore } = useGetSessionPhotosQuery(
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
  const handleStartAction = useCallback((action: string) => {
    if (!requireAuth()) return;
    setSessionAction(action);
    setSelectedPhotoIds([]);
  }, [requireAuth]);

  // Confirm action
  const handleConfirmAction = useCallback(async () => {
    if (!selectedPhotoIds.length || !session?.id) return;

    try {
      switch (sessionAction) {
        case 'request':
          await requestAccessToPhotos({
            handle: sessionHandle!,
            photos: selectedPhotoIds,
            sessionId: session.id,
            surfBreakId: session.surf_break_id,
          }).unwrap();
          Alert.alert('Request Sent', `Photo request sent to @${sessionHandle}. (${selectedPhotoIds.length} photo${selectedPhotoIds.length > 1 ? 's' : ''})`);
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
        case 'delete':
          await deleteSurfMedia({ sessionId: session.id, photos: selectedPhotoIds as any }).unwrap();
          Alert.alert('Deleted', `Deleted ${selectedPhotoIds.length} photo${selectedPhotoIds.length > 1 ? 's' : ''}.`);
          break;
      }
      cancelAction();
    } catch {
      Alert.alert('Error', 'Action failed. Please try again.');
    }
  }, [sessionAction, selectedPhotoIds, session, sessionHandle, requestAccessToPhotos, downloadSurfMedia, deleteSurfMedia, cancelAction]);

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
    const shareUrl = `https://share.surf-vault.com/s/${session.id}`;
    await Share.share(
      Platform.OS === 'ios'
        ? { url: shareUrl }
        : { message: shareUrl }
    );
  }, [session]);

  // Favorite
  const handleFavorite = useCallback(async () => {
    if (!requireAuth()) return;
    if (!session?.surf_break_id) return;
    const action = isFavorited ? 'unfavorite' : 'favorite';
    await favoriteSurfBreak({ surfBreakId: session.surf_break_id, action });
  }, [requireAuth, session, isFavorited, favoriteSurfBreak]);

  // Upload photos to existing session
  const handleUploadPhotos = useCallback(async () => {
    if (!session?.id || activeUpload?.isUploading) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled || result.assets.length === 0) return;

    try {
      const pickedFiles = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        size: asset.fileSize ?? 0,
        type: asset.mimeType ?? 'image/jpeg',
      }));

      const totalSizeInGB = pickedFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024 * 1024);

      const uploadResult = await saveSurfMedia({
        sessionId: session.id,
        mediaFiles: pickedFiles.map((f) => ({ name: f.name, size: f.size, type: f.type, source: 'device' })),
        totalSizeInGB,
      }).unwrap();

      const presignedUrlMap = uploadResult?.results?.presignedUrlMap;
      const uploadId = uploadResult?.results?.uploadId;
      const uploadFileIds = uploadResult?.results?.uploadFileIds ?? [];

      if (!presignedUrlMap || !uploadId) {
        throw new Error('Failed to get upload URLs');
      }

      // Build file list with presigned URLs and upload file IDs
      const uploadFiles = pickedFiles.map((f, i) => ({
        name: f.name,
        uri: f.uri,
        type: f.type,
        uploadFileId: uploadFileIds[i],
        presignedUrl: presignedUrlMap[f.name],
      })).filter((f) => f.presignedUrl && f.uploadFileId);

      startUpload({
        uploadId,
        sessionName: session.session_name ?? 'Session',
        files: uploadFiles,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', error?.data?.message ?? 'Please try again.');
    }
  }, [session?.id, activeUpload?.isUploading, saveSurfMedia, startUpload]);

  // Ellipsis menu
  const handleEllipsisMenu = useCallback(() => setSheetVisible(true), []);

  const ellipsisSections: ActionSheetSection[] = [
    {
      options: [
        {
          label: isFavorited ? 'Unfavorite Break' : 'Favorite Break',
          icon: isFavorited ? 'heart-dislike-outline' : 'heart-outline',
          onPress: handleFavorite,
        },
        {
          label: 'Share Session',
          icon: 'share-outline',
          onPress: handleShare,
        },
        ...(session?.surf_break_identifier ? [{
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
    ...(isOwner ? [{
      options: [
        { label: 'Upload Photos', icon: 'cloud-upload-outline' as const, onPress: handleUploadPhotos },
        { label: 'Save Photos', icon: 'download-outline' as const, onPress: () => handleStartAction('download') },
      ],
    }] : []),
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
        { label: 'Delete Photos', icon: 'trash-outline' as const, destructive: true, onPress: () => handleStartAction('delete') },
      ],
    }] : []),
    ...(!isOwner ? [{
      options: [
        { label: 'Report', icon: 'flag-outline' as const, destructive: true, onPress: () => Alert.alert('Report', 'This session has been reported. Thank you.') },
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
          onPress={() => {
            if (inActionMode) {
              togglePhotoSelection(item.id);
            } else {
              // Window images around tapped photo to avoid slow layout
              const WINDOW = 20;
              const start = Math.max(0, index - WINDOW);
              setViewerWindowStart(start);
              setViewerIndex(index - start);
              setViewerVisible(true);
            }
          }}
          onLongPress={() => handlePhotoLongPress(item)}
          style={{ width: PHOTO_WIDTH, margin: GAP / 2 }}
        >
          <View style={{ position: 'relative' }}>
            <Image
              source={{ uri: item.thumbnail ?? item.url }}
              style={[
                { width: PHOTO_WIDTH, height: PHOTO_WIDTH * 1.2, borderRadius: 6 },
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
            {!inActionMode && photoGroups.length > 0 && (
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
    [sessionAction, selectedPhotoIds, togglePhotoSelection, ac.btn, isOwner, thumbnailPhotoId, handlePhotoLongPress]
  );

  // Header subtitle
  const subtitleParts: string[] = [];
  if (showLocation) subtitleParts.push(session.surf_break_name);
  if (session?.session_date) subtitleParts.push(formatDate(session.session_date));

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: session?.session_name ?? '',
          headerTitleStyle: { fontSize: 16, fontWeight: '600' },
          headerTitleAlign: 'center' as const,
          headerStyle: { backgroundColor: isDark ? '#030712' : '#ffffff' },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={smartBack} hitSlop={8} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={24} color="#007AFF" />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={handleEllipsisMenu} hitSlop={12} style={styles.headerBtn}>
              <Ionicons name="ellipsis-horizontal" size={20} color={isDark ? '#e5e7eb' : '#374151'} />
            </Pressable>
          ),
        }}
      />
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={[]}>
        {isLoading ? (
          <View style={styles.centered}><ActivityIndicator size="large" /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={sessionMedia}
            keyExtractor={(item) => item.id ?? item.thumbnail}
            renderItem={renderPhoto}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={{ padding: GAP / 2, paddingBottom: sessionAction ? 80 : 0 }}
            ListHeaderComponent={
              <View style={styles.headerWrap}>
                {/* Photographer + date */}
                {session && (
                  <Pressable
                    onPress={() => sessionHandle && trackedPush(`/user/${sessionHandle}`)}
                    style={styles.photographerRow}
                  >
                    <UserAvatar
                      uri={session.user_picture}
                      name={session.user_name ?? sessionHandle}
                      size={36}
                      verified={session.user_verified}
                    />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.photographerName, { color: isDark ? '#fff' : '#111827' }]}>
                          {session.user_name ?? sessionHandle}
                        </Text>
                        {session.user_type && (
                          <View style={[styles.typePill, {
                            backgroundColor: session.user_type === 'photographer'
                              ? (isDark ? 'rgba(14, 165, 233, 0.15)' : '#f0f9ff')
                              : (isDark ? 'rgba(139, 92, 246, 0.15)' : '#f5f3ff'),
                            borderColor: session.user_type === 'photographer'
                              ? (isDark ? 'rgba(14, 165, 233, 0.3)' : '#bae6fd')
                              : (isDark ? 'rgba(139, 92, 246, 0.3)' : '#ddd6fe'),
                          }]}>
                            <Text style={[styles.typePillText, {
                              color: session.user_type === 'photographer'
                                ? (isDark ? '#38bdf8' : '#0284c7')
                                : (isDark ? '#a78bfa' : '#7c3aed'),
                            }]}>
                              {session.user_type === 'photographer' ? 'Photographer' : 'Surfer'}
                            </Text>
                          </View>
                        )}
                        {(taggedUsers.length > 0 || isOwner) && (
                          <Pressable
                            onPress={(e) => { e.stopPropagation(); setTagSheetVisible(true); }}
                            hitSlop={6}
                            style={styles.taggedBadge}
                          >
                            <Ionicons name="people-outline" size={12} color={isDark ? '#9ca3af' : '#6b7280'} />
                            {taggedUsers.length > 0 && (
                              <Text style={[styles.taggedBadgeText, { color: isDark ? '#9ca3af' : '#6b7280' }]}>{taggedUsers.length}</Text>
                            )}
                          </Pressable>
                        )}
                      </View>
                      {subtitleParts.length > 0 && (
                        <Text style={[styles.subtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                          {subtitleParts.join(' · ')}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                )}

                {/* Group filter chips */}
                {groups.length > 0 && (
                  <View style={styles.groupChips}>
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
                  </View>
                )}

              </View>
            }
            ListEmptyComponent={
              !isLoading && !loadingMore ? (
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
        )}

        {/* Floating "Request Photos" — non-owners, no active action */}
        {!isOwner && session && !sessionAction && (
          <Pressable onPress={() => handleStartAction('request')} style={styles.requestFab}>
            <Ionicons name="camera-outline" size={18} color="#ffffff" />
            <Text style={styles.requestFabText}>Request Photos</Text>
          </Pressable>
        )}

        {/* Bottom action bar */}
        {sessionAction && (
          <View style={[styles.actionBar, {
            backgroundColor: isDark ? ac.bgDark : ac.bg,
            borderTopColor: isDark ? ac.borderDark : ac.border,
          }]}>
            <Pressable onPress={cancelAction} hitSlop={8}>
              <Ionicons name="close" size={24} color={isDark ? ac.textDark : ac.text} />
            </Pressable>
            <Text style={[styles.actionBarCount, { color: isDark ? ac.textDark : ac.text }]}>
              {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected
            </Text>
            {(sessionAction === 'group' || sessionAction === 'ungroup') ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: '60%' }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {groups.map((g: any) => (
                    <Pressable
                      key={g.id}
                      onPress={() => handleGroupPhotoAction(g.id)}
                      disabled={selectedPhotoIds.length === 0}
                      style={[styles.groupPill, { opacity: selectedPhotoIds.length === 0 ? 0.4 : 1 }]}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: g.color }} />
                      <Text style={styles.groupPillText}>{g.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Pressable
                onPress={handleConfirmAction}
                disabled={selectedPhotoIds.length === 0}
                style={[styles.confirmBtn, {
                  backgroundColor: selectedPhotoIds.length > 0 ? ac.btn : (isDark ? '#374151' : '#d1d5db'),
                }]}
              >
                <Text style={[styles.confirmBtnText, {
                  color: selectedPhotoIds.length > 0 ? '#ffffff' : '#9ca3af',
                }]}>Confirm</Text>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>

      <ActionSheet
        visible={sheetVisible}
        sections={ellipsisSections}
        onClose={() => setSheetVisible(false)}
      />

      {/* Photo long-press action sheet */}
      <ActionSheet
        visible={photoSheetVisible}
        sections={photoSheetSections}
        onClose={() => { setPhotoSheetVisible(false); setPhotoSheetItem(null); }}
        header={photoSheetItem ? {
          title: 'Photo Options',
          imageUri: photoSheetItem.thumbnail ?? photoSheetItem.url,
        } : undefined}
      />

      {/* Tag Management Modal */}
      <Modal visible={tagSheetVisible} transparent animationType="slide" onRequestClose={() => setTagSheetVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={() => setTagSheetVisible(false)}>
            <Animated.View style={[styles.modalCard, { backgroundColor: isDark ? '#111827' : '#ffffff', transform: [{ translateY: tagSlide }] }]}>
              <View {...tagPanResponder.panHandlers}>
                <Pressable onPress={(e) => e.stopPropagation()}>
                  <View style={[styles.modalHandle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
                </Pressable>
              </View>
              <Text style={[styles.modalTitle, { color: isDark ? '#ffffff' : '#111827' }]}>Tag Users</Text>
              <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                <SearchBar onSearch={setTagSearch} placeholder="Search users to tag..." />
              </View>
              <ScrollView style={{ maxHeight: 350 }} keyboardShouldPersistTaps="handled">
                {/* Already tagged users */}
                {taggedUsers.length > 0 && (
                  <>
                    <Text style={{ paddingHorizontal: 16, fontSize: 11, fontWeight: '600', color: isDark ? '#6b7280' : '#9ca3af', marginBottom: 4 }}>TAGGED</Text>
                    {taggedUsers.map((tu: any) => (
                      <View key={tu.id ?? tu.handle} style={styles.tagResultRow}>
                        <UserAvatar uri={tu.picture} name={tu.name ?? tu.handle} size={36} />
                        <View style={styles.tagResultInfo}>
                          <Text style={[styles.tagResultName, { color: isDark ? '#ffffff' : '#111827' }]}>{tu.name ?? tu.handle}</Text>
                          <Text style={[styles.tagResultHandle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>@{tu.handle}</Text>
                        </View>
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
                      </View>
                    ))}
                    {tagSearch.length > 0 && <View style={{ height: 1, backgroundColor: isDark ? '#1f2937' : '#f3f4f6', marginVertical: 8, marginHorizontal: 16 }} />}
                  </>
                )}
                {/* Search results */}
                {tagSearch.length > 0 && (tagSearchData?.results?.users ?? [])
                  .filter((u: any) => !taggedUsers.some((tu: any) => tu.id === u.id))
                  .map((u: any) => (
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
                  ))}
              </ScrollView>
            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group Management Modal */}
      <Modal visible={groupSheetVisible} transparent animationType="slide" onRequestClose={() => setGroupSheetVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={() => setGroupSheetVisible(false)}>
            <Animated.View style={[styles.modalCard, { backgroundColor: isDark ? '#111827' : '#ffffff', transform: [{ translateY: groupSlide }] }]}>
              <View {...groupPanResponder.panHandlers}>
                <Pressable onPress={(e) => e.stopPropagation()}>
                  <View style={[styles.modalHandle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
                </Pressable>
              </View>
              <Text style={[styles.modalTitle, { color: isDark ? '#ffffff' : '#111827' }]}>Manage Groups</Text>
              <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                {groups.map((g: any) => (
                  <View key={g.id} style={styles.groupManageRow}>
                    {editingGroupId === g.id ? (
                      <>
                        <Pressable onPress={() => {
                          // Cycle through colors
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
                ))}
              </ScrollView>

              {/* Color picker */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                <View style={styles.colorPickerRow}>
                  {COLOR_PRESETS.map((c) => (
                    <Pressable key={c} onPress={() => setNewGroupColor(c)} style={[styles.colorCircle, { backgroundColor: c }]}>
                      {newGroupColor === c && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              {/* Create group */}
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Photo lightbox viewer — windowed to keep load times consistent */}
      {viewerVisible && (
        <ImageViewing
          images={sessionMedia
            .slice(viewerWindowStart, viewerWindowStart + 41)
            .map((m) => {
              const key = getPhotoKey(m);
              return { uri: wmCacheRef.current.get(key) || getWatermarkUrl(key) };
            })}
          imageIndex={viewerIndex}
          visible
          onRequestClose={() => setViewerVisible(false)}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  sessionName: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  photographerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photographerName: { fontSize: 14, fontWeight: '600' },
  typePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  typePillText: { fontSize: 10, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 1 },
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
  actionBarCount: { fontSize: 14, fontWeight: '600' },
  confirmBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
  confirmBtnText: { fontSize: 14, fontWeight: '600' },
  taggedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6,
    backgroundColor: 'rgba(156,163,175,0.12)',
  },
  taggedBadgeText: { fontSize: 11, fontWeight: '600' },
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
  createGroupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 8 },
  createGroupInput: { flex: 1, height: 36, borderRadius: 8, paddingHorizontal: 10, fontSize: 14, borderWidth: 1 },
  createGroupBtn: { height: 36, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8b5cf6' },
  groupPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  groupPillText: { fontSize: 11, fontWeight: '600', color: '#6b21a8' },
});
