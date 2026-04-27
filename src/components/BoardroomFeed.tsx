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
import { buildAdClickUrl, currentDevice } from '../helpers/adTracking';
import ActionSheet from './ActionSheet';
import type { ActionSheetSection } from './ActionSheet';

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

function ShaperCard({ shaper, isDark }: { shaper: BoardroomShaper; isDark: boolean }) {
  const [recordImpression] = useRecordAdImpressionMutation();
  const [width, setWidth] = useState(Dimensions.get('window').width);
  const [activeIdx, setActiveIdx] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);
  const firedRef = useRef<Set<string>>(new Set());

  const slides = shaper.ads;
  const isCarousel = slides.length > 1;
  const active = slides[activeIdx] ?? slides[0];

  // Reset impression tracking when the slide set changes (e.g. partner refetch).
  useEffect(() => {
    firedRef.current = new Set();
    setActiveIdx(0);
  }, [shaper.id, slides.length]);

  // Fire one impression per slide as it becomes the active page (or for the
  // single-ad fallback when the card mounts).
  useEffect(() => {
    const target = slides[activeIdx];
    if (!target?.id || firedRef.current.has(target.id)) return;
    firedRef.current.add(target.id);
    recordImpression({
      adId: target.id,
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

  const openClick = useCallback((slide: BoardroomAd) => {
    // Tel CTAs short-circuit through Linking — no point round-tripping the
    // click-tracker for a phone dial.
    if (slide.cta_type === 'tel' && slide.click_url) {
      const num = slide.click_url.startsWith('tel:') ? slide.click_url : `tel:${slide.click_url}`;
      Linking.openURL(num).catch(() => {});
      return;
    }
    const url = buildAdClickUrl(slide.id, { placement: 'content', device: currentDevice() });
    Linking.openURL(url).catch(() => {});
  }, []);

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

  const sheetSections: ActionSheetSection[] = [];
  if (shaper.phone_number) {
    sheetSections.push({
      options: [{
        label: `Call ${shaper.company_name}`,
        icon: 'call-outline',
        onPress: handleCallPartner,
      }],
    });
  }
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
      {/* Header — partner identity */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
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
        </View>
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
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <Pressable onPress={() => openClick(item)} style={{ width }}>
                <SlideHero
                  uri={item.hero_media_url || item.media_url || null}
                  ctaLabel={item.cta_label}
                  isDark={isDark}
                  width={width}
                />
              </Pressable>
            )}
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
                  key={s.id}
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
        <Pressable onPress={() => openClick(active)}>
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
        <Pressable onPress={() => openClick(active)} style={styles.footer}>
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
