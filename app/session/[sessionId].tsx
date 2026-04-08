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
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
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
} from '../../src/store';
import UserAvatar from '../../src/components/UserAvatar';

const FETCH_AMOUNT = 30;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const GAP = 4;
const PHOTO_WIDTH = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

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

  // Action mode: "request" | "download" | "delete" | null
  const [sessionAction, setSessionAction] = useState<string | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);

  // Mutations
  const [requestAccessToPhotos] = useRequestAccessToSurfMediaMutation();
  const [downloadSurfMedia] = useDownloadSurfMediaMutation();
  const [deleteSurfMedia] = useDeleteSurfMediaMutation();
  const [favoriteSurfBreak] = useUpdateUserFavoritesMutation();

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

  // Groups
  const { data: groupsData } = useGetSessionGroupsQuery(
    { sessionId: session?.id ?? '' },
    { skip: !session?.id }
  );
  const groups = groupsData?.results?.groups ?? [];

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
    const media = morePhotos?.results?.media;
    if (!media?.length) return;
    const newMedia = media.filter((m: any) => {
      const key = m.id ?? m.thumbnail;
      if (seenMediaRef.current.has(key)) return false;
      seenMediaRef.current.add(key);
      return true;
    });
    if (newMedia.length > 0) {
      setSessionMedia((prev) =>
        continuationToken === '' && activeGroupId ? newMedia : [...prev, ...newMedia]
      );
    }
    setContinuationToken(morePhotos?.results?.continuationToken ?? '');
  }, [morePhotos]);

  // Group filter
  const handleGroupFilter = useCallback((groupId: string | null) => {
    seenMediaRef.current = new Set();
    setSessionMedia([]);
    setContinuationToken('');
    setActiveGroupId(groupId);
  }, []);

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
        case 'download':
          await downloadSurfMedia({ photos: selectedPhotoIds }).unwrap();
          Alert.alert('Download Started', 'Your download is being prepared. You\'ll be notified when ready.');
          break;
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

  // Ellipsis menu
  const handleEllipsisMenu = useCallback(() => {
    const options: string[] = ['Share'];

    if (isOwner) {
      options.push('Download', 'Delete');
    }

    options.push(isFavorited ? 'Unfavorite Break' : 'Favorite Break');
    options.push('Cancel');
    const cancelIndex = options.length - 1;
    const destructiveIndex = isOwner ? options.indexOf('Delete') : -1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: destructiveIndex,
        },
        (buttonIndex) => {
          const selected = options[buttonIndex];
          if (selected === 'Share') handleShare();
          else if (selected === 'Download') handleStartAction('download');
          else if (selected === 'Delete') handleStartAction('delete');
          else if (selected === 'Favorite Break' || selected === 'Unfavorite Break') handleFavorite();
        }
      );
    } else {
      // Android fallback
      Alert.alert('Actions', undefined, [
        { text: 'Share', onPress: handleShare },
        ...(isOwner ? [
          { text: 'Download', onPress: () => handleStartAction('download') },
          { text: 'Delete', onPress: () => handleStartAction('delete'), style: 'destructive' as const },
        ] : []),
        { text: isFavorited ? 'Unfavorite Break' : 'Favorite Break', onPress: handleFavorite },
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }, [isOwner, isFavorited, handleShare, handleStartAction, handleFavorite]);

  // Action bar color config
  const actionColors = {
    request: { bg: 'rgba(240, 253, 244, 0.97)', bgDark: 'rgba(5, 46, 22, 0.95)', border: '#bbf7d0', borderDark: '#166534', text: '#166534', textDark: '#86efac', btn: '#22c55e' },
    download: { bg: 'rgba(239, 246, 255, 0.97)', bgDark: 'rgba(23, 37, 84, 0.95)', border: '#bfdbfe', borderDark: '#1e3a5f', text: '#1e40af', textDark: '#93c5fd', btn: '#3b82f6' },
    delete: { bg: 'rgba(254, 242, 242, 0.97)', bgDark: 'rgba(69, 10, 10, 0.95)', border: '#fecaca', borderDark: '#7f1d1d', text: '#991b1b', textDark: '#fca5a5', btn: '#ef4444' },
  };
  const ac = actionColors[sessionAction as keyof typeof actionColors] ?? actionColors.request;

  // Location display
  const showLocation = !session?.hide_location && session?.surf_break_name;

  const renderPhoto = useCallback(
    ({ item }: { item: any }) => {
      const photoGroups: any[] = item.groups ?? [];
      const isSelected = selectedPhotoIds.includes(item.id);
      const inActionMode = !!sessionAction;

      return (
        <Pressable
          onPress={() => { if (inActionMode) togglePhotoSelection(item.id); }}
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
    [sessionAction, selectedPhotoIds, togglePhotoSelection, ac.btn]
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
          headerTitle: '',
          headerStyle: { backgroundColor: isDark ? '#030712' : '#ffffff' },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={smartBack} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color="#007AFF" />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={handleEllipsisMenu} hitSlop={12} style={{ paddingRight: 4 }}>
              <Ionicons name="ellipsis-horizontal" size={22} color={isDark ? '#e5e7eb' : '#374151'} />
            </Pressable>
          ),
        }}
      />
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={[]}>
        {isLoading ? (
          <View style={styles.centered}><ActivityIndicator size="large" /></View>
        ) : (
          <FlatList
            data={sessionMedia}
            keyExtractor={(item) => item.id ?? item.thumbnail}
            renderItem={renderPhoto}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={{ padding: GAP / 2, paddingBottom: sessionAction ? 80 : 0 }}
            ListHeaderComponent={
              <View style={styles.headerWrap}>
                {/* Session name */}
                {session?.session_name && (
                  <Text style={[styles.sessionName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={2}>
                    {session.session_name}
                  </Text>
                )}

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
                  <Text style={{ color: '#9ca3af' }}>No photos</Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              loadingMore ? <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View> : null
            }
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
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
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
});
