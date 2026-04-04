import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useDispatch } from 'react-redux';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { setCoordinates } from '../../src/store/slices/location';
import {
  useGetLatestSessionsQuery,
  useGetNearbySurfBreaksQuery,
  useGetNearbyPhotographersQuery,
  useGetSurfBreaksQuery,
  useGetPopularTagsQuery,
} from '../../src/store';
import { useUser } from '../../src/context/UserProvider';
import SessionCard from '../../src/components/SessionCard';
import SearchBar from '../../src/components/SearchBar';
import SurfBreakCard from '../../src/components/SurfBreakCard';
import PhotographerCard from '../../src/components/PhotographerCard';

export default function HomeScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();

  // Bottom sheet
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['85%'], []);

  // Location
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const newCoords = { lat: loc.coords.latitude, lon: loc.coords.longitude };
        setCoords(newCoords);
        dispatch(setCoordinates(newCoords));
      }
    })();
  }, []);

  // ---- Discover Feed (latest sessions) ----
  const [sessions, setSessions] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const seenIdsRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const isFetchingMoreRef = useRef(false);

  const { data: sessionsData, isLoading, isFetching } = useGetLatestSessionsQuery({
    userId: user?.id,
    limit: 10,
    continuationToken,
  });

  useEffect(() => {
    const results = sessionsData?.results;
    if (!results) return;

    const incoming = Array.isArray(results.sessions) ? results.sessions : [];
    const nextToken = results.continuationToken || '';

    hasMoreRef.current = Boolean(nextToken);

    if (!incoming.length) {
      isFetchingMoreRef.current = false;
      return;
    }

    setSessions((prev) => {
      const newItems: any[] = [];
      for (const s of incoming) {
        const id = s?.session_id ?? s?.id;
        if (!id) continue;
        if (!seenIdsRef.current.has(id)) {
          seenIdsRef.current.add(id);
          newItems.push(s);
        }
      }
      if (!newItems.length) return prev;
      return prev.concat(newItems);
    });

    isFetchingMoreRef.current = false;
  }, [sessionsData]);

  const handleLoadMore = useCallback(() => {
    if (!hasMoreRef.current || isFetchingMoreRef.current) return;
    const nextToken = sessionsData?.results?.continuationToken;
    if (!nextToken) return;

    isFetchingMoreRef.current = true;
    setContinuationToken(nextToken);
  }, [sessionsData]);

  const handleRefresh = useCallback(() => {
    seenIdsRef.current = new Set();
    setSessions([]);
    setContinuationToken('');
    hasMoreRef.current = false;
    isFetchingMoreRef.current = false;
  }, []);

  // ---- Search drawer state ----
  const [searchTerm, setSearchTerm] = useState('');

  const { data: nearbyBreaksData } = useGetNearbySurfBreaksQuery(
    { lat: coords?.lat ?? 0, long: coords?.lon ?? 0 },
    { skip: !coords }
  );
  const { data: nearbyPhotographersData } = useGetNearbyPhotographersQuery(
    { lat: coords?.lat ?? 0, long: coords?.lon ?? 0 },
    { skip: !coords }
  );
  const { data: searchData, isFetching: searchLoading } = useGetSurfBreaksQuery(
    { search: searchTerm, limit: 10, continuationToken: '' },
    { skip: searchTerm.length < 2 }
  );
  const { data: tagsData } = useGetPopularTagsQuery(undefined);

  const nearbyBreaks = nearbyBreaksData?.results?.surfBreaks ?? [];
  const nearbyPhotographers = nearbyPhotographersData?.results?.photographers ?? [];
  const searchResults = searchData?.results?.surfBreaks ?? [];
  const popularTags = tagsData?.results?.tags ?? [];

  const openSearch = useCallback(() => {
    bottomSheetRef.current?.expand();
  }, []);

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Discover
          </Text>
          <Pressable onPress={openSearch} hitSlop={8}>
            <Ionicons
              name="search-outline"
              size={24}
              color={isDark ? '#e5e7eb' : '#374151'}
            />
          </Pressable>
        </View>

        {/* Session feed */}
        {isLoading && sessions.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.session_id ?? item.id}
            renderItem={({ item }) => (
              <View className="px-4">
                <SessionCard session={item} />
              </View>
            )}
            ListEmptyComponent={
              !isLoading ? (
                <View className="items-center py-20">
                  <Text className="text-gray-400 dark:text-gray-600 text-base">
                    No sessions yet
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              isFetching && sessions.length > 0 ? (
                <View className="py-6">
                  <ActivityIndicator />
                </View>
              ) : null
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Search / Explore Bottom Sheet */}
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose
          backgroundStyle={{
            backgroundColor: isDark ? '#111827' : '#ffffff',
          }}
          handleIndicatorStyle={{
            backgroundColor: isDark ? '#4b5563' : '#d1d5db',
          }}
        >
          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Search */}
            <View className="px-4 pb-4">
              <SearchBar
                placeholder="Search surf breaks..."
                onSearch={handleSearch}
                debounceMs={350}
              />
            </View>

            {/* Search results */}
            {searchTerm.length >= 2 ? (
              <View className="px-4">
                {searchLoading ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator />
                  </View>
                ) : searchResults.length > 0 ? (
                  searchResults.map((item: any) => (
                    <SurfBreakCard key={item.id} surfBreak={item} />
                  ))
                ) : (
                  <Text className="text-gray-400 text-center py-8">
                    No results found
                  </Text>
                )}
              </View>
            ) : (
              <>
                {/* Nearby Surf Breaks */}
                {nearbyBreaks.length > 0 && (
                  <View className="mb-6">
                    <Text className="text-lg font-bold text-gray-900 dark:text-white px-4 mb-3">
                      Nearby Surf Breaks
                    </Text>
                    <FlatList
                      data={nearbyBreaks}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16 }}
                      keyExtractor={(item: any) => item.id}
                      renderItem={({ item }) => (
                        <SurfBreakCard surfBreak={item} compact />
                      )}
                      scrollEnabled={true}
                      nestedScrollEnabled={true}
                    />
                  </View>
                )}

                {/* Nearby Photographers */}
                {nearbyPhotographers.length > 0 && (
                  <View className="mb-6">
                    <Text className="text-lg font-bold text-gray-900 dark:text-white px-4 mb-3">
                      Nearby Photographers
                    </Text>
                    <FlatList
                      data={nearbyPhotographers}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16 }}
                      keyExtractor={(item: any) => item.id ?? item.handle}
                      renderItem={({ item }) => (
                        <PhotographerCard photographer={item} compact />
                      )}
                      scrollEnabled={true}
                      nestedScrollEnabled={true}
                    />
                  </View>
                )}

                {/* Popular Tags */}
                {popularTags.length > 0 && (
                  <View className="mb-6 px-4">
                    <Text className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                      Popular Tags
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {popularTags.map((tag: any) => (
                        <Pressable
                          key={tag.tag ?? tag}
                          className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-full px-3 py-1.5"
                        >
                          <Text className="text-sky-600 dark:text-sky-400 text-sm">
                            {tag.tag ?? tag}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {/* Browse links */}
                <View className="px-4">
                  <Text className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                    Browse
                  </Text>
                  <Pressable
                    onPress={() => {
                      bottomSheetRef.current?.close();
                      router.push('/home/surf-breaks');
                    }}
                    className="flex-row items-center justify-between py-4 border-b border-gray-100 dark:border-gray-800"
                  >
                    <View className="flex-row items-center">
                      <Ionicons name="location-outline" size={20} color={isDark ? '#9ca3af' : '#6b7280'} />
                      <Text className="text-base text-gray-900 dark:text-white ml-3">
                        Surf Breaks
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      bottomSheetRef.current?.close();
                      router.push('/home/photographers');
                    }}
                    className="flex-row items-center justify-between py-4 border-b border-gray-100 dark:border-gray-800"
                  >
                    <View className="flex-row items-center">
                      <Ionicons name="camera-outline" size={20} color={isDark ? '#9ca3af' : '#6b7280'} />
                      <Text className="text-base text-gray-900 dark:text-white ml-3">
                        Photographers
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </Pressable>
                </View>
              </>
            )}
          </BottomSheetScrollView>
        </BottomSheet>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
