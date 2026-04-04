import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MessagesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Messages
        </Text>
        <Text className="text-gray-400 dark:text-gray-600 text-center">
          Direct messaging coming in Phase 4
        </Text>
      </View>
    </SafeAreaView>
  );
}
