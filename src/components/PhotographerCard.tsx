import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import UserAvatar from './UserAvatar';

interface PhotographerCardProps {
  photographer: {
    id?: string;
    handle: string;
    name?: string;
    picture?: string;
    verified?: boolean;
    active?: boolean;
    status_note?: string;
    status_note_set_at?: string;
  };
  compact?: boolean;
}

const isNoteActive = (setAt?: string): boolean => {
  if (!setAt) return false;
  return Date.now() - new Date(setAt).getTime() < 7 * 24 * 60 * 60 * 1000;
};

export default function PhotographerCard({ photographer, compact = false }: PhotographerCardProps) {
  const router = useRouter();
  const hasActiveNote =
    !!photographer.status_note && isNoteActive(photographer.status_note_set_at);

  const handlePress = () => {
    router.push(`/user/${photographer.handle}`);
  };

  if (compact) {
    return (
      <Pressable onPress={handlePress} className="items-center mr-4 w-16">
        <UserAvatar
          uri={photographer.picture}
          name={photographer.name ?? photographer.handle}
          size={48}
          active={photographer.active}
          verified={photographer.verified}
          hasStatusNote={hasActiveNote}
        />
        <Text
          className="text-xs text-gray-700 dark:text-gray-300 mt-1 text-center"
          numberOfLines={1}
        >
          {photographer.name?.split(' ')[0] ?? photographer.handle}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center py-3 border-b border-gray-100 dark:border-gray-800"
    >
      <UserAvatar
        uri={photographer.picture}
        name={photographer.name ?? photographer.handle}
        size={44}
        active={photographer.active}
        verified={photographer.verified}
        hasStatusNote={hasActiveNote}
      />
      <View className="flex-1 ml-3">
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {photographer.name ?? photographer.handle}
          </Text>
          {photographer.active && (
            <View className="ml-2 bg-green-100 dark:bg-green-900/30 rounded-full px-2 py-0.5">
              <Text className="text-green-600 dark:text-green-400 text-xs font-medium">
                Active
              </Text>
            </View>
          )}
        </View>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          @{photographer.handle}
        </Text>
        {hasActiveNote && (
          <View className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-lg px-2 py-1 mt-1 self-start">
            <Text className="text-xs text-sky-700 dark:text-sky-300" numberOfLines={2}>
              {photographer.status_note}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
