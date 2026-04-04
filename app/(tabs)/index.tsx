import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-4 pt-4 pb-2">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Discover
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Find surf breaks and photographers near you
          </Text>
        </View>

        {/* Placeholder sections — Phase 2 */}
        <View className="px-4 py-8 items-center">
          <Text className="text-gray-400 dark:text-gray-600">
            Nearby surf breaks, photographers, and search coming in Phase 2
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
