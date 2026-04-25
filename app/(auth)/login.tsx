import { View, Text, Pressable, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../../src/context/AuthProvider';

export default function LoginScreen() {
  const { login, isLoading } = useAuth();
  const colorScheme = useColorScheme();

  return (
    <View className="flex-1 items-center justify-center bg-white dark:bg-black px-8">
      {/* Logo placeholder — replace with actual SurfVault logo */}
      <View className="w-24 h-24 bg-sky-500 rounded-2xl items-center justify-center mb-8">
        <Text className="text-white text-4xl font-bold">SV</Text>
      </View>

      <Text className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        SurfVault
      </Text>
      <Text className="text-base text-gray-500 dark:text-gray-400 text-center mb-12">
        Discover and share surf session photos
      </Text>

      <Pressable
        onPress={login}
        disabled={isLoading}
        className="w-full bg-sky-500 active:bg-sky-600 rounded-xl py-4 items-center mb-4"
      >
        <Text className="text-white text-lg font-semibold">
          {isLoading ? 'Loading...' : 'Sign In'}
        </Text>
      </Pressable>

      <Pressable
        onPress={login}
        disabled={isLoading}
        className="w-full border border-sky-500 rounded-xl py-4 items-center"
      >
        <Text className="text-sky-500 text-lg font-semibold">
          Create Account
        </Text>
      </Pressable>
    </View>
  );
}
