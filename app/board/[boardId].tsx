import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Share,
  Platform,
  useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ImageViewing from 'react-native-image-viewing';
import { useDispatch } from 'react-redux';
import {
  useGetBoardQuery,
  useUpdateBoardThumbnailMutation,
  useCreateMyBoardPhotosMutation,
  useFinalizeMyBoardPhotosMutation,
  useDeleteMyBoardPhotoMutation,
  useCreateBoardViewReportMutation,
  rootApi,
  ApiTag,
} from '../../src/store';
import { useUser } from '../../src/context/UserProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import UserAvatar from '../../src/components/UserAvatar';
import ActionSheet from '../../src/components/ActionSheet';
import type { ActionSheetSection } from '../../src/components/ActionSheet';
import ReportBoardSheet from '../../src/components/ReportBoardSheet';
import ContactUserSheet from '../../src/components/ContactUserSheet';
import BoardEditSheet from '../../src/components/shaper/BoardEditSheet';
import { getBoardPhotoUrl, boardPhotoDisplay } from '../../src/helpers/mediaUrl';
import { MAX_CLIP_SECONDS, MAX_CLIP_BYTES, MAX_CLIP_GB } from '../../src/helpers/clipMedia';
import { getViewerHash } from '../../src/helpers/viewerHash';
import { generateUUID } from '../../src/helpers/uuid';
import { VideoView, useVideoPlayer } from 'expo-video';

/** Fullscreen board clip player (ImageViewing is image-only). */
function BoardVideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <View style={s.videoOverlay}>
      <VideoView player={player} style={s.videoOverlayPlayer} contentFit="contain" nativeControls />
      <Pressable onPress={onClose} hitSlop={10} style={s.videoOverlayClose}>
        <Ionicons name="close" size={26} color="#ffffff" />
      </Pressable>
    </View>
  );
}

// 2-column grid mirrors the mobile session detail page (NUM_COLUMNS=2 +
// PHOTO_WIDTH math + 1.2× height ratio) so a user moving between session
// and board pages gets the same photo surface.
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const GAP = 4;
const PHOTO_WIDTH = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;
const PHOTO_HEIGHT = PHOTO_WIDTH * 1.2;

// Module-level dedup: one view-report per board id per app launch.
// Mirrors viewedSessionIds on the session page.
const viewedBoardIds = new Set<string>();

// Action-bar color tokens — same shape as session's `actionColors` map so the
// chrome reads identically across the two surfaces. Boards only need 'delete'
// today; keep the structure consistent so adding more modes later is trivial.
const actionColors = {
  delete: {
    bg: 'rgba(254, 242, 242, 0.97)',
    bgDark: 'rgba(69, 10, 10, 0.95)',
    border: '#fecaca',
    borderDark: '#7f1d1d',
    text: '#991b1b',
    textDark: '#fca5a5',
    btn: '#ef4444',
  },
} as const;
type BoardActionKey = keyof typeof actionColors;

