import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useGetPhotographersQuery } from '../../../src/store';
import PhotographerCard from '../../../src/components/PhotographerCard';

const CONTINENTS = [
  { label: 'All', value: '' },
  { label: 'North America', value: 'North America' },
  { label: 'South America', value: 'South America' },
  { label: 'Europe', value: 'Europe' },
  { label: 'Africa', value: 'Africa' },
  { label: 'Asia', value: 'Asia' },
  { label: 'Oceania', value: 'Oceania' },
];

export default function PhotographersScreen() {
  const [continent, setContinent] = useState('');

  const { data, isLoading } = useGetPhotographersQuery({ continent });
  const photographers = data?.results?.photographers ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Photographers',
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={['bottom']}>
        {/* Continent filter */}
        <FlatList
          data={CONTINENTS}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setContinent(item.value)}
              className={`mr-2 rounded-full px-4 py-2 ${
                continent === item.value
                  ? 'bg-sky-500'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  continent === item.value
                    ? 'text-white'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {item.label}
              </Text>
            </Pressable>
          )}
        />

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={photographers}
            keyExtractor={(item: any) => item.id ?? item.handle}
            renderItem={({ item }) => (
              <View className="px-4">
                <PhotographerCard photographer={item} />
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center py-12">
                <Text className="text-gray-400 dark:text-gray-600">
                  No photographers found
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </>
  );
}
