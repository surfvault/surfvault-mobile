import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MapScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Map
        </Text>
        <Text className="text-gray-400 dark:text-gray-600 text-center">
          Interactive world map with surf break markers coming in Phase 3
        </Text>
      </View>
    </SafeAreaView>
  );
}
