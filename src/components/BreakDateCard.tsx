import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Platform, useColorScheme, type LayoutChangeEvent, type ViewToken, type GestureResponderEvent } from 'react-native';
import { safeShare } from '../helpers/share';
import { Image } from 'expo-image';
import AutoplayVideo from './AutoplayVideo';
import { Ionicons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';
import ActionSheet, { type ActionSheetOption, type ActionSheetSection } from './ActionSheet';
import ReportSessionSheet from './ReportSessionSheet';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { useTrackedPush } from '../context/NavigationContext';
import { resolveAspect } from '../helpers/aspectRatio';

/**
 * Discover/Favorites grouped card. Mirrors web `BreakDateCard.jsx`. Two
 * variants so users can tell solo from multi at a glance:
 *
 * - Solo group (1 session, including hidden-location singletons): place-first
 *   header (break/area name primary, handle subtitle with verified + type
 *   icon). Hidden-location singletons get a soft area label (region for US,
 *   country for elsewhere) so the header has structure without revealing the
 *   specific spot. Tap → session page.
 *
 * - Multi group (2+ sessions at the same break + date): place-first header
 *   (break + date primary, avatar stack + comma'd handles secondary).
 *   Carousel is one slide per session, photographer-bucketed so slide order
 *   matches the subtitle. Tap any slide → break-on-date page.
 */

interface SessionInGroup {
  session_id: string;
  session_date: string;
  session_name?: string;
  user_id?: string;
  user_handle?: string;
  user_picture?: string;
  user_name?: string;
  user_verified?: boolean;
  user_type?: string;
  hide_location?: boolean;
  aspect_ratio?: string | null;
  surf_break_country?: string;
  surf_break_country_name?: string;
  surf_break_region?: string;
  photo_count?: number;
  video_count?: number;
  tagged_users?: Array<{ id?: string; handle?: string; picture?: string; name?: string }>;
  thumbnail?: string;
  // Video thumbnail support (parity with SessionCard). `thumbnail` is the
  // poster still for clips; `thumbnail_preview_video_url` is the clean trailer
  // that autoplays on the active slide while the card is viewable.
  thumbnail_media_type?: 'photo' | 'video';
  thumbnail_preview_video_url?: string | null;
}

export interface BreakDateGroup {
  group_key: string;
  session_date: string;
  hide_location: boolean;
  surf_break_id?: string | null;
  surf_break_name?: string | null;
  surf_break_identifier?: string | null;
  surf_break_country?: string | null;
  surf_break_country_name?: string | null;
  surf_break_region?: string | null;
  sessions: SessionInGroup[];
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const ymd = dateStr.split('T')[0];
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(ymd);
  if (!m) return '';
  const year = +m[1];
  const month = +m[2];
  const day = +m[3];
  const label = MONTHS_SHORT[month - 1];
  if (!label) return '';
  const cy = new Date().getFullYear();
  return year === cy ? `${label} ${day}` : `${label} ${day}, ${year}`;
};

const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
};

const SUBTITLE_HANDLE_CAP = 5;
const formatPhotographerSubtitle = (handles: string[]): string => {
  if (!handles.length) return '';
  if (handles.length === 1) return handles[0];
  if (handles.length <= SUBTITLE_HANDLE_CAP) {
    const head = handles.slice(0, -1).join(', ');
    return `${head} and ${handles[handles.length - 1]}`;
  }
  const head = handles.slice(0, SUBTITLE_HANDLE_CAP - 1).join(', ');
  return `${head} and more`;
};

