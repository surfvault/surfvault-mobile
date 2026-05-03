import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, useColorScheme, type LayoutChangeEvent, type ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';
import VerifiedBadge from './VerifiedBadge';
import { useTrackedPush } from '../context/NavigationContext';

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
  surf_break_country?: string;
  surf_break_country_name?: string;
  surf_break_region?: string;
  photo_count?: number;
  tagged_users?: Array<{ id?: string; handle?: string; picture?: string; name?: string }>;
  thumbnail?: string;
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
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s_-])([a-z])/g, (_, sep, ch) => `${sep === '_' ? ' ' : sep}${ch.toUpperCase()}`);
const hiddenAreaLabel = (group: BreakDateGroup): string | null => {
  if (group.surf_break_country === 'US' && group.surf_break_region) {
    return titleCase(group.surf_break_region);
  }
  return group.surf_break_country_name || null;
};

const MAX_VISIBLE_TAGS = 3;
const STACK_OVERLAP = 14;
const STACK_AVATAR_SIZE = 36;
const SOLO_AVATAR_SIZE = 44;

export default function BreakDateCard({ group }: { group: BreakDateGroup }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const trackedPush = useTrackedPush();
  const [activeSlide, setActiveSlide] = useState(0);
  const [slideWidth, setSlideWidth] = useState(0);

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

    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Pressable onPress={onPrimaryPress} style={styles.headerLeft}>
            <UserAvatar uri={solo.user_picture} name={solo.user_name ?? solo.user_handle} size={SOLO_AVATAR_SIZE} />
            <View style={styles.headerInfo}>
              <View style={styles.headerNameRow}>
                <Text style={[styles.primaryText, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                  {primary}
                </Text>
                {handleIsPrimary && solo.user_verified && (
                  <View style={{ marginLeft: 4 }}>
                    <VerifiedBadge size={16} />
                  </View>
                )}
                {handleIsPrimary && solo.user_type && (
                  solo.user_type === 'photographer'
                    ? <Ionicons name="camera-outline" size={13} color="#9ca3af" style={styles.typeIcon} />
                    : <MaterialCommunityIcons name="surfing" size={14} color="#9ca3af" style={styles.typeIcon} />
                )}
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
                  {solo.user_verified && (
                    <View style={{ marginLeft: 3 }}>
                      <VerifiedBadge size={14} />
                    </View>
                  )}
                  {solo.user_type && (
                    solo.user_type === 'photographer'
                      ? <Ionicons name="camera-outline" size={11} color="#9ca3af" style={styles.typeIcon} />
                      : <MaterialCommunityIcons name="surfing" size={12} color="#9ca3af" style={styles.typeIcon} />
                  )}
                </View>
              )}
            </View>
          </Pressable>
        </View>

        {/* Inlined thumbnail — same exact structure as SessionCard's
            non-carousel branch so layout is identical. */}
        <View>
          <View style={[styles.thumbnail, styles.emptyThumb, { aspectRatio: 4 / 5, backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
          </View>
          {solo.thumbnail && (
            <Pressable
              onPress={() => trackedPush(`/session/${solo.session_id}` as any)}
              style={[styles.thumbnail, { aspectRatio: 4 / 5, position: 'absolute', top: 0, left: 0 }]}
            >
              <Image
                source={{ uri: solo.thumbnail }}
                style={[styles.thumbnail, { aspectRatio: 4 / 5 }]}
                contentFit="cover"
                transition={200}
              />
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

          {(solo.photo_count ?? 0) > 0 && (
            <View style={styles.statsBadge} pointerEvents="none">
              <Ionicons name="images-outline" size={11} color="#fff" />
              <Text style={styles.statsText}>{formatCount(solo.photo_count!)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────── MULTI ────────────────────────────────────────
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable onPress={showBreakInfo ? goToBreakOnDate : undefined} style={styles.headerLeft}>
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
      </View>

      {/* Carousel — one slide per session, all routed to break+date page. */}
      <View onLayout={(e: LayoutChangeEvent) => setSlideWidth(e.nativeEvent.layout.width)}>
        <View style={[styles.thumbnail, styles.emptyThumb, { aspectRatio: 4 / 5, backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
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
            renderItem={({ item }) => (
              <Pressable onPress={goToBreakOnDate} style={{ width: slideWidth, aspectRatio: 4 / 5 }}>
                <Image
                  source={{ uri: item.thumbnail! }}
                  style={{ width: slideWidth, aspectRatio: 4 / 5 }}
                  contentFit="cover"
                  transition={200}
                />
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

        {/* Photo count for the active slide. Bottom-left. */}
        {(slides[activeSlide]?.photo_count ?? 0) > 0 && (
          <View style={styles.statsBadge} pointerEvents="none">
            <Ionicons name="images-outline" size={11} color="#fff" />
            <Text style={styles.statsText}>{formatCount(slides[activeSlide].photo_count!)}</Text>
          </View>
        )}
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
