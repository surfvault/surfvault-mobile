import { useState } from 'react';
import { View, Text, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import UserTypeBadge, { UserTypeBadgeType } from './UserTypeBadge';

interface UserAvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: number;
  active?: boolean;
  verified?: boolean;
  userType?: UserTypeBadgeType | string | null;
  hasStatusNote?: boolean;
  /** Background color of the cut-out around the type badge. Defaults to the
   *  app surface (white in light mode, near-black in dark) so the badge
   *  reads as notched into the avatar instead of pasted on top. Override
   *  when the avatar sits on a non-standard background. */
  badgeBackgroundColor?: string;
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
  userType,
  hasStatusNote = false,
  badgeBackgroundColor,
}: UserAvatarProps) {
  const isDark = useColorScheme() === 'dark';
  const cutoutColor = badgeBackgroundColor ?? (isDark ? '#000' : '#fff');
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
      }}
    >
      {showImage ? (
        <Image
          source={uri}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
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
      {(userType === 'surfer' || userType === 'photographer' || userType === 'shaper') && (() => {
        const badgeSize = Math.max(16, size * 0.4);
        const cutoutSize = badgeSize + 2;
        // Position so the cutout overlaps the avatar edge by ~40% of its
        // diameter — enough that the surrounding-color ring eats into the
        // avatar circle and the badge reads as notched in.
        const offset = -Math.round(cutoutSize * 0.18);
        return (
          <View
            style={{
              position: 'absolute',
              bottom: offset,
              right: offset,
              width: cutoutSize,
              height: cutoutSize,
              borderRadius: cutoutSize / 2,
              backgroundColor: cutoutColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UserTypeBadge
              userType={userType}
              isVerified={verified}
              size={badgeSize}
            />
          </View>
        );
      })()}
      {/* Instagram-style ACTIVE pill — overlaps the bottom edge of the
          ring. Hidden on small avatars (the green ring alone reads as
          "active" when the label would be unreadable). */}
      {active && size >= 44 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -7,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: '#22c55e',
              borderRadius: 999,
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderWidth: 1.5,
              borderColor: '#fff',
            }}
          >
            <Text
              style={{
                fontSize: Math.max(8, size * 0.14),
                fontWeight: '800',
                color: '#fff',
                letterSpacing: 0.4,
              }}
            >
              ACTIVE
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