// US → region (state); elsewhere → country full name. Mirrors web.
// Stop-words stay lowercase unless they lead the string.
const TITLE_CASE_STOP_WORDS = new Set(['of', 'and', 'the', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'a', 'an']);
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s_-])([^_\s-]+)/g, (_, sep, word) => {
    const space = sep === '_' ? ' ' : sep;
    if (sep && TITLE_CASE_STOP_WORDS.has(word)) return `${space}${word}`;
    return `${space}${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  });
const hiddenAreaLabel = (group: BreakDateGroup): string | null => {
  if (group.surf_break_country === 'US' && group.surf_break_region) {
    return titleCase(group.surf_break_region);
  }
  // DB stores country names lowercase ("nicaragua"); title-case for display.
  return group.surf_break_country_name ? titleCase(group.surf_break_country_name) : null;
};

const MAX_VISIBLE_TAGS = 3;
// Max distance (px) a touch may travel between press-in and release while still
// counting as a tap. Beyond this it's a scroll/swipe the FlatList should own.
const TAP_SLOP = 12;
const STACK_OVERLAP = 14;
const STACK_AVATAR_SIZE = 36;
const SOLO_AVATAR_SIZE = 52;

// Autoplaying clip slide — mirrors SessionCard's SessionCardVideoSlide so the
// Discover/Favorites grouped feed plays clips exactly like the per-session feed.
// Plays only when `active` (active carousel slide AND card viewable); otherwise
// pauses and shows the poster still.
// Lazy player (see AutoplayVideo) — only the active slide holds a native player.
function BreakDateVideoSlide({ uri, poster, style, active }: { uri: string; poster?: string; style: any; active: boolean }) {
  return <AutoplayVideo uri={uri} poster={poster} active={active} style={style} />;
}

// Bottom-left media count. `photo_count` is TOTAL media; videos are a subset,
// so show photos (total − videos) and a separate videocam segment to avoid
// double-counting clips. Mirrors SessionCard's stats badge.
function MediaCountBadge({ photoCount, videoCount }: { photoCount?: number; videoCount?: number }) {
  const vids = videoCount ?? 0;
  const photos = Math.max(0, (photoCount ?? 0) - vids);
  if (photos === 0 && vids === 0) return null;
  return (
    <View style={styles.statsBadge} pointerEvents="none">
      {photos > 0 && (
        <>
          <Ionicons name="images-outline" size={11} color="#fff" />
          <Text style={styles.statsText}>{formatCount(photos)}</Text>
        </>
      )}
      {photos > 0 && vids > 0 && <Text style={styles.statsText}>  </Text>}
      {vids > 0 && (
        <>
          <Ionicons name="videocam-outline" size={11} color="#fff" />
          <Text style={styles.statsText}>{formatCount(vids)}</Text>
        </>
      )}
    </View>
  );
}

export default function BreakDateCard({ group, isViewable = true }: { group: BreakDateGroup; isViewable?: boolean }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const trackedPush = useTrackedPush();
  const requireAuth = useRequireAuth();
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideWidth, setSlideWidth] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ sessionId: string; ownerUserId?: string; ownerHandle?: string } | null>(null);

  // Group sessions by photographer so carousel order matches subtitle.
  const slides = useMemo(() => {
    const buckets = new Map<string, SessionInGroup[]>();
    for (const s of group.sessions ?? []) {
      if (!s.thumbnail) continue;
      const k = s.user_handle ?? '';
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(s);
    }
    return Array.from(buckets.values()).flat();
  }, [group.sessions]);

  // Unique photographers in slide order — drives both the avatar stack and
  // the comma'd subtitle.
  const photographers = useMemo(() => {
    const seen = new Set<string>();
    const out: SessionInGroup[] = [];
    for (const s of slides) {
      if (!s.user_handle || seen.has(s.user_handle)) continue;
      seen.add(s.user_handle);
      out.push(s);
    }
    return out;
  }, [slides]);

  // Card height is locked to the first visible slide's owner-set ratio so the
  // card doesn't jump as the user swipes. Subsequent slides center-crop via
  // `resizeMode: 'cover'` (expo-image default `contentFit="cover"`).
  const cardAspect = resolveAspect(slides[0] ?? group.sessions?.[0], 4 / 5);

  const showBreakInfo = !group.hide_location && !!(group.surf_break_name || group.surf_break_identifier);
  const breakName = showBreakInfo
    ? (group.surf_break_name || group.surf_break_identifier?.replace(/_/g, ' '))
    : null;

  const goToBreakOnDate = useCallback(() => {
    if (!group.surf_break_country || !group.surf_break_identifier) return;
    const region = group.surf_break_region || '0';
    const date = group.session_date ? `?date=${String(group.session_date).split('T')[0]}` : '';
    trackedPush(`/break/${group.surf_break_country}/${region}/${group.surf_break_identifier}${date}` as any);
  }, [group, trackedPush]);

  const goToProfile = useCallback((handle?: string) => {
    if (handle) trackedPush(`/user/${handle}` as any);
  }, [trackedPush]);

  const handleViewChange = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveSlide(first.index);
  }, []);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  // Tap-slop guard — see SessionCard. Only fire navigation if the finger came
  // up close to where it went down, so a feed scroll never opens a card.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onTapStart = (e: GestureResponderEvent) => {
    touchStartRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  };
  const guardTap = (action: () => void) => (e: GestureResponderEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start) {
      const dx = Math.abs(e.nativeEvent.pageX - start.x);
      const dy = Math.abs(e.nativeEvent.pageY - start.y);
      if (dx > TAP_SLOP || dy > TAP_SLOP) return;
    }
    action();
  };
  const openSheet = () => setSheetVisible(true);

  if (slides.length === 0) return null;

  // ───────────────────────────────────────── SOLO ─────────────────────────────────────────
  if (slides.length === 1) {
    const solo = slides[0];
    const hiddenArea = !showBreakInfo ? hiddenAreaLabel(group) : null;
    const primary = showBreakInfo ? breakName : (hiddenArea || solo.user_handle);
    const subtitle = showBreakInfo || hiddenArea ? solo.user_handle : null;
    const handleIsPrimary = !showBreakInfo && !hiddenArea;

    const onPrimaryPress = () => {
      if (showBreakInfo) goToBreakOnDate();
      else goToProfile(solo.user_handle);
    };

    // Solo sheet — mirrors SessionCard's menu where data is available. The
    // grouped feed doesn't carry is_following / surf_break_is_favorited yet, so
    // Follow / Favorite Break are omitted (TODO: extend services/surf grouped
    // feed to include those flags, then add the actions here).
    const soloSections: ActionSheetSection[] = [];
    soloSections.push({
      options: [{
        label: 'Share',
        icon: 'share-outline',
        onPress: () => {
          const url = `https://share.surf-vault.com/s/${solo.session_id}`;
          safeShare(Platform.OS === 'ios' ? { url } : { message: url });
        },
      }],
    });
    const soloPrimary: ActionSheetOption[] = [];
    if (solo.user_handle) {
      soloPrimary.push({
        label: 'View Profile',
        icon: 'person-outline',
        onPress: () => goToProfile(solo.user_handle),
      });
    }
    if (showBreakInfo && group.surf_break_identifier && group.surf_break_country) {
      soloPrimary.push({
        label: 'View Break',
        icon: 'location-outline',
        onPress: () => {
          const region = group.surf_break_region || '0';
          trackedPush(`/break/${group.surf_break_country}/${region}/${group.surf_break_identifier}` as any);
        },
      });
    }
    if (soloPrimary.length > 0) soloSections.push({ options: soloPrimary });

    soloSections.push({
      options: [{
        label: 'Report',
        icon: 'flag-outline',
        destructive: true,
        onPress: () => {
          if (!requireAuth()) return;
          setReportTarget({
            sessionId: solo.session_id,
            ownerUserId: (solo as any).user_id,
            ownerHandle: (solo as any).user_handle ?? (solo as any).handle,
          });
        },
      }],
    });

    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Pressable onPressIn={onTapStart} onPress={guardTap(onPrimaryPress)} style={styles.headerLeft}>
            <UserAvatar uri={solo.user_picture} name={solo.user_name ?? solo.user_handle} size={SOLO_AVATAR_SIZE} verified={solo.user_verified} userType={solo.user_type} />
            <View style={styles.headerInfo}>
              <View style={styles.headerNameRow}>
                <Text style={[styles.primaryText, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                  {primary}
                </Text>
                {group.session_date && (
                  <>
                    <Text style={styles.dotSeparator}>·</Text>
                    <Text style={styles.dateInline} numberOfLines={1}>{formatDate(group.session_date)}</Text>
                  </>
                )}
              </View>
              {subtitle && (
                <View style={styles.subtitleRow}>
                  <Text style={[styles.subtitleText, { color: isDark ? '#d1d5db' : '#4b5563' }]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
          <Pressable onPress={() => setSheetVisible(true)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
          </Pressable>
        </View>

        {/* Inlined thumbnail — same exact structure as SessionCard's
            non-carousel branch so layout is identical. */}
        <View>
          <View style={[styles.thumbnail, styles.emptyThumb, { aspectRatio: cardAspect, backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
          </View>
          {solo.thumbnail && (
            <Pressable
              onPressIn={onTapStart}
              onPress={guardTap(() => trackedPush(`/session/${solo.session_id}` as any))}
              onLongPress={openSheet}
              style={[styles.thumbnail, { aspectRatio: cardAspect, position: 'absolute', top: 0, left: 0 }]}
            >
              {solo.thumbnail_media_type === 'video' && solo.thumbnail_preview_video_url ? (
                <BreakDateVideoSlide
                  uri={solo.thumbnail_preview_video_url}
                  poster={solo.thumbnail}
                  style={[styles.thumbnail, { aspectRatio: cardAspect }]}
                  active={isViewable}
                />
              ) : (
                <Image
                  source={{ uri: solo.thumbnail }}
                  style={[styles.thumbnail, { aspectRatio: cardAspect }]}
                  contentFit="cover"
                  transition={200}
                />
              )}
            </Pressable>
          )}

          {(solo.tagged_users?.length ?? 0) > 0 && (
            <View style={styles.taggedOverlay} pointerEvents="none">
              {solo.tagged_users!.slice(0, MAX_VISIBLE_TAGS).map((tu, i) => (
                <View key={tu.id ?? tu.handle ?? i} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: MAX_VISIBLE_TAGS - i }}>
                  <UserAvatar uri={tu.picture} name={tu.name ?? tu.handle} size={26} />
                </View>
              ))}
              {(solo.tagged_users!.length ?? 0) > MAX_VISIBLE_TAGS && (
                <View style={[styles.tagOverflow, { marginLeft: -8 }]}>
                  <Text style={styles.tagOverflowText}>+{solo.tagged_users!.length - MAX_VISIBLE_TAGS}</Text>
                </View>
              )}
            </View>
          )}

          <MediaCountBadge photoCount={solo.photo_count} videoCount={solo.video_count} />
        </View>

        <ActionSheet
          visible={sheetVisible}
          sections={soloSections}
          header={{
            title: solo.session_name || (showBreakInfo ? (breakName ?? 'Session') : (solo.user_handle ?? 'Session')),
            subtitle: [
              solo.user_handle ? `@${solo.user_handle}` : undefined,
              showBreakInfo ? breakName : undefined,
              group.session_date ? formatDate(group.session_date) : undefined,
            ].filter(Boolean).join(' · ') || undefined,
            imageUri: solo.thumbnail,
          }}
          onClose={() => setSheetVisible(false)}
        />
        <ReportSessionSheet
          visible={!!reportTarget}
          sessionId={reportTarget?.sessionId}
          ownerUserId={reportTarget?.ownerUserId}
          ownerHandle={reportTarget?.ownerHandle}
          onClose={() => setReportTarget(null)}
        />
      </View>
    );
  }

  // ──────────────────────────────────────── MULTI ────────────────────────────────────────
  // Multi sheet — actions that map naturally to N sessions/photographers.
  // Skip Follow (which photographer?) and Report (which session?); both would
  // need disambiguation UI. The whole-group share goes to the break+date page.
  const multiSections: ActionSheetSection[] = [];
  const multiShareUrl = showBreakInfo && group.surf_break_country && group.surf_break_identifier
    ? `https://share.surf-vault.com/${group.surf_break_country}/${group.surf_break_region || '0'}/${group.surf_break_identifier}${group.session_date ? `?date=${String(group.session_date).split('T')[0]}` : ''}`
    : null;
  if (multiShareUrl) {
    multiSections.push({
      options: [{
        label: 'Share',
        icon: 'share-outline',
        onPress: () => {
          safeShare(Platform.OS === 'ios' ? { url: multiShareUrl } : { message: multiShareUrl });
        },
      }],
    });
  }
  if (showBreakInfo && group.surf_break_identifier && group.surf_break_country) {
    multiSections.push({
      options: [{
        label: 'View Break',
        icon: 'location-outline',
        onPress: goToBreakOnDate,
      }],
    });
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable onPressIn={onTapStart} onPress={showBreakInfo ? guardTap(goToBreakOnDate) : undefined} style={styles.headerLeft}>
          <View style={styles.avatarStack}>
            {photographers.slice(0, 3).map((p, i) => (
              <View
                key={p.user_handle}
                style={{
                  marginLeft: i > 0 ? -STACK_OVERLAP : 0,
                  zIndex: 30 - i,
                }}
              >
                <UserAvatar uri={p.user_picture} name={p.user_name ?? p.user_handle} size={STACK_AVATAR_SIZE} />
              </View>
            ))}
            {photographers.length > 3 && (
              <View style={[styles.stackOverflow, { marginLeft: -STACK_OVERLAP, backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}>
                <Text style={[styles.stackOverflowText, { color: isDark ? '#e5e7eb' : '#374151' }]}>
                  +{photographers.length - 3}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={[styles.primaryText, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                {breakName}
              </Text>
              {group.session_date && (
                <>
                  <Text style={styles.dotSeparator}>·</Text>
                  <Text style={styles.dateInline} numberOfLines={1}>{formatDate(group.session_date)}</Text>
                </>
              )}
            </View>
            <Text style={[styles.subtitleText, { color: isDark ? '#d1d5db' : '#4b5563' }]} numberOfLines={1}>
              {formatPhotographerSubtitle(photographers.map((p) => p.user_handle ?? ''))}
            </Text>
          </View>
        </Pressable>
        {multiSections.length > 0 && (
          <Pressable onPress={() => setSheetVisible(true)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
          </Pressable>
        )}
      </View>

      {/* Carousel — one slide per session, all routed to break+date page. */}
      <View onLayout={(e: LayoutChangeEvent) => setSlideWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.thumbnail, styles.emptyThumb, { aspectRatio: cardAspect, backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
        </View>
        {slideWidth > 0 && (
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={slides}
            keyExtractor={(s, i) => s.session_id ?? `slide-${i}`}
            onViewableItemsChanged={handleViewChange}
            viewabilityConfig={viewabilityConfig}
            style={[styles.thumbnail, { position: 'absolute', top: 0, left: 0 }]}
            renderItem={({ item, index }) => (
              <Pressable
                onPressIn={onTapStart}
                onPress={guardTap(goToBreakOnDate)}
                onLongPress={multiSections.length > 0 ? openSheet : undefined}
                style={{ width: slideWidth, aspectRatio: cardAspect }}
              >
                {item.thumbnail_media_type === 'video' && item.thumbnail_preview_video_url ? (
                  <BreakDateVideoSlide
                    uri={item.thumbnail_preview_video_url}
                    poster={item.thumbnail ?? undefined}
                    style={{ width: slideWidth, aspectRatio: cardAspect }}
                    active={index === activeSlide && isViewable}
                  />
                ) : (
                  <Image
                    source={{ uri: item.thumbnail! }}
                    style={{ width: slideWidth, aspectRatio: cardAspect }}
                    contentFit="cover"
                    transition={200}
                  />
                )}
              </Pressable>
            )}
          />
        )}

        {/* Tagged users overlay for the active slide. Bottom-right. */}
        {(slides[activeSlide]?.tagged_users?.length ?? 0) > 0 && (
          <View style={styles.taggedOverlay} pointerEvents="none">
            {slides[activeSlide].tagged_users!.slice(0, MAX_VISIBLE_TAGS).map((tu, i) => (
              <View
                key={tu.id ?? tu.handle ?? i}
                style={{ marginLeft: i > 0 ? -8 : 0, zIndex: MAX_VISIBLE_TAGS - i }}
              >
                <UserAvatar uri={tu.picture} name={tu.name ?? tu.handle} size={26} />
              </View>
            ))}
            {(slides[activeSlide].tagged_users!.length ?? 0) > MAX_VISIBLE_TAGS && (
              <View style={[styles.tagOverflow, { marginLeft: -8 }]}>
                <Text style={styles.tagOverflowText}>+{slides[activeSlide].tagged_users!.length - MAX_VISIBLE_TAGS}</Text>
              </View>
            )}
          </View>
        )}

        {/* Media count for the active slide. Bottom-left. */}
        <MediaCountBadge
          photoCount={slides[activeSlide]?.photo_count}
          videoCount={slides[activeSlide]?.video_count}
        />
      </View>

      {/* Tapered dot pager — same rule as SessionCard. */}
      {slides.length > 1 && (
        <View style={styles.dotsRow}>
          {slides.map((_, i) => {
            const dist = Math.abs(i - activeSlide);
            const size = 8 - dist;
            if (size < 1) return null;
            const isActive = i === activeSlide;
            return (
              <View
                key={i}
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: isActive
                    ? (isDark ? '#d1d5db' : '#6b7280')
                    : (isDark ? '#4b5563' : '#d1d5db'),
                }}
              />
            );
          })}
        </View>
      )}

      <ActionSheet
        visible={sheetVisible}
        sections={multiSections}
        header={{
          title: breakName ?? 'Sessions',
          subtitle: [
            group.session_date ? formatDate(group.session_date) : undefined,
            `${group.sessions.length} session${group.sessions.length === 1 ? '' : 's'}`,
          ].filter(Boolean).join(' · ') || undefined,
          imageNode: (
            <View style={styles.avatarStack}>
              {photographers.slice(0, 3).map((p, i) => (
                <View
                  key={p.user_handle}
                  style={{ marginLeft: i > 0 ? -STACK_OVERLAP : 0, zIndex: 30 - i }}
                >
                  <UserAvatar uri={p.user_picture} name={p.user_name ?? p.user_handle} size={STACK_AVATAR_SIZE} />
                </View>
              ))}
              {photographers.length > 3 && (
                <View style={[styles.stackOverflow, { marginLeft: -STACK_OVERLAP, backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}>
                  <Text style={[styles.stackOverflowText, { color: isDark ? '#e5e7eb' : '#374151' }]}>
                    +{photographers.length - 3}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerInfo: {
    marginLeft: 10,
    flex: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarStack: {
    flexDirection: 'row',
  },
  stackOverflow: {
    width: STACK_AVATAR_SIZE,
    height: STACK_AVATAR_SIZE,
    borderRadius: STACK_AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackOverflowText: {
    fontSize: 11,
    fontWeight: '600',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
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
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  subtitleText: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 4 / 5,
  },
  emptyThumb: {
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taggedOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagOverflow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagOverflowText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  statsBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 3,
  },
  statsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 8,
    paddingBottom: 2,
  },
});
