import React from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';

const HERO_BODY = 300;
const SCRIM_HEIGHT = 215;
const SCREEN_WIDTH = Dimensions.get('window').width;
const MAX_VISIBLE_TAGS = 3;

interface TaggedUser {
  id?: string;
  handle?: string;
  name?: string | null;
  picture?: string | null;
}

interface SessionHeroProps {
  imageUri: string | null;
  sessionName: string;
  userPicture?: string | null;
  userName?: string | null;
  userHandle?: string | null;
  userType?: string | null;
  userVerified?: boolean;
  surfBreakName?: string | null;
  breakIsTappable: boolean;
  onBreakPress: () => void;
  dateLabel: string;
  onAvatarPress: () => void;
  taggedUsers: TaggedUser[];
  isOwner: boolean;
  onTagPress: () => void;
  isDark: boolean;
  topInset: number;
}

function SessionHero({
  imageUri,
  sessionName,
  userPicture,
  userName,
  userHandle,
  userType,
  userVerified,
  surfBreakName,
  breakIsTappable,
  onBreakPress,
  dateLabel,
  onAvatarPress,
  taggedUsers,
  isOwner,
  onTagPress,
  isDark,
  topInset,
}: SessionHeroProps) {
  const heroHeight = topInset + HERO_BODY;

  return (
    <View style={[styles.hero, { height: heroHeight }]}>
      {/* Background image — falls back to an ocean color when the session has
          no usable thumbnail (e.g. locked/private sessions). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={250}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#0b2540' : '#0e3a5f' }]} />
        )}
      </View>

      {/* Bottom scrim: darkens for text legibility AND resolves to the content
          background color at full opacity so the hero dissolves seamlessly into
          the page below (no hard image→content seam). The dark→bg dissolve fills
          the whole region BELOW the title block (which sits at bottom:48), so in
          light mode the photo fades gently into white instead of cutting hard;
          in dark mode the whole ramp is black so it's invisibly seamless. */}
      <View pointerEvents="none" style={styles.scrimWrap}>
        <Svg width={SCREEN_WIDTH} height={SCRIM_HEIGHT}>
          <Defs>
            <LinearGradient id="sessionHeroScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity={0} />
              <Stop offset="0.5" stopColor="#000000" stopOpacity={0.4} />
              <Stop offset="0.88" stopColor="#000000" stopOpacity={isDark ? 0.92 : 0.82} />
              <Stop offset="1" stopColor={isDark ? '#000000' : '#ffffff'} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={SCREEN_WIDTH} height={SCRIM_HEIGHT} fill="url(#sessionHeroScrim)" />
        </Svg>
      </View>

      {/* Bottom overlay: title block (left) + date pill (right) */}
      <View pointerEvents="box-none" style={styles.bottomBar}>
        <View style={styles.titleBlock}>
          <Text style={styles.sessionName} numberOfLines={2}>
            {sessionName}
          </Text>

          {!!surfBreakName && (
            <Pressable
              onPress={breakIsTappable ? onBreakPress : undefined}
              disabled={!breakIsTappable}
              style={styles.breakRow}
              hitSlop={6}
            >
              <Ionicons name="location" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.breakText} numberOfLines={1}>
                {surfBreakName}
              </Text>
            </Pressable>
          )}

          <Pressable onPress={onAvatarPress} style={styles.avatarRow} hitSlop={6}>
            <UserAvatar
              uri={userPicture}
              name={userName ?? userHandle}
              size={44}
              userType={userType}
              verified={!!userVerified}
              badgeBackgroundColor="rgba(0,0,0,0.55)"
            />
            <Text style={styles.handle} numberOfLines={1}>
              {userHandle}
            </Text>
          </Pressable>
        </View>

        <View style={styles.rightCol}>
          {taggedUsers.length > 0 ? (
            <Pressable onPress={onTagPress} style={styles.taggedRow} hitSlop={6}>
              {taggedUsers.slice(0, MAX_VISIBLE_TAGS).map((t, i) => (
                <View
                  key={t.id ?? t.handle ?? i}
                  style={{ marginLeft: i > 0 ? -8 : 0, zIndex: MAX_VISIBLE_TAGS - i }}
                >
                  <UserAvatar uri={t.picture} name={t.name ?? t.handle} size={28} />
                </View>
              ))}
              {taggedUsers.length > MAX_VISIBLE_TAGS && (
                <View style={styles.tagOverflow}>
                  <Text style={styles.tagOverflowText}>+{taggedUsers.length - MAX_VISIBLE_TAGS}</Text>
                </View>
              )}
            </Pressable>
          ) : isOwner ? (
            <Pressable onPress={onTagPress} style={styles.tagPlaceholder} hitSlop={6}>
              <Ionicons name="person-add-outline" size={14} color="#fff" />
              <Text style={styles.tagPlaceholderText}>Tag users</Text>
            </Pressable>
          ) : null}

          {!!dateLabel && <Text style={styles.dateText}>{dateLabel}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden', backgroundColor: '#0e3a5f' },
  scrimWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: SCRIM_HEIGHT },
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 12,
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: { flex: 1 },
  sessionName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 },
  handle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  breakText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  rightCol: { alignItems: 'flex-end', gap: 10 },
  taggedRow: { flexDirection: 'row', alignItems: 'center' },
  tagOverflow: {
    marginLeft: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagOverflowText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  tagPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tagPlaceholderText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default React.memo(SessionHero);
