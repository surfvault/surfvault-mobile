import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Platform, Alert, Share } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';
import ActionSheet from './ActionSheet';
import type { ActionSheetOption, ActionSheetSection, ActionSheetHeader } from './ActionSheet';
import { useUser } from '../context/UserProvider';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { useTrackedPush } from '../context/NavigationContext';
import { useFollowUserMutation, useUpdateUserFavoritesMutation } from '../store';

interface TaggedUser {
  id?: string;
  handle?: string;
  picture?: string;
  name?: string;
}

interface SessionCardProps {
  hidePhotographer?: boolean;
  showViewCount?: boolean;
  showHiddenLocations?: boolean;
  onPress?: () => void;
  isViewable?: boolean;
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
    user_type?: string;
    surf_break_name?: string;
    country?: string;
    region?: string;
    surf_break_identifier?: string;
    hide_location?: boolean;
    view_count?: number;
    tagged_users?: TaggedUser[];
  };
}

const MAX_VISIBLE_TAGS = 3;

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const isCurrentYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(isCurrentYear ? {} : { year: 'numeric' }),
  });
};

function FadingSubtitle({ items, visible = true }: { items: string[]; visible?: boolean }) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (items.length <= 1 || !visible) return;
    const interval = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setIndex((prev) => (prev + 1) % items.length);
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [items.length, visible]);

  // Reset to first item when not visible
  useEffect(() => {
    if (!visible) {
      setIndex(0);
      opacity.setValue(1);
    }
  }, [visible]);

  if (items.length === 0) return null;

  return (
    <Animated.Text style={[styles.subtitleText, { opacity }]} numberOfLines={1}>
      {items[index]}
    </Animated.Text>
  );
}

