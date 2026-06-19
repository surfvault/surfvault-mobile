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
  /** Suppress UserAvatar's own ring/border — used when the caller already draws
   *  a ring around the avatar (e.g. the GradientRing on the nearby rails). The
   *  ACTIVE pill + badge-hide still apply, so the caller gets the badge without
   *  a doubled-up green border. */
  noRing?: boolean;
  /** Extra px to push the ACTIVE pill further down — e.g. when a caller draws
   *  its own ring outside the avatar (GradientRing), the pill needs to drop to
   *  sit on that ring instead of floating inside it. */
  activeBadgeOffset?: number;
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
  noRing = false,
  activeBadgeOffset = 0,
  badgeBackgroundColor,
}: UserAvatarProps) {
  const isDark = useColorScheme() === 'dark';
  const cutoutColor = badgeBackgroundColor ?? (isDark ? '#000' : '#fff');
  const initial = name?.[0]?.toUpperCase() ?? '?';
  const [imgError, setImgError] = useState(false);
  const borderWidth = noRing ? 0 : active ? 3 : hasStatusNote ? 2 : 0;
  const borderColor = active ? '#22c55e' : hasStatusNote ? '#38bdf8' : 'transparent';
  const showImage = !!uri && !imgError;
  // The ACTIVE pill sits bottom-center; the type badge sits bottom-right — they
  // collide. When the pill is actually shown (only at size >= 44), suppress the
  // badge so the active state reads cleanly. (Small avatars show no pill, so the
  // badge stays as the only photographer/verified signal there.)
  const showActivePill = active && size >= 44;

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
        <View
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
        >
          {/* Colored-initial fallback sits BEHIND the image so a slow or
              failed avatar load shows the initial instead of an empty grey
              disk (Android emulators are slow at concurrent small-image
              decode). The image fades in on top via `transition` once it
              decodes. */}
          <View style={{ position: 'absolute', top: 0, left: 0 }}>
            <InitialPlaceholder initial={initial} size={size} />
          </View>
          <Image
            source={uri}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            contentFit="cover"
            transition={200}
            recyclingKey={uri ?? undefined}
            cachePolicy="memory-disk"
            onError={() => setImgError(true)}
          />
        </View>
      ) : (
        <InitialPlaceholder initial={initial} size={size} />
      )}
      {!showActivePill && (userType === 'surfer' || userType === 'photographer' || userType === 'shaper') && (() => {
        const badgeSize = Math.max(15, size * 0.36);
        const cutoutSize = badgeSize + 0.5;
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
      {showActivePill && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -3 - activeBadgeOffset,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: '#22c55e',
              borderRadius: 999,
              paddingHorizontal: 6,
              paddingVertical: 1,
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
