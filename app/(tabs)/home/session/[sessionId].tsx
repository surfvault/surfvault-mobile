import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Dimensions,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../../../src/context/UserProvider';
import {
  useGetSessionQuery,
  useGetSessionPhotosQuery,
  useGetSessionGroupsQuery,
} from '../../../../src/store';
import UserAvatar from '../../../../src/components/UserAvatar';

const FETCH_AMOUNT = 30;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const GAP = 4;
const PHOTO_WIDTH = (SCREEN_WIDTH - GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

export default function SessionDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { user } = useUser();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [sessionMedia, setSessionMedia] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const seenMediaRef = useRef(new Set<string>());

  // Session data (includes first page of photos)
  const { data: sessionData, isLoading } = useGetSessionQuery({
    sessionId: sessionId ?? '',
    userId: user?.id,
    limit: FETCH_AMOUNT,
  });

  const session = sessionData?.results?.session;
  const initialMedia = sessionData?.results?.media ?? [];
  const initialToken = sessionData?.results?.continuationToken ?? '';

  // Groups
  const { data: groupsData } = useGetSessionGroupsQuery(
    { sessionId: session?.id ?? '' },
    { skip: !session?.id }
  );
  const groups = groupsData?.results?.groups ?? [];

  // Load initial media
  useEffect(() => {
    if (initialMedia.length > 0) {
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
  }, [sessionData]);

  // Paginated photos
  const { data: morePhotos, isFetching: loadingMore } = useGetSessionPhotosQuery(
    {
      sessionId: session?.id ?? '',
      limit: FETCH_AMOUNT,
      continuationToken,
      groupId: activeGroupId ?? '',
      viewerId: user?.id,
    },
    { skip: !session?.id || (!continuationToken && !activeGroupId) }
  );

  useEffect(() => {
    if (morePhotos?.results?.media?.length) {
      const newMedia = morePhotos.results.media.filter((m: any) => {
        const key = m.id ?? m.thumbnail;
        if (seenMediaRef.current.has(key)) return false;
        seenMediaRef.current.add(key);
        return true;
      });
      if (newMedia.length > 0) {
        setSessionMedia((prev) => [...prev, ...newMedia]);
      }
      setContinuationToken(morePhotos.results.continuationToken ?? '');
    }
  }, [morePhotos]);

  // Group filter handler — batched state updates, no useEffect on activeGroupId
  const handleGroupFilter = useCallback((groupId: string | null) => {
    setActiveGroupId(groupId);
    setContinuationToken('');
    seenMediaRef.current = new Set();
    setSessionMedia([]);
  }, []);

  const renderPhoto = useCallback(
    ({ item }: { item: any }) => (
      <Pressable
        style={{
          width: PHOTO_WIDTH,
          margin: GAP / 2,
        }}
      >
        <Image
          source={{ uri: item.thumbnail ?? item.url }}
          style={{
            width: PHOTO_WIDTH,
            height: PHOTO_WIDTH * 1.2,
            borderRadius: 6,
          }}
          contentFit="cover"
          transition={200}
          recyclingKey={item.id}
        />
      </Pressable>
    ),
    []
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: session?.session_name ?? 'Session',
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['bottom']}>
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={sessionMedia}
            keyExtractor={(item) => item.id ?? item.thumbnail}
            renderItem={renderPhoto}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={{ padding: GAP / 2 }}
            ListHeaderComponent={
              <View className="px-3 pt-2 pb-3">
                {/* Photographer info */}
                {session && (
                  <View className="flex-row items-center mb-3">
                    <UserAvatar
                      uri={session.user_picture}
                      name={session.user_name ?? session.handle}
                      size={36}
                    />
                    <View className="ml-2">
                      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                        {session.user_name ?? session.handle}
                      </Text>
                      {session.surf_break_name && !session.hide_location && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {session.surf_break_name}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {/* Group filter chips */}
                {groups.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mb-3">
                    <Pressable
                      onPress={() => handleGroupFilter(null)}
                      className={`rounded-full px-3 py-1.5 ${
                        !activeGroupId
                          ? 'bg-gray-900 dark:bg-white'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          !activeGroupId
                            ? 'text-white dark:text-gray-900'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        All
                      </Text>
                    </Pressable>
                    {groups.map((group: any) => (
                      <Pressable
                        key={group.id}
                        onPress={() => handleGroupFilter(group.id)}
                        style={{
                          backgroundColor:
                            activeGroupId === group.id
                              ? group.color
                              : isDark
                              ? '#1f2937'
                              : '#f3f4f6',
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}
                      >
                        <Text
                          className={`text-xs font-medium ${
                            activeGroupId === group.id
                              ? 'text-white'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {group.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            }
            ListEmptyComponent={
              !isLoading ? (
                <View className="items-center py-12">
                  <Text className="text-gray-400 dark:text-gray-600">No photos</Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              loadingMore ? (
                <View className="py-4">
                  <ActivityIndicator />
                </View>
              ) : null
            }
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </>
  );
}