const formatCount = (n: number): string => {
  const v = Number(n) || 0;
  if (v < 1000) return `${v}`;
  if (v < 10000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v / 1000)}k`;
};

/**
 * Dedicated board detail page. Mirrors the mobile session detail page's
 * shell: SafeAreaView + ScreenHeader + scroll body + sticky bottom action
 * bar in select mode + ActionSheet ellipsis menu + ReportBoardSheet.
 *
 * Differences from session:
 *  - No groups, no access requests, no tagging — boards are simpler.
 *  - Owner action mode = 'delete' only (multi-select photos, sticky red bar).
 *  - Long-press on a photo (owner, not in action mode) opens an action
 *    sheet with "Set as Thumbnail" — same UX as session.
 *
 * View tracking fires on page mount with a 3s debounce, owner-skipped, and
 * deduped per app launch via `viewedBoardIds`.
 */
export default function BoardDetailScreen() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const { user } = useUser();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const requireAuth = useRequireAuth();
  const dispatch = useDispatch();

  const { data, isLoading, isError, refetch } = useGetBoardQuery(
    { boardId: boardId as string },
    { skip: !boardId }
  );
  const board = data?.results?.board;

  const [reportBoardView] = useCreateBoardViewReportMutation();
  const [updateThumbnail] = useUpdateBoardThumbnailMutation();
  const [createMyBoardPhotos] = useCreateMyBoardPhotosMutation();
  const [finalizeMyBoardPhotos] = useFinalizeMyBoardPhotosMutation();
  const [deleteMyBoardPhoto] = useDeleteMyBoardPhotoMutation();

  const isSelf = !!(user && board && user.id === board.shaper_user_id);

  // ---- View tracking ----
  useEffect(() => {
    if (!board?.id || isSelf) return;
    if (viewedBoardIds.has(board.id)) return;
    const t = setTimeout(async () => {
      if (viewedBoardIds.has(board.id)) return;
      viewedBoardIds.add(board.id);
      try {
        const hash = await getViewerHash((user as any)?.id);
        reportBoardView({ boardId: board.id, viewerHash: hash })
          .unwrap()
          .catch(() => { /* fire-and-forget */ });
      } catch { /* fire-and-forget */ }
    }, 3000);
    return () => clearTimeout(t);
  }, [board?.id, isSelf, user, reportBoardView]);

  // ---- Lightbox ----
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // ImageViewing is image-only; a clip opens this fullscreen video overlay.
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const photos = board?.photos ?? [];
  // Lightbox = image (non-video) items only. Videos open the video overlay, so
  // they're excluded here. We map a photo's grid index → its lightbox index so
  // tapping the Nth grid tile opens the right image (video tiles shift indices).
  const { lightboxImages, lightboxIndexByPhotoId } = useMemo(() => {
    const images: { uri: string }[] = [];
    const indexById: Record<string, number> = {};
    for (const p of photos) {
      if (p.media_type === 'video') continue;
      const uri = getBoardPhotoUrl(p.s3_key);
      if (!uri) continue;
      indexById[p.id] = images.length;
      images.push({ uri });
    }
    return { lightboxImages: images, lightboxIndexByPhotoId: indexById };
  }, [photos]);

  // ---- Action mode (multi-select for delete). Mirrors session's
  // (sessionAction, selectedPhotoIds, isProcessingAction) trio. ----
  const [boardAction, setBoardAction] = useState<BoardActionKey | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const ac = boardAction ? actionColors[boardAction] : actionColors.delete;

  const togglePhotoSelection = useCallback((photoId: string) => {
    setSelectedPhotoIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  }, []);

  const cancelAction = useCallback(() => {
    setBoardAction(null);
    setSelectedPhotoIds([]);
  }, []);

  const handleStartDelete = useCallback(() => {
    if (!requireAuth()) return;
    setBoardAction('delete');
    setSelectedPhotoIds([]);
  }, [requireAuth]);

  // ---- Other sheets / modals ----
  const [boardSheetOpen, setBoardSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editingOpen, setEditingOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  // Photo long-press sheet — mirrors session's `photoSheetVisible` /
  // `photoSheetItem` pair. Opening on long-press matches session UX rather
  // than the previous "long-press = immediately set thumbnail" shortcut.
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [photoSheetItem, setPhotoSheetItem] = useState<any>(null);

  const handleShare = useCallback(async () => {
    if (!board) return;
    const handle = board.shaper?.handle;
    if (!handle) return;
    const shareUrl = `https://app.surf-vault.com/${handle}/boards/${board.id}`;
    try {
      await Share.share(Platform.OS === 'ios' ? { url: shareUrl } : { message: shareUrl });
    } catch { /* user cancelled */ }
  }, [board]);

  const handleAddPhotos = useCallback(async () => {
    if (!board) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'SurfVault needs photo library access to upload board media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (result.canceled) return;

    // Clip caps (primary gate; backend is the net). ImagePicker reports video
    // duration in ms. Drop over-cap clips with a message, keep the rest.
    const accepted = result.assets.filter((a) => {
      if (a.type !== 'video') return true;
      const durSec = a.duration != null ? a.duration / 1000 : null;
      const bytes = Number(a.fileSize ?? 0);
      if ((durSec != null && durSec > MAX_CLIP_SECONDS) || (bytes > 0 && bytes > MAX_CLIP_BYTES)) {
        return false;
      }
      return true;
    });
    if (accepted.length < result.assets.length) {
      Alert.alert('Clip too large', `Videos must be ${MAX_CLIP_SECONDS}s and ${MAX_CLIP_GB}GB or less.`);
    }
    if (!accepted.length) return;

    try {
      const presigned = await createMyBoardPhotos({
        boardId: board.id,
        payload: {
          files: accepted.map((a) => ({
            file_uuid: generateUUID(),
            file_type: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
            // Backend uses this to update users.current_storage atomically
            // with the INSERT. ImagePicker reports `fileSize` in bytes; falls
            // back to 0 (unknown) → reconcile cron surfaces drift.
            file_size_bytes: Number(a.fileSize ?? 0) || 0,
            // Video-only; backend classifies media_type from MIME + gates.
            duration_seconds: a.type === 'video' && a.duration != null ? a.duration / 1000 : null,
          })),
        },
      }).unwrap();
      const out = presigned?.results?.photos ?? [];
      await Promise.all(
        out.map(async (p: any, i: number) => {
          const asset = accepted[i];
          const blob = await (await fetch(asset.uri)).blob();
          await fetch(p.url, {
            method: 'PUT',
            headers: { 'Content-Type': asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg') },
            body: blob,
          });
        })
      );
      // Trigger transcode for video rows now that their S3 objects exist
      // (boards have no per-file finalize → create couldn't enqueue without
      // racing the upload). Best-effort.
      const videoPhotoIds = out.filter((p: any) => p.media_type === 'video').map((p: any) => p.id);
      if (videoPhotoIds.length) {
        try {
          await finalizeMyBoardPhotos({ boardId: board.id, photoIds: videoPhotoIds }).unwrap();
        } catch (e) {
          console.warn('board finalize (transcode enqueue) failed:', e);
        }
      }
      refetch();
    } catch (err: any) {
      Alert.alert('Upload failed', err?.data?.message || err?.message || 'Try again');
    }
  }, [board, createMyBoardPhotos, finalizeMyBoardPhotos, refetch]);

  // Set the board's thumbnail. Mirrors session's `handleSetThumbnail` —
  // single-action that applies immediately when invoked from the photo
  // long-press action sheet.
  const handleSetThumbnail = useCallback(async (photoId: string) => {
    if (!board || photoId === board.thumbnail_photo_id) return;
    try {
      await updateThumbnail({ boardId: board.id, photoId }).unwrap();
      refetch();
    } catch (err: any) {
      Alert.alert('Could not set thumbnail', err?.data?.message || err?.message || 'Try again');
    }
  }, [board, updateThumbnail, refetch]);

  const handlePhotoLongPress = useCallback((photo: any) => {
    if (!isSelf || !!boardAction) return;
    setPhotoSheetItem(photo);
    setPhotoSheetVisible(true);
  }, [isSelf, boardAction]);

  // Photo-level action sheet sections — mirrors session's
  // `photoSheetSections` shape: "Set as Thumbnail" / "Current Thumbnail"
  // depending on whether the photo is already the board's thumbnail.
  const photoSheetSections: ActionSheetSection[] = useMemo(() => {
    if (!photoSheetItem || !board) return [];
    const thumbId = board.thumbnail_photo_id ?? photos[0]?.id ?? null;
    const isCurrent = photoSheetItem.id === thumbId;
    return [
      {
        options: isCurrent
          ? [
              {
                label: 'Current Thumbnail',
                icon: 'checkmark-circle-outline',
                iconLibrary: 'ionicons',
                onPress: () => {},
              },
            ]
          : [
              {
                label: 'Set as Thumbnail',
                icon: 'image-outline',
                iconLibrary: 'ionicons',
                onPress: () => {
                  const id = photoSheetItem.id;
                  setPhotoSheetVisible(false);
                  setPhotoSheetItem(null);
                  if (id) handleSetThumbnail(id);
                },
              },
            ],
      },
    ];
  }, [photoSheetItem, board, photos, handleSetThumbnail]);

  // ---- Confirm delete ----
  const handleConfirmAction = useCallback(() => {
    if (!selectedPhotoIds.length || !board?.id || isProcessingAction) return;
    if (boardAction !== 'delete') return;

    const count = selectedPhotoIds.length;
    Alert.alert(
      `Remove ${count} item${count === 1 ? '' : 's'}?`,
      "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsProcessingAction(true);
            const ids = [...selectedPhotoIds];
            const removeSet = new Set(ids);
            // Optimistic: pull the selected photos out of the getBoard cache up
            // front so the grid updates instantly — one patch covers the whole
            // multi-select, reverted as a unit if any delete fails.
            const patch = dispatch(
              (rootApi.util as any).updateQueryData(
                'getBoard',
                { boardId: boardId as string },
                (draft: any) => {
                  const arr = draft?.results?.board?.photos;
                  if (!Array.isArray(arr)) return;
                  draft.results.board.photos = arr.filter((p: any) => !removeSet.has(p.id));
                }
              )
            );
            cancelAction();
            try {
              // Serial delete keeps error reporting simple — boards rarely
              // have so many photos that parallel matters.
              for (const id of ids) {
                await deleteMyBoardPhoto({ photoId: id }).unwrap();
              }
              // Reconcile every Boardroom surface (profile grid counts, feeds)
              // now that the loop is done. deleteMyBoardPhoto no longer
              // invalidates per-call, which would otherwise re-add not-yet-
              // deleted photos mid-loop and undo the optimistic removal.
              dispatch(rootApi.util.invalidateTags([ApiTag.Boardroom]));
            } catch (err: any) {
              patch.undo();
              refetch();
              Alert.alert(
                'Delete failed',
                err?.data?.message || err?.message || 'Some items could not be removed.'
              );
            } finally {
              setIsProcessingAction(false);
            }
          },
        },
      ]
    );
  }, [boardAction, selectedPhotoIds, board?.id, isProcessingAction, deleteMyBoardPhoto, refetch, cancelAction, dispatch, boardId]);

  // Whole-board deletion lives on the profile gallery's long-press menu
  // (`ShaperBoardsGrid.tsx`). Keeping that out of this page means a shaper
  // editing/uploading photos can never accidentally nuke the entire board.

  // ---- Ellipsis sheet — sectioned to mirror the session ellipsis menu ----
  // Owner grouping:
  //   1. Casual: Share Board + Edit Board (metadata-only, easily reversible)
  //   2. Photo-level: Add Photos + Delete Photos (touches content)
  //
  // Whole-board deletion lives ONLY on the profile gallery's long-press
  // menu — keeping it out of this sheet means a shaper editing/uploading
  // photos can never accidentally nuke the entire board mid-flow.
  const ellipsisSections: ActionSheetSection[] = useMemo(() => {
    if (!board) return [];
    const sections: ActionSheetSection[] = [];

    if (isSelf) {
      sections.push({
        options: [
          {
            label: 'Share Board',
            icon: 'share-outline',
            iconLibrary: 'ionicons',
            onPress: () => {
              setBoardSheetOpen(false);
              handleShare();
            },
          },
          {
            label: 'Edit Board',
            icon: 'create-outline',
            iconLibrary: 'ionicons',
            onPress: () => {
              setBoardSheetOpen(false);
              setEditingOpen(true);
            },
          },
        ],
      });
      sections.push({
        options: [
          {
            label: 'Add Media',
            icon: 'images-outline',
            iconLibrary: 'ionicons',
            onPress: () => {
              setBoardSheetOpen(false);
              handleAddPhotos();
            },
          },
          {
            label: 'Delete Media',
            icon: 'trash-outline',
            iconLibrary: 'ionicons',
            destructive: true,
            onPress: () => {
              setBoardSheetOpen(false);
              handleStartDelete();
            },
          },
        ],
      });
    } else {
      sections.push({
        options: [
          {
            label: 'Share Board',
            icon: 'share-outline',
            iconLibrary: 'ionicons',
            onPress: () => {
              setBoardSheetOpen(false);
              handleShare();
            },
          },
        ],
      });
      sections.push({
        options: [
          {
            label: 'Report Board',
            icon: 'flag-outline',
            iconLibrary: 'ionicons',
            destructive: true,
            onPress: () => {
              setBoardSheetOpen(false);
              if (!requireAuth()) return;
              setReportOpen(true);
            },
          },
        ],
      });
    }

    return sections;
  }, [board, isSelf, handleShare, handleAddPhotos, handleStartDelete, requireAuth]);

  // ---- Loading / error ----
  if (isLoading) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: isDark ? '#000' : '#fff' }]} edges={[]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader
          left={
            <Pressable onPress={smartBack} hitSlop={10}>
              <Ionicons name="chevron-back" size={28} color={isDark ? '#fff' : '#000'} />
            </Pressable>
          }
        />
        <View style={s.center}><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }

  if (isError || !board) {
    return (
      <SafeAreaView style={[s.flex, { backgroundColor: isDark ? '#000' : '#fff' }]} edges={[]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader
          left={
            <Pressable onPress={smartBack} hitSlop={10}>
              <Ionicons name="chevron-back" size={28} color={isDark ? '#fff' : '#000'} />
            </Pressable>
          }
        />
        <View style={s.center}>
          <Text style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>Board not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const subtitleParts = [
    board.board_type ? capitalize(board.board_type) : null,
    board.dimensions || null,
  ].filter(Boolean) as string[];
  const subtitle = subtitleParts.join(' · ');
  const inActionMode = !!boardAction;
  // View count is owner-only — same pattern session pages use. Non-owners
  // never see how many times a board has been viewed.
  const viewCount = isSelf ? Number(board.view_count ?? 0) : 0;
  const canMessageShaper = !isSelf && !inActionMode && !!board.shaper?.id;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={board.name}
        left={
          <Pressable
            onPress={inActionMode ? cancelAction : smartBack}
            hitSlop={10}
          >
            <Ionicons
              name={inActionMode ? 'close' : 'chevron-back'}
              size={28}
              color={isDark ? '#fff' : '#007AFF'}
            />
          </Pressable>
        }
        right={
          inActionMode ? null : (
            <Pressable onPress={() => setBoardSheetOpen(true)} hitSlop={12}>
              <Ionicons name="ellipsis-horizontal" size={22} color={isDark ? '#e5e7eb' : '#374151'} />
            </Pressable>
          )
        }
      />
      <SafeAreaView style={[s.flex, { backgroundColor: isDark ? '#000' : '#fff' }]} edges={[]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: inActionMode ? 96 : 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.headerWrap}>
            {/* Shaper row — same shape as session's photographerRow:
                avatar 56 + name row (handle + type icon + side badge) +
                subtitle row (📐 type · dimensions). */}
            {board.shaper ? (
              <Pressable
                onPress={() => trackedPush(`/user/${board.shaper.handle}` as any)}
                style={s.photographerRow}
              >
                <UserAvatar
                  uri={board.shaper.picture}
                  name={board.shaper.name ?? board.shaper.handle}
                  size={56}
                  verified={board.shaper.verified ?? false}
                  userType="shaper"
                />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <View style={s.nameRow}>
                    <Text style={[s.photographerName, { color: isDark ? '#fff' : '#111827' }]}>
                      {board.shaper.name ?? board.shaper.handle}
                    </Text>
                    {/* Tools-of-trade icon — sits next to name like session's
                        camera/surfing icon. Hammer-wrench reads as "maker". */}
                    <MaterialCommunityIcons
                      name="hammer-wrench"
                      size={14}
                      color="#9ca3af"
                      style={s.typeIcon}
                    />
                    {/* Right-side side badge — replaces session's tagged-users
                        badge. Shows view count when present so the same
                        visual rhythm holds. */}
                    {(viewCount > 0 || board.is_featured) ? (
                      <View
                        style={[
                          s.taggedBadge,
                          (viewCount > 0 || board.is_featured) && s.taggedBadgeLarge,
                        ]}
                      >
                        {board.is_featured ? (
                          <MaterialCommunityIcons name="star" size={14} color="#f59e0b" />
                        ) : (
                          <Ionicons name="eye-outline" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
                        )}
                        <Text
                          style={[
                            s.taggedBadgeText,
                            s.taggedBadgeTextLarge,
                            { color: board.is_featured ? '#f59e0b' : (isDark ? '#9ca3af' : '#6b7280') },
                          ]}
                        >
                          {board.is_featured ? 'Featured' : formatCount(viewCount)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {/* Subtitle row — plain text, same font as session's date
                      (subtitle: 12px regular). No leading icon, no photo
                      count — keeps the line clean: "Fish · 5'4 x 20 x 2'3/8". */}
                  {subtitle ? (
                    <View style={s.subtitleRow}>
                      <Text
                        style={[s.subtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}
                        numberOfLines={1}
                      >
                        {subtitle}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ) : null}

            {/* Description — same indentation as photographerRow body */}
            {board.description ? (
              <Text style={[s.description, { color: isDark ? '#d1d5db' : '#374151' }]}>
                {board.description}
              </Text>
            ) : null}

          </View>

          {/* Photo grid — 2-column to mirror session detail. */}
          {photos.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="images-outline" size={40} color={isDark ? '#374151' : '#d1d5db'} />
              <Text style={{ marginTop: 8, color: isDark ? '#6b7280' : '#9ca3af' }}>
                No media yet.
              </Text>
              {isSelf ? (
                <Pressable onPress={handleAddPhotos} style={s.emptyAddBtn}>
                  <Text style={s.emptyAddText}>Add media</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={s.gridWrap}>
              {photos.map((p, idx) => {
                // Match session: thumbnail indicator is owner-only. Non-owners
                // see a clean grid with no per-photo chrome.
                const isThumbnail = isSelf && (
                  board.thumbnail_photo_id
                    ? p.id === board.thumbnail_photo_id
                    : idx === 0
                );
                const isSelected = selectedPhotoIds.includes(p.id);
                const disp = boardPhotoDisplay(p);
                const photoUri = disp.posterUrl ?? undefined;

                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      if (inActionMode) {
                        togglePhotoSelection(p.id);
                      } else if (disp.isVideo) {
                        if (disp.videoUrl) setActiveVideoUrl(disp.videoUrl);
                      } else {
                        const lbIdx = lightboxIndexByPhotoId[p.id];
                        if (lbIdx != null) setViewerIndex(lbIdx);
                      }
                    }}
                    onLongPress={() => handlePhotoLongPress(p)}
                    delayLongPress={350}
                    style={{ width: PHOTO_WIDTH, margin: GAP / 2 }}
                  >
                    <View style={{ position: 'relative' }}>
                      <View
                        style={[
                          s.photoPlaceholder,
                          {
                            width: PHOTO_WIDTH,
                            height: PHOTO_HEIGHT,
                            backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
                          },
                        ]}
                      >
                        <Ionicons name="image-outline" size={28} color={isDark ? '#374151' : '#d1d5db'} />
                      </View>
                      <Image
                        source={{ uri: photoUri }}
                        style={[
                          {
                            width: PHOTO_WIDTH,
                            height: PHOTO_HEIGHT,
                            borderRadius: 6,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                          },
                          inActionMode && isSelected && { borderWidth: 3, borderColor: ac.btn },
                        ]}
                        contentFit="cover"
                        transition={150}
                        recyclingKey={p.id}
                      />

                      {/* Video affordance: ▶ when ready, spinner-ish hourglass
                          while the clip is still transcoding (no poster yet). */}
                      {disp.isVideo ? (
                        <View style={s.videoBadgeWrap} pointerEvents="none">
                          <View style={s.videoBadge}>
                            <Ionicons name={disp.processing ? 'hourglass-outline' : 'play'} size={16} color="#ffffff" />
                          </View>
                        </View>
                      ) : null}

                      {/* Selection checkbox (action mode) — same chrome as session */}
                      {inActionMode ? (
                        <View
                          style={[
                            s.checkbox,
                            isSelected && { backgroundColor: ac.btn, borderColor: ac.btn },
                          ]}
                        >
                          {isSelected && <Ionicons name="checkmark" size={12} color="#ffffff" />}
                        </View>
                      ) : null}

                      {/* Thumbnail badge (no action mode) — same chrome as
                          session's thumbnailBadge (image-outline icon on
                          translucent black) so the same eye spots the same
                          affordance across surfaces. */}
                      {!inActionMode && isThumbnail ? (
                        <View style={s.thumbnailBadge}>
                          <Ionicons name="image-outline" size={12} color="#ffffff" />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Floating "Message Shaper" CTA — non-self, no action mode. Mirrors
            session's "Request Photos" FAB shape/position; amber so users learn
            "amber = shaper-flavored action" (vs green = surf-photo action). */}
        {canMessageShaper ? (
          <Pressable
            onPress={() => {
              if (!requireAuth()) return;
              setContactOpen(true);
            }}
            style={[s.messageFab, { bottom: insets.bottom + 16 }]}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
            <Text style={s.messageFabText}>Message Shaper</Text>
          </Pressable>
        ) : null}

        {/* Sticky bottom action bar — appears in action mode. Mirrors
            session's bottom bar pixel-for-pixel (positioning, padding, font
            sizes, button shape) with board-flavored color tokens. */}
        {inActionMode ? (
          <View
            style={[
              s.actionBar,
              {
                backgroundColor: isDark ? ac.bgDark : ac.bg,
                borderTopColor: isDark ? ac.borderDark : ac.border,
                paddingBottom: insets.bottom + 14,
              },
            ]}
          >
            <Pressable onPress={cancelAction} hitSlop={8}>
              <Ionicons name="close" size={24} color={isDark ? ac.textDark : ac.text} />
            </Pressable>
            <Text style={[s.actionBarCount, { color: isDark ? ac.textDark : ac.text }]}>
              {selectedPhotoIds.length} photo{selectedPhotoIds.length !== 1 ? 's' : ''} selected
            </Text>
            <Pressable
              onPress={handleConfirmAction}
              disabled={selectedPhotoIds.length === 0 || isProcessingAction}
              style={[
                s.confirmBtn,
                {
                  backgroundColor: selectedPhotoIds.length > 0 && !isProcessingAction
                    ? ac.btn
                    : (isDark ? '#374151' : '#d1d5db'),
                  opacity: isProcessingAction ? 0.7 : 1,
                },
              ]}
            >
              {isProcessingAction ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text
                  style={[
                    s.confirmBtnText,
                    { color: selectedPhotoIds.length > 0 ? '#ffffff' : '#9ca3af' },
                  ]}
                >
                  Confirm
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>

      {/* Lightbox — kept outside SafeAreaView so it can cover the status bar */}
      <Modal
        visible={viewerIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        {viewerIndex !== null ? (
          <ImageViewing
            images={lightboxImages}
            imageIndex={viewerIndex}
            visible
            onRequestClose={() => setViewerIndex(null)}
          />
        ) : null}
      </Modal>

      {/* Clip player overlay — ImageViewing can't show video. */}
      <Modal
        visible={activeVideoUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveVideoUrl(null)}
      >
        {activeVideoUrl ? (
          <BoardVideoPlayer url={activeVideoUrl} onClose={() => setActiveVideoUrl(null)} />
        ) : null}
      </Modal>

      {/* Ellipsis sheet — sectioned (Share / Owner manage / Owner destructive
          — or — Share / Report) to match session's sheet structure.
          No header — title/subtitle are already visible in the page chrome. */}
      <ActionSheet
        visible={boardSheetOpen}
        sections={ellipsisSections}
        onClose={() => setBoardSheetOpen(false)}
      />

      {/* Photo long-press sheet — Set as Thumbnail / Current Thumbnail.
          Mirrors the session photoSheet pattern (with photo preview in
          the sheet header). */}
      <ActionSheet
        visible={photoSheetVisible}
        sections={photoSheetSections}
        onClose={() => { setPhotoSheetVisible(false); setPhotoSheetItem(null); }}
        header={photoSheetItem ? {
          title: 'Photo Options',
          imageUri: photoSheetItem.s3_key
            ? getBoardPhotoUrl(photoSheetItem.s3_key) ?? undefined
            : undefined,
        } : undefined}
      />

      <ReportBoardSheet
        visible={reportOpen}
        boardId={board.id}
        shaperUserId={board.shaper_user_id}
        shaperHandle={board.shaper?.handle}
        onClose={() => setReportOpen(false)}
      />

      {/* Contact shaper sheet — non-self only. Uses the existing
          conversation-start mutation; on success navigates to the new
          conversation thread. */}
      {board.shaper?.id ? (
        <ContactUserSheet
          visible={contactOpen}
          user={{ id: board.shaper.id, handle: board.shaper.handle }}
          onClose={() => setContactOpen(false)}
          onSent={(conversationId) => trackedPush(`/conversation/${conversationId}` as any)}
        />
      ) : null}

      {isSelf ? (
        <BoardEditSheet
          visible={editingOpen}
          board={editingOpen ? (board as any) : null}
          featuredCount={board.is_featured ? 1 : 0}
          onClose={() => setEditingOpen(false)}
        />
      ) : null}
    </>
  );
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Style names + values mirror session's header block 1:1 so the two
  // surfaces look like the same skeleton with adapted content.
  headerWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  photographerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photographerName: { fontSize: 14, fontWeight: '600' },
  typeIcon: { marginLeft: 2 },
  subtitle: { fontSize: 12, marginTop: 1 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  taggedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(156,163,175,0.12)',
  },
  taggedBadgeLarge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 5,
  },
  taggedBadgeText: { fontSize: 11, fontWeight: '600' },
  taggedBadgeTextLarge: { fontSize: 13 },
  description: {
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  emptyWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAddBtn: {
    marginTop: 16,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  emptyAddText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  // Floating CTA — same shape/positioning as session's `requestFab`,
  // amber (`#d97706`) instead of green. Different color signals "shaper-
  // flavored action" vs surf-photo action.
  messageFab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#d97706',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  messageFabText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GAP / 2,
    paddingTop: 4,
  },
  photoPlaceholder: {
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mirrors session's checkbox style (same size, colors, position).
  checkbox: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 1:1 with session's thumbnailBadge — same size, color, position so the
  // thumbnail affordance looks identical across surfaces.
  thumbnailBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadgeWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  videoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoOverlayPlayer: {
    width: '100%',
    height: '80%',
  },
  videoOverlayClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mirrors session actionBar / actionBarCount / confirmBtn 1:1.
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 34,
    borderTopWidth: 1,
  },
  actionBarCount: { fontSize: 14, fontWeight: '600' },
  confirmBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
  confirmBtnText: { fontSize: 14, fontWeight: '600' },
});
