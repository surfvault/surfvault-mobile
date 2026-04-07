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
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../src/context/UserProvider';
import {
  useGetSurfMediaAccessRequestQuery,
  useGrantSurfMediaAccessMutation,
  useSaveSurfMediaAccessRequestToVaultMutation,
  useDownloadSurfMediaAccessRequestPhotosMutation,
} from '../../src/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const GAP = 2;
const PHOTO_SIZE = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

export default function AccessRequestScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();

  const { data, isLoading } = useGetSurfMediaAccessRequestQuery(
    { requestId: requestId ?? '', limit: 50, continuationToken: '' },
    { skip: !requestId }
  );

  const request = data?.results?.request ?? data?.results;
  const photos = request?.photos ?? [];
  const status = request?.access_status ?? request?.status;
  const isOwner = user?.id === request?.photographer_id;

  const [grantAccess, { isLoading: granting }] = useGrantSurfMediaAccessMutation();
  const [saveToVault, { isLoading: saving }] = useSaveSurfMediaAccessRequestToVaultMutation();
  const [downloadPhotos] = useDownloadSurfMediaAccessRequestPhotosMutation();

  const handleGrant = useCallback(async () => {
    if (!requestId) return;
    try {
      await grantAccess({ requestId }).unwrap();
      Alert.alert('Access Granted', 'The requester can now view these photos.');
    } catch {
      Alert.alert('Error', 'Failed to grant access. Please try again.');
    }
  }, [requestId, grantAccess]);

  const handleSaveToVault = useCallback(async () => {
    if (!requestId) return;
    try {
      await saveToVault({ requestId }).unwrap();
      Alert.alert('Saved', 'Photos have been saved to your vault.');
    } catch {
      Alert.alert('Error', 'Failed to save photos. You may have exceeded your storage limit.');
    }
  }, [requestId, saveToVault]);

  const statusColor = status === 'approved' ? '#22c55e' : status === 'pending' ? '#f59e0b' : '#ef4444';
  const statusLabel = status === 'approved' ? 'Approved' : status === 'pending' ? 'Pending' : status ?? 'Unknown';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Photo Request',
          headerStyle: { backgroundColor: isDark ? '#030712' : '#ffffff' },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color="#007AFF" />
            </Pressable>
          ),
        }}
      />
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={[]}>
        {isLoading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" /></View>
        ) : (
          <FlatList
            data={photos}
            keyExtractor={(item: any) => item.id ?? item.s3_key}
            numColumns={NUM_COLUMNS}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item.thumbnail ?? item.url }}
                style={{ width: PHOTO_SIZE, height: PHOTO_SIZE, margin: GAP / 2 }}
                contentFit="cover"
              />
            )}
            contentContainerStyle={{ padding: GAP / 2 }}
            ListHeaderComponent={
              <View style={styles.headerWrap}>
                {/* Status badge */}
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>

                <Text style={[styles.title, { color: isDark ? '#fff' : '#111827' }]}>
                  {photos.length} photo{photos.length !== 1 ? 's' : ''} requested
                </Text>

                {request?.requester_handle && (
                  <Text style={[styles.subtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                    {isOwner ? `Requested by @${request.requester_handle}` : `From @${request.photographer_handle}`}
                  </Text>
                )}

                {/* Actions */}
                <View style={styles.actionsRow}>
                  {isOwner && status === 'pending' && (
                    <Pressable onPress={handleGrant} disabled={granting} style={[styles.actionBtn, { backgroundColor: '#22c55e' }]}>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>{granting ? 'Granting...' : 'Grant Access'}</Text>
                    </Pressable>
                  )}
                  {!isOwner && status === 'approved' && (
                    <Pressable onPress={handleSaveToVault} disabled={saving} style={[styles.actionBtn, { backgroundColor: '#0ea5e9' }]}>
                      <Ionicons name="download-outline" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>{saving ? 'Saving...' : 'Save to Vault'}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ color: '#9ca3af' }}>No photos</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
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
  subtitle: { fontSize: 14, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
