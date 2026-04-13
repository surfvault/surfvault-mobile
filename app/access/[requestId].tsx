import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import ImageViewing from 'react-native-image-viewing';
import { useUser } from '../../src/context/UserProvider';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import {
  useGetSurfMediaAccessRequestQuery,
  useGrantSurfMediaAccessMutation,
  useSaveSurfMediaAccessRequestToVaultMutation,
} from '../../src/store';
import { getWatermarkUrl, toOriginalKey } from '../../src/helpers/mediaUrl';
import { savePhotoToCameraRoll, savePhotosToCameraRoll } from '../../src/helpers/saveToPhotos';
import UserAvatar from '../../src/components/UserAvatar';

const FETCH_AMOUNT = 30;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const GAP = 4;
const PHOTO_WIDTH = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  return new Date(dateStr.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function AccessRequestScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();

  // Data state
  const [photos, setPhotos] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const seenIdsRef = useRef(new Set<string>());

  // Lightbox
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  // API
  const { data, isLoading, isFetching } = useGetSurfMediaAccessRequestQuery(
    { requestId: requestId ?? '', limit: FETCH_AMOUNT, continuationToken },
    { skip: !requestId }
  );

  const accessRequest = data?.results?.accessRequest ?? data?.results;
  const incomingPhotos = accessRequest?.photoDetails ?? [];
  const status = accessRequest?.access_status ?? accessRequest?.status;
  const isOwner = user?.id === accessRequest?.target_user?.id;
  const isApproved = status === 'approved' || accessRequest?.access_granted;

  const requestUser = accessRequest?.request_user;
  const targetUser = accessRequest?.target_user;
  const otherUser = isOwner ? requestUser : targetUser;
  const session = accessRequest?.session;
  const surfBreak = accessRequest?.surf_break;

  const [grantAccess, { isLoading: granting }] = useGrantSurfMediaAccessMutation();
  const [saveToVault, { isLoading: savingToVault }] = useSaveSurfMediaAccessRequestToVaultMutation();

  // Hydrate photos
  useEffect(() => {
    if (!incomingPhotos?.length) return;
    const newPhotos = incomingPhotos.filter((p: any) => {
      const key = p.id ?? p.url;
      if (seenIdsRef.current.has(key)) return false;
      seenIdsRef.current.add(key);
      return true;
    });
    if (newPhotos.length > 0) {
      setPhotos((prev) => continuationToken === '' ? newPhotos : [...prev, ...newPhotos]);
    }
  }, [data]);

  // Reset on requestId change
  useEffect(() => {
    setPhotos([]);
    setContinuationToken('');
    seenIdsRef.current = new Set();
  }, [requestId]);

  const hasMore = Boolean(data?.results?.continuationToken);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isFetching) return;
    const nextToken = data?.results?.continuationToken;
    if (nextToken) setContinuationToken(nextToken);
  }, [hasMore, isFetching, data]);

  const handleGrant = useCallback(async () => {
    if (!requestId) return;
    try {
      await grantAccess({ requestId }).unwrap();
      Alert.alert('Access Granted', 'The requester can now view and save these photos.');
    } catch {
      Alert.alert('Error', 'Failed to grant access. Please try again.');
    }
  }, [requestId, grantAccess]);

  const handleSaveToVault = useCallback(async () => {
    if (!requestId) return;
    try {
      await saveToVault({ requestId }).unwrap();
      Alert.alert('Saved to Vault', `${photos.length} photo${photos.length !== 1 ? 's' : ''} saved to your vault.`);
    } catch {
      Alert.alert('Error', 'Failed to save photos. You may have exceeded your storage limit.');
    }
  }, [requestId, saveToVault, photos.length]);

  const handleSaveAllToPhotos = useCallback(async () => {
    const photoIds = photos.map((p) => p.id).filter(Boolean);
    if (!photoIds.length) return;
    setSavingAll(true);
    const result = await savePhotosToCameraRoll(photoIds);
    setSavingAll(false);
    if (result.saved === photoIds.length) {
      Alert.alert('Saved', `${result.saved} photo${result.saved > 1 ? 's' : ''} saved to your camera roll.`);
    } else if (result.saved > 0) {
      Alert.alert('Partially Saved', `${result.saved}/${photoIds.length} photos saved. ${result.failed} failed.`);
    } else {
      Alert.alert('Error', result.errors[0] ?? 'Failed to save photos.');
    }
  }, [photos]);

  // Status colors
  const statusColor = status === 'approved' || isApproved ? '#22c55e' : status === 'pending' ? '#f59e0b' : '#ef4444';
  const statusLabel = isApproved ? 'Approved' : status === 'pending' ? 'Pending' : status === 'denied' ? 'Denied' : status ?? 'Unknown';

  const renderPhoto = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <Pressable
        onPress={() => {
          setViewerIndex(index);
          setViewerVisible(true);
        }}
        onLongPress={() => {}}
        style={{ width: PHOTO_WIDTH, margin: GAP / 2 }}
      >
        <Image
          source={{ uri: item.url ?? item }}
          style={{ width: PHOTO_WIDTH, height: PHOTO_WIDTH * 1.2, borderRadius: 6 }}
          contentFit="cover"
          transition={200}
          recyclingKey={item.id}
        />
      </Pressable>
    ),
    []
  );

  const listHeader = (
    <View style={s.headerWrap}>
      {/* Status badge */}
      <View style={[s.statusBadge, { backgroundColor: statusColor + '20' }]}>
        <View style={[s.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>

      {/* Photo count */}
      <Text style={[s.title, { color: isDark ? '#fff' : '#111827' }]}>
        {photos.length} photo{photos.length !== 1 ? 's' : ''} requested
      </Text>

      {/* Other user */}
      {otherUser && (
        <Pressable
          onPress={() => otherUser.handle && trackedPush(`/user/${otherUser.handle}`)}
          style={s.userRow}
        >
          <UserAvatar uri={otherUser.profile_photo} size={32} />
          <View style={{ marginLeft: 8 }}>
            <Text style={[s.userLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
              {isOwner ? 'Requested by' : 'From'}
            </Text>
            <Text style={[s.userHandle, { color: isDark ? '#fff' : '#111827' }]}>
              @{otherUser.handle}
            </Text>
          </View>
        </Pressable>
      )}

      {/* Session info */}
      {session && (
        <Pressable
          onPress={() => accessRequest?.session_id && trackedPush(`/session/${accessRequest.session_id}`)}
          style={s.metaRow}
        >
          <Ionicons name="camera-outline" size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
          <View style={{ marginLeft: 8 }}>
            <Text style={[s.metaLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>Session</Text>
            <Text style={[s.metaValue, { color: '#0ea5e9' }]}>{session.name}</Text>
            {session.date && (
              <Text style={[s.metaLabel, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
                {formatDate(session.date)}
              </Text>
            )}
          </View>
        </Pressable>
      )}

      {/* Surf break */}
      {surfBreak ? (
        <Pressable
          onPress={() =>
            trackedPush(`/break/${surfBreak.country_code}/${surfBreak.region || '0'}/${surfBreak.identifier}`)
          }
          style={s.metaRow}
        >
          <Ionicons name="location-outline" size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
          <View style={{ marginLeft: 8 }}>
            <Text style={[s.metaLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>Surf break</Text>
            <Text style={[s.metaValue, { color: '#0ea5e9' }]}>{surfBreak.name}</Text>
            {(surfBreak.region || surfBreak.country_code) && (
              <Text style={[s.metaLabel, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
                {[surfBreak.region?.replaceAll('_', ' '), surfBreak.country_code?.toUpperCase()].filter(Boolean).join(', ')}
              </Text>
            )}
          </View>
        </Pressable>
      ) : session?.hide_location ? (
        <View style={s.metaRow}>
          <Ionicons name="eye-off-outline" size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
          <View style={{ marginLeft: 8 }}>
            <Text style={[s.metaLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>Surf break</Text>
            <Text style={[s.metaLabel, { color: isDark ? '#4b5563' : '#9ca3af', fontStyle: 'italic' }]}>
              Hidden location
            </Text>
          </View>
        </View>
      ) : null}

      {/* Actions */}
      <View style={s.actionsCol}>
        {isOwner && (status === 'pending' || !isApproved) && (
          <Pressable onPress={handleGrant} disabled={granting} style={[s.actionBtn, { backgroundColor: '#22c55e' }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={s.actionBtnText}>{granting ? 'Granting...' : isApproved ? 'Re-Grant Access' : 'Grant Access'}</Text>
          </Pressable>
        )}

        {!isOwner && isApproved && (
          <>
            <Pressable onPress={handleSaveToVault} disabled={savingToVault} style={[s.actionBtn, { backgroundColor: '#0ea5e9' }]}>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={s.actionBtnText}>{savingToVault ? 'Saving...' : 'Save to Vault'}</Text>
            </Pressable>
            <Pressable onPress={handleSaveAllToPhotos} disabled={savingAll} style={[s.actionBtn, { backgroundColor: '#38bdf8' }]}>
              {savingAll ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="download-outline" size={18} color="#fff" />
              )}
              <Text style={s.actionBtnText}>{savingAll ? 'Saving...' : 'Save to Photos'}</Text>
            </Pressable>
          </>
        )}

        {!isOwner && !isApproved && status === 'pending' && (
          <Text style={[s.waitingText, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            Waiting for approval. You'll receive a message when access is granted.
          </Text>
        )}

        {isOwner && isApproved && (
          <View style={[s.grantedBanner, { backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : '#f0fdf4' }]}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={{ color: '#22c55e', fontSize: 13, fontWeight: '500', marginLeft: 6 }}>
              Access granted
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Photo Request"
        left={
          <Pressable onPress={smartBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color="#007AFF" />
          </Pressable>
        }
      />
      <SafeAreaView style={[s.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={[]}>
        {isLoading && !photos.length ? (
          <View style={s.loadingWrap}><ActivityIndicator size="large" /></View>
        ) : (
          <FlatList
            data={photos}
            keyExtractor={(item: any) => item.id ?? item.url ?? String(Math.random())}
            numColumns={NUM_COLUMNS}
            renderItem={renderPhoto}
            contentContainerStyle={{ padding: GAP / 2 }}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              !isFetching ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="images-outline" size={40} color={isDark ? '#374151' : '#d1d5db'} />
                  <Text style={{ color: '#9ca3af', marginTop: 8, fontSize: 14 }}>No photos</Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              hasMore ? (
                <Pressable onPress={handleLoadMore} disabled={isFetching} style={s.loadMoreBtn}>
                  {isFetching ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={s.loadMoreText}>Load More</Text>
                  )}
                </Pressable>
              ) : null
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      {/* Photo lightbox — watermarked previews */}
      <ImageViewing
        images={photos.map((p) => ({
          uri: getWatermarkUrl(p.original_s3_key || toOriginalKey(p.url) || ''),
        }))}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        onImageIndexChange={setViewerIndex}
        FooterComponent={({ imageIndex }) => (
          <View style={s.viewerFooter}>
            <Pressable
              onPress={async () => {
                const photo = photos[imageIndex];
                if (!photo?.id || savingPhoto) return;
                setSavingPhoto(true);
                const result = await savePhotoToCameraRoll(photo.id);
                setSavingPhoto(false);
                if (result.success) {
                  Alert.alert('Saved', 'Photo saved to your camera roll.');
                } else {
                  Alert.alert('Error', result.error ?? 'Failed to save photo.');
                }
              }}
              disabled={savingPhoto}
              style={s.viewerSaveBtn}
            >
              {savingPhoto ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="download-outline" size={22} color="#ffffff" />
              )}
              <Text style={s.viewerSaveText}>
                {savingPhoto ? 'Saving...' : 'Save to Photos'}
              </Text>
            </Pressable>
          </View>
        )}
      />
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700' },
  userRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
  },
  userLabel: { fontSize: 11 },
  userHandle: { fontSize: 14, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginTop: 12,
  },
  metaLabel: { fontSize: 11 },
  metaValue: { fontSize: 14, fontWeight: '600' },
  actionsCol: { marginTop: 16, gap: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  waitingText: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  grantedBanner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
  },
  loadMoreBtn: {
    alignSelf: 'center', backgroundColor: '#6b7280',
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999,
    marginVertical: 16,
  },
  loadMoreText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  viewerFooter: {
    alignItems: 'center', paddingBottom: 50, paddingTop: 12,
  },
  viewerSaveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 999,
  },
  viewerSaveText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});
