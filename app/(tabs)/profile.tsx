import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useUser } from '../../src/context/UserProvider';
import { useAuth } from '../../src/context/AuthProvider';

export default function ProfileScreen() {
  const { user } = useUser();
  const { isAuthenticated, login, logout } = useAuth();

  // Not logged in — show sign in prompt
  if (!isAuthenticated) {
    return (
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 bg-sky-500 rounded-2xl items-center justify-center mb-6">
            <Text className="text-white text-3xl font-bold">SV</Text>
          </View>
          <Text className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Sign in to SurfVault
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
            Upload photos, follow photographers, message surfers, and more
          </Text>
          <Pressable
            onPress={login}
            className="w-full bg-sky-500 active:bg-sky-600 rounded-xl py-4 items-center mb-3"
          >
            <Text className="text-white text-lg font-semibold">Sign In</Text>
          </Pressable>
          <Pressable
            onPress={login}
            className="w-full border border-sky-500 rounded-xl py-4 items-center"
          >
            <Text className="text-sky-500 text-lg font-semibold">Create Account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
      <ScrollView className="flex-1">
        <View className="items-center pt-8 pb-4">
          {user?.picture ? (
            <Image
              source={{ uri: user.picture }}
              className="w-24 h-24 rounded-full"
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-sky-500 items-center justify-center">
              <Text className="text-white text-3xl font-bold">
                {user?.name?.[0] ?? user?.handle?.[0] ?? '?'}
              </Text>
            </View>
          )}

          <Text className="text-xl font-bold text-gray-900 dark:text-white mt-4">
            {user?.name ?? user?.handle ?? 'Loading...'}
          </Text>

          {user?.handle && (
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              @{user.handle}
            </Text>
          )}

          {user?.bio && (
            <Text className="text-sm text-gray-600 dark:text-gray-300 text-center px-8 mt-2">
              {user.bio}
            </Text>
          )}
        </View>

        {/* Stats row */}
        <View className="flex-row justify-center gap-8 py-4 border-t border-b border-gray-200 dark:border-gray-800 mx-4">
          <View className="items-center">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              {user?.follower_count ?? 0}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">Followers</Text>
          </View>
          <View className="items-center">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              {user?.following_count ?? 0}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">Following</Text>
          </View>
          <View className="items-center">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              {user?.my_spots?.length ?? 0}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">Spots</Text>
          </View>
        </View>

        {/* Menu items */}
        <View className="px-4 pt-4">
          {[
            { label: 'Notifications' },
            { label: 'Favorites' },
            { label: 'Reports' },
            { label: 'Plans' },
            { label: 'Settings' },
          ].map((item) => (
            <Pressable
              key={item.label}
              className="flex-row items-center py-4 border-b border-gray-100 dark:border-gray-800"
            >
              <Text className="flex-1 text-base text-gray-900 dark:text-white">
                {item.label}
              </Text>
              <Text className="text-gray-400">{'>'}</Text>
            </Pressable>
          ))}
        </View>

        {/* Logout */}
        <View className="px-4 pt-8 pb-12">
          <Pressable
            onPress={logout}
            className="bg-red-50 dark:bg-red-900/20 rounded-xl py-4 items-center"
          >
            <Text className="text-red-500 font-semibold">Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
