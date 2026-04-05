import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useGetSurfBreaksQuery } from '../../../src/store';
import SearchBar from '../../../src/components/SearchBar';
import SurfBreakCard from '../../../src/components/SurfBreakCard';

export default function SurfBreaksScreen() {
  const [searchTerm, setSearchTerm] = useState('');
  const [continuationToken, setContinuationToken] = useState('');
  const [breaks, setBreaks] = useState<any[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  const { data, isLoading, isFetching } = useGetSurfBreaksQuery({
    search: searchTerm,
    limit: 20,
    continuationToken,
  });

  useEffect(() => {
    const results = data?.results?.surfBreaks ?? [];
    if (continuationToken === '') {
      // Fresh search
      seenIdsRef.current = new Set();
      const unique = results.filter((b: any) => {
        if (seenIdsRef.current.has(b.id)) return false;
        seenIdsRef.current.add(b.id);
        return true;
      });
      setBreaks(unique);
    } else {
      // Pagination
      const newBreaks = results.filter((b: any) => {
        if (seenIdsRef.current.has(b.id)) return false;
        seenIdsRef.current.add(b.id);
        return true;
      });
      if (newBreaks.length > 0) {
        setBreaks((prev) => [...prev, ...newBreaks]);
      }
    }
  }, [data]);

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
    setContinuationToken('');
  }, []);

  const handleLoadMore = useCallback(() => {
    const token = data?.results?.continuationToken;
    if (token && !isFetching) {
      setContinuationToken(token);
    }
  }, [data, isFetching]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Surf Breaks',
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950" edges={['bottom']}>
        <View className="px-4 py-3">
          <SearchBar placeholder="Search surf breaks..." onSearch={handleSearch} />
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={breaks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View className="px-4">
                <SurfBreakCard surfBreak={item} />
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center py-12">
                <Text className="text-gray-400 dark:text-gray-600">No surf breaks found</Text>
              </View>
            }
            ListFooterComponent={
              isFetching && breaks.length > 0 ? (
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
