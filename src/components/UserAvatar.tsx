import { View, Text } from 'react-native';
import { Image } from 'expo-image';

interface UserAvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: number;
  active?: boolean;
  verified?: boolean;
  hasStatusNote?: boolean;
}

export default function UserAvatar({
  uri,
  name,
  size = 48,
  active = false,
  verified = false,
  hasStatusNote = false,
}: UserAvatarProps) {
  const initial = name?.[0]?.toUpperCase() ?? '?';
  const borderWidth = active ? 3 : hasStatusNote ? 2 : 0;
  const borderColor = active ? '#22c55e' : hasStatusNote ? '#38bdf8' : 'transparent';

  return (
    <View
      style={{
        width: size + borderWidth * 2,
        height: size + borderWidth * 2,
        borderRadius: (size + borderWidth * 2) / 2,
        borderWidth,
        borderColor,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          className="bg-sky-500 items-center justify-center"
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
        >
          <Text
            className="text-white font-bold"
            style={{ fontSize: size * 0.4 }}
          >
            {initial}
          </Text>
        </View>
      )}
      {verified && (
        <View
          className="absolute bg-sky-500 rounded-full items-center justify-center"
          style={{
            width: size * 0.3,
            height: size * 0.3,
            bottom: 0,
            right: 0,
          }}
        >
          <Text style={{ fontSize: size * 0.18, color: 'white' }}>✓</Text>
        </View>
      )}
    </View>
  );
}
