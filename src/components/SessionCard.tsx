import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import UserAvatar from './UserAvatar';

interface TaggedUser {
  id?: string;
  handle?: string;
  picture?: string;
  name?: string;
}

interface SessionCardProps {
  hidePhotographer?: boolean;
  session: {
    id?: string;
    session_id?: string;
    session_name?: string;
    session_date?: string;
    thumbnail?: string;
    photo_count?: number;
    user_handle?: string;
    handle?: string;
    user_picture?: string;
    user_name?: string;
    user_verified?: boolean;
    surf_break_name?: string;
    country?: string;
    region?: string;
    surf_break_identifier?: string;
    hide_location?: boolean;
    tagged_users?: TaggedUser[];
  };
}

const MAX_VISIBLE_TAGS = 3;

export default function SessionCard({ session, hidePhotographer = false }: SessionCardProps) {
  const router = useRouter();
  const sessionId = session.session_id ?? session.id;
  const handle = session.user_handle ?? session.handle;
  const taggedUsers = session.tagged_users ?? [];

  const handlePress = () => {
    if (sessionId) {
      router.push(`/home/session/${sessionId}`);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Pressable onPress={handlePress} className="mb-5">
      {/* Session info above photo */}
      <View className="mb-2 px-1 flex-row items-center justify-between">
        {/* Left: name, location, date */}
        <View className="flex-1 mr-3">
          {session.session_name && (
            <Text className="text-base font-semibold text-gray-900 dark:text-white" numberOfLines={1}>
              {session.session_name}
            </Text>
          )}
          <View className="flex-row items-center mt-0.5">
            {!session.hide_location && session.surf_break_name && (
              <Text className="text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
                {session.surf_break_name}
              </Text>
            )}
            {session.session_date && (
              <>
                {!session.hide_location && session.surf_break_name && (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 mx-1.5">·</Text>
                )}
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {formatDate(session.session_date)}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Right: tagged users stacked */}
        {taggedUsers.length > 0 && (
          <View className="flex-row items-center">
            {taggedUsers.slice(0, MAX_VISIBLE_TAGS).map((tagged, index) => (
              <View
                key={tagged.id ?? tagged.handle ?? index}
                style={{ marginLeft: index > 0 ? -10 : 0, zIndex: MAX_VISIBLE_TAGS - index }}
              >
                <UserAvatar
                  uri={tagged.picture}
                  name={tagged.name ?? tagged.handle}
                  size={28}
                />
              </View>
            ))}
            {taggedUsers.length > MAX_VISIBLE_TAGS && (
              <View
                className="bg-gray-200 dark:bg-gray-700 items-center justify-center rounded-full"
                style={{ width: 28, height: 28, marginLeft: -10, zIndex: 0 }}
              >
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  +{taggedUsers.length - MAX_VISIBLE_TAGS}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Thumbnail */}
      <View className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
        {session.thumbnail ? (
          <Image
            source={{ uri: session.thumbnail }}
            className="w-full"
            style={{ aspectRatio: 16 / 10 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            className="w-full items-center justify-center bg-gray-200 dark:bg-gray-700"
            style={{ aspectRatio: 16 / 10 }}
          >
            <Text className="text-gray-400 text-sm">No photos yet</Text>
          </View>
        )}

        {/* Photographer overlay — bottom right */}
        {!hidePhotographer && (
          <View className="absolute bottom-3 right-3 flex-row items-center bg-black/50 rounded-full px-2.5 py-1.5">
            <UserAvatar
              uri={session.user_picture}
              name={session.user_name ?? handle}
              size={22}
            />
            {handle && (
              <Text className="text-white text-xs font-medium ml-1.5" numberOfLines={1}>
                @{handle}
              </Text>
            )}
          </View>
        )}

        {/* Photo count badge */}
        {session.photo_count != null && session.photo_count > 0 && (
          <View className="absolute top-3 right-3 bg-black/50 rounded-full px-2 py-1">
            <Text className="text-white text-xs font-medium">
              {session.photo_count} photos
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
