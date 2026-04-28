import { useCallback, useMemo, useRef, useState } from 'react';
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
  type BoardroomShaper,
  type Board,
} from '../store';
import { useUser } from '../context/UserProvider';
import { useUserCoords } from '../hooks/useUserCoords';
import { setCoordinates } from '../store/slices/location';
import { useTrackedPush } from '../context/NavigationContext';
import { getBoardPhotoUrl } from '../helpers/mediaUrl';
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

  // Anchor to the user's home surf break — custom shapers are bought near
  // where you surf, not where you happen to be standing.
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
      /* noop */
    }
  }, [dispatch]);

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
  | { kind: 'board'; board: Board }
  | { kind: 'cta' };

function ShaperCard({ shaper, isDark }: { shaper: BoardroomShaper; isDark: boolean }) {
  const trackedPush = useTrackedPush();
  const [width, setWidth] = useState(Dimensions.get('window').width);
  const [activeIdx, setActiveIdx] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);

  // One slide per featured BOARD (showing its first photo). Multi-photo
  // browsing happens on the shaper's profile gallery, not in the feed card.
  const slides: Slide[] = useMemo(() => {
    const boards = shaper.featured_boards ?? [];
    const visible = boards.slice(0, MAX_INLINE_SLIDES);
    const items: Slide[] = visible.map((b) => ({ kind: 'board' as const, board: b }));
    if (boards.length > MAX_INLINE_SLIDES) items.push({ kind: 'cta' });
    return items;
  }, [shaper.featured_boards]);

  const isCarousel = slides.length > 1;
  const activeSlide = slides[activeIdx] ?? slides[0];
  const activeBoard: Board | null =
    activeSlide?.kind === 'board' ? activeSlide.board : (shaper.featured_boards?.[0] ?? null);

  const openShaperProfile = useCallback(() => {
    trackedPush(`/user/${shaper.handle}` as any);
  }, [trackedPush, shaper.handle]);

  const handleCallShaper = useCallback(() => {
    if (!shaper.phone_number) return;
    const num = shaper.phone_number.startsWith('tel:')
      ? shaper.phone_number
      : `tel:${shaper.phone_number}`;
    Linking.openURL(num).catch(() => {});
  }, [shaper.phone_number]);

  const handleInstagram = useCallback(() => {
    if (!shaper.instagram) return;
    Linking.openURL(`https://instagram.com/${shaper.instagram.replace(/^@/, '')}`).catch(() => {});
  }, [shaper.instagram]);

  const handleWebsite = useCallback(() => {
    if (!shaper.website) return;
    const url = shaper.website.startsWith('http') ? shaper.website : `https://${shaper.website}`;
    Linking.openURL(url).catch(() => {});
  }, [shaper.website]);

  const handleReport = useCallback(() => {
    const subject = encodeURIComponent(`Boardroom report: ${shaper.name ?? shaper.handle}`);
    const body = encodeURIComponent(
      [
        `Reporting Boardroom shaper.`,
        ``,
        `Shaper: ${shaper.name ?? shaper.handle}`,
        `Handle: @${shaper.handle}`,
        `User ID: ${shaper.id}`,
        activeBoard ? `Board: ${activeBoard.name} (${activeBoard.id})` : '',
        ``,
        `Reason:`,
        ``,
      ].filter(Boolean).join('\n')
    );
    Linking.openURL(`mailto:support@surf-vault.com?subject=${subject}&body=${body}`).catch(() => {});
  }, [shaper, activeBoard]);

  const sheetSections: ActionSheetSection[] = [];
  const contactOptions = [];
  if (shaper.phone_number) {
    contactOptions.push({
      label: `Call ${shaper.phone_number}`,
      icon: 'call-outline' as const,
      onPress: handleCallShaper,
    });
  }
  if (shaper.instagram) {
    contactOptions.push({
      label: `View @${shaper.instagram} on Instagram`,
      icon: 'logo-instagram' as const,
      onPress: handleInstagram,
    });
  }
  if (shaper.website) {
    contactOptions.push({
      label: 'View website',
      icon: 'link-outline' as const,
      onPress: handleWebsite,
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

  const subtitle = `${formatDistance(shaper.distance_km)} away`;

  return (
    <View style={styles.card} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Header taps into the shaper's profile gallery — consistent entry
          regardless of the inline carousel size. */}
      <View style={styles.header}>
        <Pressable onPress={openShaperProfile} style={styles.headerLeft}>
          <View style={[styles.avatar, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            {shaper.picture ? (
              <Image source={{ uri: shaper.picture }} style={styles.avatarImg} contentFit="cover" />
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
              style={[styles.shaperName, { color: isDark ? '#fff' : '#111827' }]}
              numberOfLines={1}
            >
              {shaper.name ?? shaper.handle}
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

      {/* Hero — 4:5 portrait card with contained landscape photo on a blurred
          duplicate (matches discover feed proportions). Slide Pressables go
          INSIDE renderItem so horizontal swipes don't fight tap recognition. */}
      {isCarousel ? (
        <View>
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={slides}
            keyExtractor={(s, i) => s.kind === 'board' ? s.board.id : `cta-${i}`}
            renderItem={({ item }) => {
              if (item.kind === 'cta') {
                return (
                  <Pressable onPress={openShaperProfile} style={{ width }}>
                    <CtaTile isDark={isDark} width={width} />
                  </Pressable>
                );
              }
              const photoUri = getBoardPhotoUrl(item.board.photos[0]?.s3_key);
              return (
                <Pressable onPress={openShaperProfile} style={{ width }}>
                  <SlideHero
                    uri={photoUri}
                    boardName={item.board.name}
                    isDark={isDark}
                    width={width}
                  />
                </Pressable>
              );
            }}
            onViewableItemsChanged={useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
              if (!viewableItems.length) return;
              const first = viewableItems[0];
              if (typeof first.index === 'number') setActiveIdx(first.index);
            }).current}
            viewabilityConfig={useRef({ itemVisiblePercentThreshold: 60 }).current}
          />
          <View style={styles.dotsRow}>
            {slides.map((s, i) => {
              const dist = Math.abs(i - activeIdx);
              const size = 8 - dist;
              if (size < 1) return null;
              const isActive = i === activeIdx;
              return (
                <View
                  key={s.kind === 'board' ? s.board.id : `cta-${i}`}
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
      ) : activeBoard ? (
        <Pressable onPress={openShaperProfile}>
          <SlideHero
            uri={getBoardPhotoUrl(activeBoard.photos[0]?.s3_key)}
            boardName={activeBoard.name}
            isDark={isDark}
            width={width}
          />
        </Pressable>
      ) : null}

      <ActionSheet
        visible={sheetVisible}
        sections={sheetSections}
        header={{
          title: shaper.name ?? shaper.handle,
          subtitle,
          imageUri: shaper.picture ?? undefined,
        }}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

function SlideHero({
  uri,
  boardName,
  isDark,
  width,
}: {
  uri: string | null;
  boardName: string | null;
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

      {boardName ? (
        <View style={styles.ctaPill} pointerEvents="none">
          <Text style={styles.ctaPillText} numberOfLines={1}>
            {boardName}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function CtaTile({ isDark, width }: { isDark: boolean; width: number }) {
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
        See full lineup
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
  shaperName: {
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
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 8,
    paddingBottom: 2,
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
});
