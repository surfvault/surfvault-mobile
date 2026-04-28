import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Dimensions,
  type ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useDispatch } from 'react-redux';
import {
  useGetBoardroomShapersQuery,
  useRecordAdImpressionMutation,
  type BoardroomShaper,
  type BoardroomAd,
} from '../store';
import { useUser } from '../context/UserProvider';
import { useUserCoords } from '../hooks/useUserCoords';
import { setCoordinates } from '../store/slices/location';
import { currentDevice } from '../helpers/adTracking';
import { extractInstagramHandle, normalizeWebsite } from '../helpers/socialUrl';
import { useTrackedPush } from '../context/NavigationContext';
import ActionSheet from './ActionSheet';
import type { ActionSheetSection } from './ActionSheet';

const MAX_INLINE_SLIDES = 6;

type Props = {
  isDark: boolean;
};

export default function BoardroomFeed({ isDark }: Props) {
  const dispatch = useDispatch();
  const { user } = useUser();
  const { lat: deviceLat, lon: deviceLon } = useUserCoords();

  // Anchor to the user's home surf break (`users.surf_break_id` -> break coords),
  // not their profile coordinates. Custom shapers are bought near where you
  // surf, not where you happen to be standing — so the home break is the
  // signal we want, and it's stable across travel and broken simulator GPS.
  // Coords come from JSONB and may be strings — parseFloat handles both.
  const breakCoords = (user?.surf_break_coordinates ?? null) as
    | { lat?: number | string; lon?: number | string }
    | null;
  const parseCoord = (v: unknown): number | null => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };
  const breakLat = parseCoord(breakCoords?.lat);
  const breakLon = parseCoord(breakCoords?.lon);

  const lat = breakLat ?? deviceLat;
  const lon = breakLon ?? deviceLon;
  const hasCoords = lat != null && lon != null;

  const breakName =
    typeof user?.surf_break_name === 'string' ? (user.surf_break_name as string) : null;
  const breakRegion =
    typeof user?.surf_break_region === 'string' ? (user.surf_break_region as string) : null;
  const breakCountry =
    typeof user?.surf_break_country === 'string' ? (user.surf_break_country as string) : null;
  const usingBreak = breakLat != null && breakLon != null && !!breakName;
  const breakSubtitle = usingBreak
    ? [breakName, breakRegion?.replaceAll('_', ' '), breakCountry].filter(Boolean).join(' · ')
    : null;

  const { data, isLoading, isFetching, refetch } = useGetBoardroomShapersQuery(
    { lat: lat as number, lon: lon as number },
    { skip: !hasCoords }
  );

  const shapers = useMemo<BoardroomShaper[]>(
    () => data?.results?.shapers ?? [],
    [data]
  );

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (!hasCoords) return;
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [hasCoords, refetch]);

  const handleEnableLocation = useCallback(async () => {
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      let status = existing.status;
      if (status !== 'granted' && existing.canAskAgain) {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      dispatch(
        setCoordinates({ lat: loc.coords.latitude, lon: loc.coords.longitude })
      );
    } catch {
      /* noop — caller already in fallback empty state */
    }
  }, [dispatch]);

  // ---- States ----

  if (!hasCoords) {
    return (
      <ScrollView
        contentContainerStyle={styles.centerWrap}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} />}
      >
        <View style={[styles.iconWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <MaterialCommunityIcons
            name="map-marker-radius-outline"
            size={36}
            color={isDark ? '#9ca3af' : '#6b7280'}
          />
        </View>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#111827' }]}>
          Find local shapers
        </Text>
        <Text style={[styles.body, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
          Boardroom uses your location to surface custom surfboard shapers in your area.
        </Text>
        <Pressable
          onPress={handleEnableLocation}
          style={[styles.cta, { backgroundColor: isDark ? '#0ea5e9' : '#0284c7' }]}
        >
          <Ionicons name="location-outline" size={16} color="#fff" />
          <Text style={styles.ctaText}>Use my location</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.centerWrap, { paddingVertical: 80 }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (shapers.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.centerWrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={[styles.iconWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <MaterialCommunityIcons
            name="tools"
            size={36}
            color={isDark ? '#9ca3af' : '#6b7280'}
          />
        </View>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#111827' }]}>
          No shapers nearby
        </Text>
        {breakSubtitle ? (
          <View
            style={[
              styles.breakPill,
              { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' },
            ]}
          >
            <Ionicons
              name="location-outline"
              size={12}
              color={isDark ? '#9ca3af' : '#6b7280'}
            />
            <Text
              style={[styles.breakPillText, { color: isDark ? '#9ca3af' : '#6b7280' }]}
              numberOfLines={1}
            >
              {breakSubtitle}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.body, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
          We don't have any custom shapers listed in your area yet. Check back soon — we're adding more all the time.
        </Text>
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={shapers}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => <ShaperCard shaper={item} isDark={isDark} />}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 4 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      showsVerticalScrollIndicator={false}
      ListFooterComponent={
        isFetching && !refreshing ? (
          <View style={{ paddingVertical: 24 }}>
            <ActivityIndicator />
          </View>
        ) : null
      }
    />
  );
}

type Slide =
  | { kind: 'ad'; ad: BoardroomAd }
  | { kind: 'cta'; count: number; noun: string };

// Shared stat helper — count distinct boards via cta_label when every ad is
// labeled, otherwise fall back to honest photo count. Mirrors the detail
// page so the feed CTA and the detail header agree.
function computeShaperStat(ads: BoardroomAd[]): { count: number; noun: string } {
  if (!ads.length) return { count: 0, noun: 'boards' };
  const allLabeled = ads.every((a) => a.cta_label?.trim());
  if (!allLabeled) {
    return { count: ads.length, noun: ads.length === 1 ? 'photo' : 'photos' };
  }
  const distinct = new Set(ads.map((a) => a.cta_label!.trim().toLowerCase())).size;
  return { count: distinct, noun: distinct === 1 ? 'board' : 'boards' };
}

function ShaperCard({ shaper, isDark }: { shaper: BoardroomShaper; isDark: boolean }) {
  const [recordImpression] = useRecordAdImpressionMutation();
  const trackedPush = useTrackedPush();
  const [width, setWidth] = useState(Dimensions.get('window').width);
  const [activeIdx, setActiveIdx] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);
  const firedRef = useRef<Set<string>>(new Set());

  // Cap inline carousel — partners with dozens of boards get a "See all N
  // boards" CTA tile as the final slide that pushes to the shaper detail
  // page. Keeps the feed scrollable and avoids preloading 50 images per card.
  const slides: Slide[] = useMemo(() => {
    if (shaper.ads.length <= MAX_INLINE_SLIDES) {
      return shaper.ads.map((ad) => ({ kind: 'ad' as const, ad }));
    }
    const visible = shaper.ads.slice(0, MAX_INLINE_SLIDES);
    const stat = computeShaperStat(shaper.ads);
    return [
      ...visible.map((ad) => ({ kind: 'ad' as const, ad })),
      { kind: 'cta' as const, count: stat.count, noun: stat.noun },
    ];
  }, [shaper.ads]);

  const isCarousel = slides.length > 1;
  const activeSlide = slides[activeIdx] ?? slides[0];
  // Primary "ad" reference for header/footer state. CTA slide falls back to
  // the first ad so headers stay coherent while users sit on the CTA.
  const active: BoardroomAd =
    activeSlide?.kind === 'ad'
      ? activeSlide.ad
      : (shaper.ads[0] as BoardroomAd);

  const openShaperDetail = useCallback(() => {
    trackedPush(`/shaper/${shaper.id}` as any);
  }, [trackedPush, shaper.id]);

  // Reset impression tracking when the slide set changes (e.g. partner refetch).
  useEffect(() => {
    firedRef.current = new Set();
    setActiveIdx(0);
  }, [shaper.id, slides.length]);

  // Fire one impression per ad slide as it becomes the active page. CTA slides
  // are skipped (no ad to attribute the impression to).
  useEffect(() => {
    const target = slides[activeIdx];
    if (!target || target.kind !== 'ad') return;
    if (firedRef.current.has(target.ad.id)) return;
    firedRef.current.add(target.ad.id);
    recordImpression({
      adId: target.ad.id,
      placement: 'content',
      device: currentDevice(),
    }).catch(() => { /* fire-and-forget */ });
  }, [activeIdx, slides, recordImpression]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!viewableItems.length) return;
    const first = viewableItems[0];
    if (typeof first.index === 'number') setActiveIdx(first.index);
  }).current;

  // Boardroom isn't an ad surface — board taps push into the shaper's gallery
  // rather than opening the partner's website. Contact actions (call / IG /
  // website) live on the detail page. We still record impressions so partners
  // see how often their work was viewed; clicks aren't meaningful here.
  const handleBoardPress = openShaperDetail;

  const handleCallPartner = useCallback(() => {
    if (!shaper.phone_number) return;
    const num = shaper.phone_number.startsWith('tel:')
      ? shaper.phone_number
      : `tel:${shaper.phone_number}`;
    Linking.openURL(num).catch(() => {});
  }, [shaper.phone_number]);

  const subtitle = `${formatDistance(shaper.distance_km)} away`;

  const handleReport = useCallback(() => {
    // Mailto-based report — keeps moderation working without a dedicated
    // backend endpoint. Prefills the partner + active ad id so support can
    // act fast.
    const subject = encodeURIComponent(`Boardroom report: ${shaper.company_name}`);
    const body = encodeURIComponent(
      [
        `Reporting ad content in Boardroom.`,
        ``,
        `Partner: ${shaper.company_name}`,
        `Partner ID: ${shaper.id}`,
        `Ad ID: ${active?.id ?? '(unknown)'}`,
        ``,
        `Reason:`,
        ``,
      ].join('\n')
    );
    Linking.openURL(`mailto:support@surf-vault.com?subject=${subject}&body=${body}`).catch(() => {});
  }, [shaper.company_name, shaper.id, active?.id]);

  // Mirror the detail page's action sheet so behaviour is consistent across
  // surfaces. Contact actions derive from the same fields.
  const firstClickUrl =
    shaper.ads.find((a) => !!a.click_url && a.cta_type !== 'tel')?.click_url ?? null;
  const igHandle = extractInstagramHandle(firstClickUrl);
  const websiteUrl = igHandle ? null : normalizeWebsite(firstClickUrl);

  const sheetSections: ActionSheetSection[] = [];
  const contactOptions = [];
  if (shaper.phone_number) {
    contactOptions.push({
      label: `Call ${shaper.phone_number}`,
      icon: 'call-outline' as const,
      onPress: handleCallPartner,
    });
  }
  if (igHandle) {
    contactOptions.push({
      label: `View @${igHandle} on Instagram`,
      icon: 'logo-instagram' as const,
      onPress: () => {
        Linking.openURL(`https://instagram.com/${igHandle}`).catch(() => {});
      },
    });
  }
  if (websiteUrl) {
    contactOptions.push({
      label: 'View website',
      icon: 'link-outline' as const,
      onPress: () => {
        Linking.openURL(websiteUrl).catch(() => {});
      },
    });
  }
  if (contactOptions.length) sheetSections.push({ options: contactOptions });
  sheetSections.push({
    options: [{
      label: 'Report',
      icon: 'flag-outline',
      destructive: true,
      onPress: handleReport,
    }],
  });

  return (
    <View style={styles.card} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Header — partner identity. Tapping anywhere on the avatar/name area
          pushes to the shaper detail page. Consistent entry point regardless
          of how many boards the shaper has (the in-carousel CTA tile only
          appears when boards overflow MAX_INLINE_SLIDES). */}
      <View style={styles.header}>
        <Pressable onPress={openShaperDetail} style={styles.headerLeft}>
          <View style={[styles.avatar, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            {shaper.logo_url ? (
              <Image source={{ uri: shaper.logo_url }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <MaterialCommunityIcons
                name="surfing"
                size={18}
                color={isDark ? '#9ca3af' : '#6b7280'}
              />
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text
              style={[styles.companyName, { color: isDark ? '#ffffff' : '#111827' }]}
              numberOfLines={1}
            >
              {shaper.company_name}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setSheetVisible(true)} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
        </Pressable>
      </View>

      {/* Hero — carousel when multi-slide, single Pressable otherwise.
          Slide Pressables go INSIDE renderItem (not wrapping the FlatList) so
          horizontal swipes don't fight an outer tap-gesture recognizer.
          Boardroom images are landscape (5:4) but the card is portrait (4:5)
          to match discover, so we render the slide as a contained image atop
          a blurred copy of itself — keeps the card tall without cropping the
          board, and the bands feel intentional rather than empty. */}
      {isCarousel ? (
        <View>
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={slides}
            keyExtractor={(s, i) => s.kind === 'ad' ? s.ad.id : `cta-${i}`}
            renderItem={({ item }) => {
              if (item.kind === 'cta') {
                return (
                  <Pressable onPress={openShaperDetail} style={{ width }}>
                    <CtaTile count={item.count} noun={item.noun} isDark={isDark} width={width} />
                  </Pressable>
                );
              }
              return (
                <Pressable onPress={() => handleBoardPress()} style={{ width }}>
                  <SlideHero
                    uri={item.ad.hero_media_url || item.ad.media_url || null}
                    ctaLabel={item.ad.cta_label}
                    isDark={isDark}
                    width={width}
                  />
                </Pressable>
              );
            }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
          {/* Tapered dot pager — same pattern as SessionCard / SponsoredCard. */}
          <View style={styles.dotsRow}>
            {slides.map((s, i) => {
              const dist = Math.abs(i - activeIdx);
              const size = 8 - dist;
              if (size < 1) return null;
              const isActive = i === activeIdx;
              return (
                <View
                  key={s.kind === 'ad' ? s.ad.id : `cta-${i}`}
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
        </View>
      ) : (
        <Pressable onPress={handleBoardPress}>
          <SlideHero
            uri={active.hero_media_url || active.media_url || null}
            ctaLabel={active.cta_label}
            isDark={isDark}
            width={width}
          />
        </Pressable>
      )}

      {/* Body — optional longer description under the hero. Board name is
          shown as a pill overlay on the hero itself, not here. */}
      {active.body ? (
        <Pressable onPress={handleBoardPress} style={styles.footer}>
          <Text
            style={[styles.body, { color: isDark ? '#d1d5db' : '#374151' }]}
            numberOfLines={2}
          >
            {active.body}
          </Text>
        </Pressable>
      ) : null}

      <ActionSheet
        visible={sheetVisible}
        sections={sheetSections}
        header={{
          title: shaper.company_name,
          subtitle,
          imageUri: shaper.logo_url ?? undefined,
        }}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

function SlideHero({
  uri,
  ctaLabel,
  isDark,
  width,
}: {
  uri: string | null;
  ctaLabel: string | null;
  isDark: boolean;
  width: number;
}) {
  return (
    <View style={[styles.thumb, { width, backgroundColor: isDark ? '#0b0b0b' : '#f3f4f6' }]}>
      {uri ? (
        <>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            blurRadius={40}
            transition={200}
          />
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)' },
            ]}
          />
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFillObject}
            contentFit="contain"
            transition={200}
          />
        </>
      ) : (
        <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
      )}

      {/* Board-name pill — bottom right, white, mirrors the CTA pill on web ads.
          pointerEvents="none" so taps fall through to the slide's Pressable. */}
      {ctaLabel ? (
        <View style={styles.ctaPill} pointerEvents="none">
          <Text style={styles.ctaPillText} numberOfLines={1}>
            {ctaLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function CtaTile({
  count,
  noun,
  isDark,
  width,
}: {
  count: number;
  noun: string;
  isDark: boolean;
  width: number;
}) {
  return (
    <View
      style={[
        styles.thumb,
        styles.ctaTile,
        { width, backgroundColor: isDark ? '#0b0b0b' : '#f3f4f6' },
      ]}
    >
      <View style={[styles.ctaIconWrap, { backgroundColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
        <Ionicons
          name="grid-outline"
          size={28}
          color={isDark ? '#d1d5db' : '#374151'}
        />
      </View>
      <Text style={[styles.ctaTitle, { color: isDark ? '#fff' : '#111827' }]}>
        See all {count} {noun}
      </Text>
      <View style={styles.ctaHintRow}>
        <Text style={[styles.ctaHint, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
          Tap to open
        </Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={isDark ? '#9ca3af' : '#6b7280'}
        />
      </View>
    </View>
  );
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

const styles = StyleSheet.create({
  centerWrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 80,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 19,
  },
  breakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 10,
    maxWidth: 280,
  },
  breakPillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 24,
  },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
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
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  headerInfo: {
    marginLeft: 8,
    flex: 1,
  },
  companyName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 1,
  },
  thumb: {
    width: '100%',
    aspectRatio: 4 / 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTile: {
    gap: 10,
    paddingHorizontal: 24,
  },
  ctaIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
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
  footer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ctaPill: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    maxWidth: '70%',
  },
  ctaPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 8,
    paddingBottom: 2,
  },
});
