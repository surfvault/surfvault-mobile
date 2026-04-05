import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

interface SurfBreakCardProps {
  surfBreak: {
    id?: string;
    name: string;
    region?: string;
    country?: string;
    country_code?: string;
    thumbnail?: string;
    distance?: number;
    surf_break_identifier?: string;
  };
  compact?: boolean;
}

export default function SurfBreakCard({ surfBreak, compact = false }: SurfBreakCardProps) {
  const router = useRouter();

  const handlePress = () => {
    if (surfBreak.surf_break_identifier) {
      // surf_break_identifier format: "country/region/break-name"
      const parts = surfBreak.surf_break_identifier.split('/');
      if (parts.length === 3) {
        router.push(`/home/${parts[0]}/${parts[1]}/${parts[2]}`);
      }
    }
  };

  const formatDistance = (meters?: number) => {
    if (!meters) return '';
    const km = meters / 1000;
    if (km < 1) return `${Math.round(meters)}m away`;
    return `${km.toFixed(1)}km away`;
  };

  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        className="mr-3 w-40"
      >
        <View className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
          {surfBreak.thumbnail ? (
            <Image
              source={{ uri: surfBreak.thumbnail }}
              className="w-full"
              style={{ aspectRatio: 4 / 3 }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View
              className="w-full bg-gray-200 dark:bg-gray-700 items-center justify-center"
              style={{ aspectRatio: 4 / 3 }}
            >
              <Text className="text-gray-400 text-2xl">🏄</Text>
            </View>
          )}
        </View>
        <Text className="text-sm font-semibold text-gray-900 dark:text-white mt-1.5" numberOfLines={1}>
          {surfBreak.name}
        </Text>
        {surfBreak.region && (
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
            {surfBreak.region}{surfBreak.country_code ? `, ${surfBreak.country_code}` : ''}
          </Text>
        )}
        {surfBreak.distance != null && (
          <Text className="text-xs text-sky-500 mt-0.5">
            {formatDistance(surfBreak.distance)}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center py-3 border-b border-gray-100 dark:border-gray-800"
    >
      <View className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
        {surfBreak.thumbnail ? (
          <Image
            source={{ uri: surfBreak.thumbnail }}
            style={{ width: 64, height: 64 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            className="bg-gray-200 dark:bg-gray-700 items-center justify-center"
            style={{ width: 64, height: 64 }}
          >
            <Text className="text-gray-400 text-xl">🏄</Text>
          </View>
        )}
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-base font-semibold text-gray-900 dark:text-white" numberOfLines={1}>
          {surfBreak.name}
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
          {surfBreak.region}{surfBreak.country ? `, ${surfBreak.country}` : ''}
        </Text>
        {surfBreak.distance != null && (
          <Text className="text-xs text-sky-500 mt-0.5">
            {formatDistance(surfBreak.distance)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
