import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../../../../src/context/UserProvider';
import {
  useGetSurfBreakWithLatestSessionsQuery,
  useGetSurfBreakSessionsQuery,
} from '../../../../../src/store';
import SessionCard from '../../../../../src/components/SessionCard';

export default function SurfBreakDetailScreen() {
  const { country, region, surfBreak } = useLocalSearchParams<{
    country: string;
    region: string;
    surfBreak: string;
  }>();
  const router = useRouter();
  const { user } = useUser();

  const [continuationToken, setContinuationToken] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  // Initial data
  const { data: initialData, isLoading } = useGetSurfBreakWithLatestSessionsQuery({
    userId: user?.id,
    country: country ?? '',
    region: region ?? '',
    surfBreak: surfBreak ?? '',
  });

  const breakData = initialData?.results?.surfBreak;
  const initialSessions = initialData?.results?.sessions ?? [];
  const initialToken = initialData?.results?.continuationToken ?? '';

  // Load initial sessions
  useEffect(() => {
    if (initialSessions.length > 0) {
      seenIdsRef.current = new Set();
      const unique = initialSessions.filter((s: any) => {
        const key = s.session_id ?? s.id;
        if (seenIdsRef.current.has(key)) return false;
        seenIdsRef.current.add(key);
        return true;
      });
      setSessions(unique);
      setContinuationToken(initialToken);
    }
  }, [initialData]);

  // Pagination
  const { data: moreData, isFetching: loadingMore } = useGetSurfBreakSessionsQuery(
    { surfBreakId: breakData?.id ?? '', limit: 10, continuationToken },
    { skip: !continuationToken || !breakData?.id }
  );

  useEffect(() => {
    if (moreData?.results?.sessions?.length) {
      const newSessions = moreData.results.sessions.filter((s: any) => {
        const key = s.session_id ?? s.id;
        if (seenIdsRef.current.has(key)) return false;
        seenIdsRef.current.add(key);
        return true;
      });
      if (newSessions.length > 0) {
        setSessions((prev) => [...prev, ...newSessions]);
      }
      setContinuationToken(moreData.results.continuationToken ?? '');
    }
  }, [moreData]);

  const handleLoadMore = useCallback(() => {
    // continuationToken triggers the query automatically
  }, []);

  const breakName = breakData?.name ?? surfBreak?.replace(/-/g, ' ') ?? '';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: breakName,
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
            data={sessions}
            keyExtractor={(item) => item.session_id ?? item.id}
            renderItem={({ item }) => (
              <View className="px-4">
                <SessionCard session={item} />
              </View>
            )}
            ListHeaderComponent={
              breakData ? (
                <View className="px-4 pt-4 pb-2">
                  <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                    {breakData.name}
                  </Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {breakData.region}, {breakData.country}
                  </Text>
                  <View className="h-px bg-gray-200 dark:bg-gray-800 my-4" />
                  <Text className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                    Sessions
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View className="items-center py-12">
                <Text className="text-gray-400 dark:text-gray-600">
                  No sessions yet at this break
                </Text>
              </View>
            }
            ListFooterComponent={
              loadingMore ? (
                <View className="py-4">
                  <ActivityIndicator />
                </View>
              ) : null
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </>
  );
}
