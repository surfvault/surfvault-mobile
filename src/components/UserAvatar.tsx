import { useState } from 'react';
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

function InitialPlaceholder({ initial, size }: { initial: string; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#0ea5e9',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.4, color: '#fff', fontWeight: '700' }}>
        {initial}
      </Text>
    </View>
  );
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
  const [imgError, setImgError] = useState(false);
  const borderWidth = active ? 3 : hasStatusNote ? 2 : 0;
  const borderColor = active ? '#22c55e' : hasStatusNote ? '#38bdf8' : 'transparent';
  const showImage = !!uri && !imgError;

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
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
      }}
    >
      {showImage ? (
        <Image
          source={uri}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
          contentFit="cover"
          transition={200}
          recyclingKey={uri ?? undefined}
          cachePolicy="memory-disk"
          onError={() => setImgError(true)}
        />
      ) : (
        <InitialPlaceholder initial={initial} size={size} />
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