export default function SessionCard({ session, hidePhotographer = false, showViewCount = false, showHiddenLocations = false, onPress: customOnPress, isViewable = true }: SessionCardProps) {
  const router = useRouter();
  const trackedPush = useTrackedPush();
  const { user } = useUser();
  const requireAuth = useRequireAuth();
  const [followUser] = useFollowUserMutation();
  const [favoriteSurfBreak] = useUpdateUserFavoritesMutation();
  const [sheetVisible, setSheetVisible] = useState(false);

  const sessionId = session.session_id ?? session.id;
  const handle = session.user_handle ?? session.handle;
  const taggedUsers = session.tagged_users ?? [];
  const surfBreakId = (session as any).surf_break_id;
  const showLocation = (!session.hide_location || showHiddenLocations) && session.surf_break_name;

  // Optimistic local state for follow/favorite — initialized from server data
  const serverFollowing = !!(session as any).is_following;
  const serverFavorited = !!(session as any).surf_break_is_favorited;
  const [isFollowing, setIsFollowing] = useState(serverFollowing);
  const [isFavorited, setIsFavorited] = useState(serverFavorited);

  // Sync from server when prop data changes (cache refetch)
  useEffect(() => { setIsFollowing(serverFollowing); }, [serverFollowing]);
  useEffect(() => { setIsFavorited(serverFavorited); }, [serverFavorited]);

  const handlePress = () => {
    if (customOnPress) {
      customOnPress();
    } else if (sessionId) {
      trackedPush(`/session/${sessionId}`);
    }
  };

  const handleProfilePress = () => {
    if (handle) trackedPush(`/user/${handle}`);
  };

  const sheetSections: ActionSheetSection[] = [];

  // Section 1: User/break actions
  const primaryOptions: ActionSheetOption[] = [];

  if (handle && handle !== user?.handle) {
    primaryOptions.push({
      label: isFollowing ? 'Unfollow' : 'Follow',
      icon: isFollowing ? 'person-remove-outline' : 'person-add-outline',
      onPress: () => {
        if (!requireAuth()) return;
        const userId = (session as any).user_id;
        if (userId) {
          setIsFollowing(!isFollowing);
          followUser({ userId, action: isFollowing ? 'unfollow' : 'follow' });
        }
      },
    });
  }

  if (showLocation && surfBreakId) {
    primaryOptions.push({
      label: isFavorited ? 'Unfavorite Break' : 'Favorite Break',
      icon: isFavorited ? 'heart-dislike-outline' : 'heart-outline',
      onPress: () => {
        if (!requireAuth()) return;
        setIsFavorited(!isFavorited);
        favoriteSurfBreak({ surfBreakId, action: isFavorited ? 'unfavorite' : 'favorite' });
      },
    });
  }

  if (showLocation && session.surf_break_identifier) {
    primaryOptions.push({
      label: 'View Break',
      icon: 'location-outline',
      onPress: () => {
        const id = session.surf_break_identifier!;
        const country = (session as any).surf_break_country ?? (session as any).country_code ?? '';
        const region = (session as any).surf_break_region ?? (session as any).region ?? '0';
        trackedPush(`/break/${country}/${region}/${id}`);
      },
    });
  }

  if (primaryOptions.length > 0) sheetSections.push({ options: primaryOptions });

  // Section 2: Share
  sheetSections.push({
    options: [{
      label: 'Share',
      icon: 'share-outline',
      onPress: () => {
        const shareUrl = `https://share.surf-vault.com/s/${sessionId}`;
        Share.share(Platform.OS === 'ios' ? { url: shareUrl } : { message: shareUrl });
      },
    }],
  });

  // Section 3: Report (destructive)
  sheetSections.push({
    options: [{
      label: 'Report',
      icon: 'flag-outline',
      destructive: true,
      onPress: () => Alert.alert('Report', 'This session has been reported. Thank you.'),
    }],
  });

  return (
    <View style={styles.card}>
      {/* Header: avatar + name/session/subtitle + ellipsis */}
      <View style={styles.header}>
        {!hidePhotographer ? (
          <Pressable onPress={handleProfilePress} style={styles.headerLeft}>
            <UserAvatar
              uri={session.user_picture}
              name={session.user_name ?? handle}
              size={40}
              verified={session.user_verified}
            />
            <View style={styles.headerInfo}>
              <View style={styles.headerNameRow}>
                <Text style={styles.handleText} numberOfLines={1}>{handle}</Text>
                {session.user_type && (
                  session.user_type === 'photographer' ? (
                    <Ionicons name="camera-outline" size={12} color="#9ca3af" style={styles.typeIcon} />
                  ) : (
                    <MaterialCommunityIcons name="surfing" size={13} color="#9ca3af" style={styles.typeIcon} />
                  )
                )}
                {session.session_date && (
                  <>
                    <Text style={styles.dotSeparator}>·</Text>
                    <Text style={styles.dateInline} numberOfLines={1}>{formatDate(session.session_date)}</Text>
                  </>
                )}
              </View>
              <FadingSubtitle
                items={[
                  session.session_name,
                  (!session.hide_location || showHiddenLocations) ? session.surf_break_name : undefined,
                ].filter(Boolean) as string[]}
                visible={isViewable}
              />
            </View>
          </Pressable>
        ) : (
          <View style={styles.headerLeft}>
            <View style={{ flex: 1 }}>
              {session.session_name && (
                <Text style={styles.handleText} numberOfLines={1}>{session.session_name}</Text>
              )}
              <FadingSubtitle
                items={[
                  (!session.hide_location || showHiddenLocations) ? session.surf_break_name : undefined,
                  session.session_date ? formatDate(session.session_date) : undefined,
                ].filter(Boolean) as string[]}
                visible={isViewable}
              />
            </View>
          </View>
        )}
        <Pressable onPress={() => setSheetVisible(true)} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
        </Pressable>
      </View>

      {/* Thumbnail — edge to edge */}
      <Pressable onPress={handlePress}>
        <View>
          {session.thumbnail ? (
            <Image
              source={{ uri: session.thumbnail }}
              style={styles.thumbnail}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.thumbnail, styles.emptyThumb]}>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>No photos yet</Text>
            </View>
          )}

          {/* Tagged users — bottom right overlay */}
          {taggedUsers.length > 0 && (
            <View style={styles.taggedOverlay}>
              {taggedUsers.slice(0, MAX_VISIBLE_TAGS).map((tagged, index) => (
                <View
                  key={tagged.id ?? tagged.handle ?? index}
                  style={{ marginLeft: index > 0 ? -8 : 0, zIndex: MAX_VISIBLE_TAGS - index }}
                >
                  <UserAvatar uri={tagged.picture} name={tagged.name ?? tagged.handle} size={26} />
                </View>
              ))}
              {taggedUsers.length > MAX_VISIBLE_TAGS && (
                <View style={[styles.tagOverflow, { marginLeft: -8 }]}>
                  <Text style={styles.tagOverflowText}>+{taggedUsers.length - MAX_VISIBLE_TAGS}</Text>
                </View>
              )}
            </View>
          )}

          {/* View count — bottom left (self only) */}
          {showViewCount && session.view_count != null && (
            <View style={styles.viewCountWrap}>
              <View style={styles.viewCountBadge}>
                <Ionicons name="eye-outline" size={13} color="#fff" />
                <Text style={styles.viewCountText}>{(session.view_count ?? 0).toLocaleString()}</Text>
              </View>
            </View>
          )}

          {/* Photo count — top right */}
          {session.photo_count != null && session.photo_count > 0 && (
            <View style={styles.photoCountBadge}>
              <Text style={styles.photoCountText}>{session.photo_count}</Text>
              <Ionicons name="images-outline" size={11} color="#fff" />
            </View>
          )}
        </View>
      </Pressable>

      <ActionSheet
        visible={sheetVisible}
        sections={sheetSections}
        header={{
          title: session.session_name || handle || 'Session',
          subtitle: [
            handle && session.session_name ? `@${handle}` : undefined,
            showLocation ? session.surf_break_name : undefined,
          ].filter(Boolean).join(' · ') || undefined,
          imageUri: session.thumbnail,
        }}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  headerInfo: {
    marginLeft: 8,
    flex: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  handleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  typeIcon: {
    marginLeft: 3,
  },
  dotSeparator: {
    fontSize: 13,
    color: '#9ca3af',
    marginHorizontal: 4,
  },
  dateInline: {
    fontSize: 13,
    color: '#9ca3af',
  },
  subtitleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 1,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 5 / 4,
  },
  emptyThumb: {
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taggedOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagOverflow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagOverflowText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#fff',
  },
  viewCountWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 24,
    backgroundColor: 'transparent',
  },
  viewCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  viewCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  photoCountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  photoCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
});
