import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../../../src/context/UserProvider';
import { useRequireAuth } from '../../../../src/hooks/useRequireAuth';
import {
  useGetUserQuery,
  useGetUserSessionsQuery,
  useFollowUserMutation,
} from '../../../../src/store';
import UserAvatar from '../../../../src/components/UserAvatar';
import SessionCard from '../../../../src/components/SessionCard';

const isNoteActive = (setAt?: string): boolean => {
  if (!setAt) return false;
  return Date.now() - new Date(setAt).getTime() < 7 * 24 * 60 * 60 * 1000;
};

export default function UserProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const { user: currentUser } = useUser();
  const requireAuth = useRequireAuth();

  const [sessions, setSessions] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const seenIdsRef = useRef(new Set<string>());

  const isSelf = currentUser?.handle === handle;

  // Profile data
  const { data: userData, isLoading } = useGetUserQuery({
    handle: handle ?? '',
    viewerId: currentUser?.id,
  });
  const profile = userData?.results;

  // Sessions
  const { data: sessionsData } = useGetUserSessionsQuery({
    handle: handle ?? '',
    selfFlag: isSelf,
    limit: 10,
    continuationToken: '',
  });

  useEffect(() => {
    const sessionsList = sessionsData?.results?.sessions ?? [];
    if (sessionsList.length > 0) {
      seenIdsRef.current = new Set();
      const unique = sessionsList.filter((s: any) => {
        const key = s.session_id ?? s.id;
        if (seenIdsRef.current.has(key)) return false;
        seenIdsRef.current.add(key);
        return true;
      });
      setSessions(unique);
      setContinuationToken(sessionsData?.results?.continuationToken ?? '');
    }
  }, [sessionsData]);

  // Follow
  const [followUser] = useFollowUserMutation();
  const handleFollow = useCallback(() => {
    if (!requireAuth()) return;
    if (!profile?.id) return;
    const action = profile.isFollowing ? 'unfollow' : 'follow';
    followUser({ userId: profile.id, action });
  }, [profile, requireAuth, followUser]);

  const hasActiveNote =
    !!profile?.status_note && isNoteActive(profile?.status_note_set_at);

  const ProfileHeader = () => (
    <View className="px-4 pt-4">
      {/* Avatar + name */}
      <View className="items-center mb-4">
        <UserAvatar
          uri={profile?.picture}
          name={profile?.name ?? profile?.handle}
          size={80}
          active={profile?.active}
          verified={profile?.verified}
          hasStatusNote={hasActiveNote}
        />
        <Text className="text-xl font-bold text-gray-900 dark:text-white mt-3">
          {profile?.name ?? handle}
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          @{profile?.handle ?? handle}
        </Text>

        {/* Active status */}
        {profile?.active && (
          <View className="bg-green-100 dark:bg-green-900/30 rounded-full px-3 py-1 mt-2">
            <Text className="text-green-600 dark:text-green-400 text-xs font-medium">
              Currently shooting
            </Text>
          </View>
        )}

        {/* Status note */}
        {hasActiveNote && (
          <View className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-xl px-4 py-2 mt-3 max-w-[280px]">
            <Text className="text-sm text-sky-700 dark:text-sky-300 text-center">
              {profile?.status_note}
            </Text>
          </View>
        )}
      </View>

      {/* Bio */}
      {profile?.bio && (
        <Text className="text-sm text-gray-600 dark:text-gray-300 text-center mb-4">
          {profile.bio}
        </Text>
      )}

      {/* Stats */}
      <View className="flex-row justify-center gap-8 py-3 border-t border-b border-gray-200 dark:border-gray-800 mb-4">
        <View className="items-center">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            {profile?.surfBreaksCount ?? 0}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">Spots</Text>
        </View>
        <View className="items-center">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            {profile?.followersCount ?? 0}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">Followers</Text>
        </View>
        <View className="items-center">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            {profile?.followingCount ?? 0}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">Following</Text>
        </View>
      </View>

      {/* Action buttons */}
      {!isSelf && profile && (
        <View className="flex-row gap-3 mb-4">
          <Pressable
            onPress={handleFollow}
            className={`flex-1 rounded-xl py-3 items-center ${
              profile.isFollowing
                ? 'bg-gray-100 dark:bg-gray-800'
                : 'bg-sky-500 active:bg-sky-600'
            }`}
          >
            <Text
              className={`font-semibold ${
                profile.isFollowing
                  ? 'text-gray-900 dark:text-white'
                  : 'text-white'
              }`}
            >
              {profile.isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!requireAuth()) return;
              // TODO: Navigate to conversation
            }}
            className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl py-3 items-center"
          >
            <Text className="font-semibold text-gray-900 dark:text-white">Message</Text>
          </Pressable>
        </View>
      )}

      {/* Social links */}
      {(profile?.instagram || profile?.youtube || profile?.website) && (
        <View className="flex-row gap-4 justify-center mb-4">
          {profile?.instagram && (
            <Pressable
              onPress={() =>
                Linking.openURL(`https://instagram.com/${profile.instagram}`)
              }
            >
              <Ionicons name="logo-instagram" size={22} color="#6b7280" />
            </Pressable>
          )}
          {profile?.youtube && (
            <Pressable
              onPress={() =>
                Linking.openURL(`https://youtube.com/${profile.youtube}`)
              }
            >
              <Ionicons name="logo-youtube" size={22} color="#6b7280" />
            </Pressable>
          )}
          {profile?.website && (
            <Pressable onPress={() => Linking.openURL(profile.website)}>
              <Ionicons name="globe-outline" size={22} color="#6b7280" />
            </Pressable>
          )}
        </View>
      )}

      {/* Tags */}
      {profile?.tags?.length > 0 && (
        <View className="flex-row flex-wrap gap-2 justify-center mb-4">
          {profile.tags.map((tag: string) => (
            <View
              key={tag}
              className="bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-1"
            >
              <Text className="text-xs text-gray-600 dark:text-gray-400">{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View className="h-px bg-gray-200 dark:bg-gray-800 mb-2" />
      <Text className="text-base font-semibold text-gray-900 dark:text-white mb-2">
        Sessions
      </Text>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: `@${handle}`,
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
            ListHeaderComponent={<ProfileHeader />}
            ListEmptyComponent={
              <View className="items-center py-12">
                <Text className="text-gray-400 dark:text-gray-600">No sessions yet</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </>
  );
}
