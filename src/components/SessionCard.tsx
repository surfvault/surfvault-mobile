import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Platform, Alert, Share, useColorScheme, FlatList } from 'react-native';
import type { ViewToken, LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';
import ActionSheet from './ActionSheet';
import type { ActionSheetOption, ActionSheetSection, ActionSheetHeader } from './ActionSheet';
import ReportSessionSheet from './ReportSessionSheet';
import { useUser } from '../context/UserProvider';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { useTrackedPush } from '../context/NavigationContext';
import { useFollowUserMutation, useUpdateUserFavoritesMutation } from '../store';

const formatCount = (n: number): string => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
};

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
  enableCarousel?: boolean;
  onPress?: () => void;
  onDelete?: () => void;
  isViewable?: boolean;
  session: {
    id?: string;
    session_id?: string;
    session_name?: string;
    session_date?: string;
    thumbnail?: string;
    extra_photos?: Array<{ id: string; url: string }>;
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

// Pager dots: all dots always visible (max 11 slides), active is larger and colored,
// dots further from active shrink slightly for an Instagram-like look.
function computeDots(activeIdx: number, total: number) {
  if (total <= 1) return [] as Array<{ key: number; size: number; isActive: boolean }>;
  return Array.from({ length: total }, (_, i) => {
    const isActive = i === activeIdx;
    const dist = Math.abs(i - activeIdx);
    let size = 6;
    if (isActive) size = 7;
    else if (dist >= 3) size = 4;
    else if (dist === 2) size = 5;
    return { key: i, size, isActive };
  });
}

// Pure string-based date formatter. Never constructs `new Date(dateStr)` because
// session dates represent a calendar day (the day the session happened) — not a
// UTC instant — so the viewer's timezone must not shift the displayed day.
// See web counterpart: surfvault-web/src/helpers/dateAndTime.js formatSessionDate.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const ymd = dateStr.split('T')[0];
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(ymd);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const monthLabel = MONTHS_SHORT[month - 1];
  if (!monthLabel) return '';
  const currentYear = new Date().getFullYear();
  return year === currentYear ? `${monthLabel} ${day}` : `${monthLabel} ${day}, ${year}`;
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

type Slide =
  | { kind: 'thumb'; url: string }
  | { kind: 'photo'; url: string; id: string }
  | { kind: 'cta' };

export default function SessionCard({ session, hidePhotographer = false, showViewCount = false, showHiddenLocations = false, enableCarousel = false, onPress: customOnPress, onDelete, isViewable = true }: SessionCardProps) {
  const router = useRouter();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();
  const requireAuth = useRequireAuth();
  const [followUser] = useFollowUserMutation();
  const [favoriteSurfBreak] = useUpdateUserFavoritesMutation();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideWidth, setSlideWidth] = useState(0);

  const sessionId = session.session_id ?? session.id;
  const handle = session.user_handle ?? session.handle;
  const taggedUsers = session.tagged_users ?? [];
  const surfBreakId = (session as any).surf_break_id;
  const showLocation = (!session.hide_location || showHiddenLocations) && session.surf_break_name;

  const slides: Slide[] = useMemo(() => {
    if (!enableCarousel || !session.thumbnail) return [];
    const extras = session.extra_photos ?? [];
    const photoCount = session.photo_count ?? 0;
    const shownSoFar = 1 + extras.length;
    const list: Slide[] = [
      { kind: 'thumb', url: session.thumbnail },
      ...extras.map((p) => ({ kind: 'photo' as const, url: p.url, id: p.id })),
    ];
    if (photoCount > shownSoFar) list.push({ kind: 'cta' });
    return list;
  }, [enableCarousel, session.thumbnail, session.extra_photos, session.photo_count]);

  const useCarousel = slides.length > 1;
  const prefetchedRef = useRef<Set<string>>(new Set());
  const prefetchSlide = useCallback((idx: number) => {
    const slide = slides[idx];
    if (!slide || slide.kind === 'cta') return;
    if (prefetchedRef.current.has(slide.url)) return;
    prefetchedRef.current.add(slide.url);
    Image.prefetch(slide.url).catch(() => {});
  }, [slides]);

  useEffect(() => {
    if (useCarousel && isViewable) prefetchSlide(1);
  }, [useCarousel, isViewable, prefetchSlide]);

  const handleViewChange = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index == null) return;
    const idx = first.index;
    setActiveSlide(idx);
    prefetchSlide(idx + 1);
    prefetchSlide(idx - 1);
  }, [prefetchSlide]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

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

  // Section 1: Share always first
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

  // Section 2: User/break actions
  if (primaryOptions.length > 0) sheetSections.push({ options: primaryOptions });

  // Section 3: Delete (owner) or Report (non-owner)
  if (onDelete) {
    sheetSections.push({
      options: [{
        label: 'Delete Session',
        icon: 'trash-outline',
        destructive: true,
        onPress: onDelete,
      }],
    });
  } else {
    sheetSections.push({
      options: [{
        label: 'Report',
        icon: 'flag-outline',
        destructive: true,
        onPress: () => {
          // Auth required — guests get prompted to sign in instead.
          // Keeps moderation reports accountable (reporter user_id in email).
          if (!requireAuth()) return;
          setReportVisible(true);
        },
      }],
    });
  }

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

      {/* Thumbnail / carousel — edge to edge */}
      <Pressable onPress={handlePress}>
        <View onLayout={(e: LayoutChangeEvent) => setSlideWidth(e.nativeEvent.layout.width)}>
          <View style={[styles.thumbnail, styles.emptyThumb, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
          </View>
          {useCarousel && slideWidth > 0 ? (
            <FlatList
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              data={slides}
              keyExtractor={(_, i) => `${sessionId}-slide-${i}`}
              initialNumToRender={1}
              windowSize={3}
              maxToRenderPerBatch={1}
              removeClippedSubviews
              onViewableItemsChanged={handleViewChange}
              viewabilityConfig={viewabilityConfig}
              style={[styles.thumbnail, { position: 'absolute', top: 0, left: 0 }]}
              renderItem={({ item }) => {
                const slideStyle = { width: slideWidth, aspectRatio: 5 / 4 };
                if (item.kind === 'cta') {
                  return (
                    <View style={[slideStyle, styles.ctaSlide, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                      <Ionicons name="images-outline" size={28} color={isDark ? '#9ca3af' : '#6b7280'} />
                      <Text style={[styles.ctaTitle, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                        See all {session.photo_count ?? ''} photos
                      </Text>
                      <View style={styles.ctaHintRow}>
                        <Text style={[styles.ctaHint, { color: isDark ? '#9ca3af' : '#6b7280' }]}>Tap to open</Text>
                        <Ionicons name="chevron-forward" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
                      </View>
                    </View>
                  );
                }
                return (
                  <Image
                    source={{ uri: item.url }}
                    style={slideStyle}
                    contentFit="cover"
                    transition={200}
                  />
                );
              }}
            />
          ) : session.thumbnail ? (
            <Image
              source={{ uri: session.thumbnail }}
              style={[styles.thumbnail, { position: 'absolute', top: 0, left: 0 }]}
              contentFit="cover"
              transition={200}
            />
          ) : null}

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

          {/* Stats badge — bottom left */}
          {(session.photo_count > 0 || (showViewCount && session.view_count != null)) && (
            <View style={styles.statsBadge}>
              {showViewCount && session.view_count != null && (
                <>
                  <Ionicons name="eye-outline" size={11} color="#fff" />
                  <Text style={styles.statsText}>{formatCount(session.view_count ?? 0)}</Text>
                </>
              )}
              {showViewCount && session.view_count != null && session.photo_count > 0 && (
                <Text style={styles.statsText}> · </Text>
              )}
              {session.photo_count > 0 && (
                <>
                  <Ionicons name="images-outline" size={11} color="#fff" />
                  <Text style={styles.statsText}>{formatCount(session.photo_count)}</Text>
                </>
              )}
            </View>
          )}
        </View>
      </Pressable>

      {/* Pager dots — Instagram-style sliding window, only shown for carousel */}
      {useCarousel && slides.length > 1 && (
        <View style={styles.dotsRow}>
          {computeDots(activeSlide, slides.length).map((dot) => (
            <View
              key={dot.key}
              style={[
                styles.dot,
                { width: dot.size, height: dot.size, borderRadius: dot.size / 2 },
                dot.isActive
                  ? styles.dotActive
                  : { backgroundColor: isDark ? '#4b5563' : '#d1d5db' },
              ]}
            />
          ))}
        </View>
      )}

      <ActionSheet
        visible={sheetVisible}
        sections={sheetSections}
        header={{
          title: session.session_name || handle || 'Session',
          subtitle: [
            handle && session.session_name ? `@${handle}` : undefined,
            showLocation ? session.surf_break_name : undefined,
            session.session_date ? formatDate(session.session_date) : undefined,
          ].filter(Boolean).join(' · ') || undefined,
          imageUri: session.thumbnail,
        }}
        onClose={() => setSheetVisible(false)}
      />

      <ReportSessionSheet
        visible={reportVisible}
        sessionId={session.session_id ?? session.id}
        onClose={() => setReportVisible(false)}
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
  ctaSlide: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  ctaHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ctaHint: {
    fontSize: 13,
    fontWeight: '500',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 8,
    paddingBottom: 2,
  },
  dot: {
    backgroundColor: '#d1d5db',
  },
  dotActive: {
    backgroundColor: '#0ea5e9',
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
  statsBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
});
