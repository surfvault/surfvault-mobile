import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  InteractionManager,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTrackedPush } from '../../src/context/NavigationContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Region, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import ClusteredMapView from 'react-native-map-clustering';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { Dimensions } from 'react-native';
import MapNearbySheet, { SheetMode } from '../../src/components/MapNearbySheet';
import { MapNearbyItem } from '../../src/components/MapNearbyCard';
import { useSelector, useDispatch } from 'react-redux';
import * as Location from 'expo-location';
import { setCoordinates } from '../../src/store/slices/location';
import { useUser } from '../../src/context/UserProvider';
import { useUserPreferences, formatDistance } from '../../src/helpers/preferences';
import { useAuth } from '../../src/context/AuthProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useGetMapSurfBreaksQuery, useGetMapAdsQuery, useGetSurfBreaksQuery, useGetNearbySurfBreaksQuery, useGetNearbyPhotographersQuery, useCreateSurfBreakMutation, useRecordAdImpressionMutation } from '../../src/store';
import { buildAdClickUrl, currentDevice } from '../../src/helpers/adTracking';
import UserAvatar from '../../src/components/UserAvatar';
import AddSurfBreakSheet from '../../src/components/AddSurfBreakSheet';
import GradientRing, { ACTIVE_STOPS, NOTE_STOPS } from '../../src/components/GradientRing';
import { FlatList } from 'react-native';
import React from 'react';

type FilterType = 'all' | 'favorites' | 'mine';

// Memoized marker component — prevents clustering library from re-diffing on every render
const SurfBreakMarker = React.memo(({
  sb,
  markerColor,
  isSelected,
  onMarkerPress,
}: {
  sb: any;
  markerColor: string;
  isSelected: boolean;
  onMarkerPress: (sb: any) => void;
}) => {
  // Android snapshots the custom marker view to a bitmap; with tracking off
  // from the first frame it paints blank. Track briefly on mount and whenever
  // the appearance changes (color, or dot<->pin on selection), then stop.
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 500);
    return () => clearTimeout(t);
  }, [markerColor, isSelected]);

  const handlePress = useCallback(() => onMarkerPress(sb), [sb, onMarkerPress]);

  return (
    <Marker
      key={sb.id}
      coordinate={{
        latitude: parseFloat(sb.coordinates?.lat) || 0,
        longitude: parseFloat(sb.coordinates?.lon) || 0,
      }}
      tracksViewChanges={tracks}
      onPress={handlePress}
      // iOS (Apple Maps) propagates a marker tap to the MapView's onPress too,
      // which would immediately clear the selection this press just set. Stop it
      // here. No-op on Android (it never propagates marker taps).
      stopPropagation
      // Only the selected pin gets an anchor (tip on the coordinate) + raised
      // zIndex. Setting `anchor` on the plain dot breaks Marker onPress on iOS,
      // so the unselected dot is left with default anchor/zIndex.
      {...(isSelected ? { anchor: { x: 0.5, y: 1 }, zIndex: 999 } : null)}
    >
      {isSelected ? (
        <View style={styles.selectedPin}>
          <Ionicons name="location" size={44} color={markerColor} />
        </View>
      ) : (
        <View style={[styles.marker, { backgroundColor: markerColor }]} />
      )}
    </Marker>
  );
});

// Cluster bubble. Same Android tracksViewChanges caveat as SurfBreakMarker —
// track briefly (re-arming on count/color change) then stop.
const ClusterMarker = React.memo(({
  id,
  coordinate,
  count,
  color,
  onPress,
}: {
  id: string | number;
  coordinate: { latitude: number; longitude: number };
  count: number;
  color: string;
  onPress: () => void;
}) => {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 500);
    return () => clearTimeout(t);
  }, [count, color]);

  return (
    <Marker key={`cluster-${id}`} coordinate={coordinate} onPress={onPress} tracksViewChanges={tracks}>
      <View style={[styles.cluster, { backgroundColor: color }]}>
        <Text style={styles.clusterText}>{count}</Text>
      </View>
    </Marker>
  );
});

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#0e1626' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#023e58' }] },
];

const INITIAL_REGION: Region = {
  latitude: 20,
  longitude: -40,
  latitudeDelta: 80,
  longitudeDelta: 80,
};

// Module-level so the value survives the map screen losing focus to a
// pushed break page. Cleared after the restore animation runs once.
let pendingRestoreBreak: any = null;

export default function MapScreen() {
  const router = useRouter();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();
  const { units, nearby: nearbyPrefs } = useUserPreferences();
  const { isAuthenticated } = useAuth();
  const requireAuth = useRequireAuth();
  const dispatch = useDispatch();
  const mapRef = useRef<MapView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const hasAnimatedToLocation = useRef(false);
  const isAnimatingRef = useRef(false);
  const [locationGranted, setLocationGranted] = useState(false);

  // Device location from Redux
  const deviceCoords = useSelector((state: any) => state.location.coordinates);

  // If we already have device coords from a previous session/tab visit, open
  // the map zoomed to that location so the surf-break query fires on first
  // mount (instead of waiting for the location animation to settle past the
  // isZoomedTooFarOut threshold).
  const initialMapRegion = useMemo<Region>(() => {
    if (deviceCoords?.lat && deviceCoords?.lon) {
      return {
        latitude: Number(deviceCoords.lat),
        longitude: Number(deviceCoords.lon),
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };
    }
    return INITIAL_REGION;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If we initialized at user coords, no need to animate later — mark as done
  // synchronously so the deviceCoords useEffect skips the redundant animation.
  if (initialMapRegion !== INITIAL_REGION && !hasAnimatedToLocation.current) {
    hasAnimatedToLocation.current = true;
  }

  // Request location permission when map tab is first visited
  useEffect(() => {
    (async () => {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'undetermined') {
        const result = await Location.requestForegroundPermissionsAsync();
        status = result.status;
      }
      if (status === 'granted') {
        setLocationGranted(true);
        // If we don't have coords in Redux yet, fetch and store them
        if (!deviceCoords?.lat || !deviceCoords?.lon) {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const lat = loc.coords.latitude;
            const lon = loc.coords.longitude;
            dispatch(setCoordinates({ lat, lon }));
            if (!hasAnimatedToLocation.current) {
              hasAnimatedToLocation.current = true;
              isAnimatingRef.current = true;
              mapRef.current?.animateToRegion({
                latitude: lat, longitude: lon,
                latitudeDelta: 0.5, longitudeDelta: 0.5,
              }, 800);
            }
          } catch {}
        }
      }
    })();
  }, []);

  // Animate to user's location from Redux when available
  useEffect(() => {
    if (hasAnimatedToLocation.current) return;
    if (deviceCoords?.lat && deviceCoords?.lon) {
      hasAnimatedToLocation.current = true;
      setLocationGranted(true);
      isAnimatingRef.current = true;
      mapRef.current?.animateToRegion({
        latitude: deviceCoords.lat,
        longitude: deviceCoords.lon,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }, 800);
    }
  }, [deviceCoords]);

  const [region, setRegion] = useState<Region>(initialMapRegion);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [selectedBreak, setSelectedBreak] = useState<any>(null);
  // Bottom-sheet state. `sheetMode` decides which type of carousel + which
  // section is pinned to top. `selectedAd` lives next to `selectedBreak` so we
  // know which marker the user tapped most recently (drives the carousel's
  // initial centered card). Auto-opens to half-snap on marker tap or when the
  // map is zoomed past the threshold below.
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>('break');
  const sheetRef = useRef<BottomSheet>(null);
  const CARD_WIDTH = Math.round(Dimensions.get('window').width * 0.85);
  // Capture the initial zoom-range state once at mount so the BottomSheet
  // mounts at the right snap point (peek if already zoomed-in, else closed).
  // Subsequent zoom changes are handled by the sheetInZoomRange useEffect
  // calling snapToIndex on the ref. Captured once to avoid this becoming a
  // controlled-component pattern that fights with user drag gestures.
  const initialSheetIndexRef = useRef<number>(
    initialMapRegion.latitudeDelta <= 2.0 ? 0 : -1,
  );
  // Tracks whether the zoom-auto-open effect has already snapped the sheet
  // open for the current zoom-in band. Seeded from the initial mount state so
  // the effect doesn't fire a redundant snapToIndex on first render when the
  // sheet already started at peek via `initialIndex`.
  const sheetAutoOpenedRef = useRef(initialSheetIndexRef.current === 0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [regionStable, setRegionStable] = useState(true);
  // Track committed markers separately so clustering library never sees mid-gesture updates
  const [committedBreaks, setCommittedBreaks] = useState<any[]>([]);

  // Super-admin: long-press the map to drop a new surf break here
  const isSuperAdmin = !!(user as any)?.super_admin;
  const [pendingBreakCoord, setPendingBreakCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addBreakSheetVisible, setAddBreakSheetVisible] = useState(false);
  const [createSurfBreak] = useCreateSurfBreakMutation();

  // Round bounds based on zoom level — coarser when zoomed out, precise when zoomed in
  const precision = region.latitudeDelta > 10 ? 10 : region.latitudeDelta > 1 ? 100 : 1000;
  const minLat = Math.floor((region.latitude - region.latitudeDelta / 2) * precision) / precision;
  const maxLat = Math.ceil((region.latitude + region.latitudeDelta / 2) * precision) / precision;
  const minLon = Math.floor((region.longitude - region.longitudeDelta / 2) * precision) / precision;
  const maxLon = Math.ceil((region.longitude + region.longitudeDelta / 2) * precision) / precision;

  const getContinent = (lat: number, lon: number): string => {
    if (lat < -60) return 'an';
    if (lat > 0 && lon > -170 && lon < -30) return 'na';
    if (lat < 0 && lon > -80 && lon < -30) return 'sa';
    if (lat > -35 && lon >= -20 && lon <= 60) return 'af';
    if (lat > 35 && lon >= -10 && lon <= 40) return 'eu';
    if (lat > -12 && lon > 60 && lon < 180) return 'as';
    if (lat < 0 && lon > 110 && lon < 180) return 'oc';
    return 'na';
  };

  // Skip fetching when zoomed too far out — clustering too many markers causes crashes
  const isZoomedTooFarOut = region.latitudeDelta > 40;

  const { data, isFetching } = useGetMapSurfBreaksQuery(
    {
      viewerId: user?.id ?? '',
      continent: getContinent(region.latitude, region.longitude),
      minLat, maxLat, minLon, maxLon,
      favorites: filter === 'favorites',
      mine: filter === 'mine',
    },
    { skip: isZoomedTooFarOut }
  );

  const latestBreaks = useMemo(
    () => data?.results?.breaks ?? data?.results?.surfBreaks ?? [],
    [data]
  );

  // Per-ad venue pins (mobile-only ad map surface). Same viewport bounds as the
  // break query; backend returns approved+active ads whose venue is in-bounds
  // and that target ≥1 break.
  const { data: adData } = useGetMapAdsQuery(
    { minLat, maxLat, minLon, maxLon },
    { skip: isZoomedTooFarOut }
  );
  const mapAds = useMemo(() => adData?.results?.ads ?? [], [adData]);
  const [recordImpression] = useRecordAdImpressionMutation();

  const openAdClick = useCallback((ad: any) => {
    if (!ad?.id) return;
    const trackUrl = buildAdClickUrl(ad.id, { placement: 'map', device: currentDevice() });
    if (ad.cta_type === 'tel' && ad.click_url) {
      const number = String(ad.click_url).replace(/^tel:/i, '').trim();
      Alert.alert(ad.company_name || 'Call', number, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => {
            fetch(trackUrl).catch(() => { /* tracking best-effort */ });
            Linking.openURL(`tel:${number}`).catch(() => { /* noop */ });
          },
        },
      ]);
      return;
    }
    Linking.openURL(trackUrl).catch(() => { /* noop */ });
  }, []);

  // Only commit new markers when region is stable AND all animations are done
  useEffect(() => {
    if (isZoomedTooFarOut) {
      setCommittedBreaks([]);
      return;
    }
    if (!regionStable) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (regionStable) {
        setCommittedBreaks(latestBreaks);
      }
    });
    return () => handle.cancel();
  }, [latestBreaks, regionStable, isZoomedTooFarOut]);

  // Cap markers to prevent clustering library from crashing with too many.
  // Memoized so the array reference is stable across unrelated re-renders
  // (e.g. selection changes from carousel swipes). Without this, the slice
  // ran on every parent render and produced a new array each time, which
  // made `react-native-map-clustering` re-cluster on every selection change,
  // unmounting/remounting every marker — the user-visible "pins flash and
  // disappear" symptom.
  const surfBreaks = useMemo(
    () => (committedBreaks.length > 200 ? committedBreaks.slice(0, 200) : committedBreaks),
    [committedBreaks],
  );

  const { data: searchData, isFetching: searchLoading } = useGetSurfBreaksQuery(
    { search: debouncedTerm, limit: 8, continuationToken: '' },
    { skip: debouncedTerm.length < 2 }
  );
  const rawSearchResults = searchData?.results?.breaks ?? searchData?.results?.surfBreaks ?? [];
  const searchResults = rawSearchResults.filter((item: any, index: number, arr: any[]) => {
    const key = `${item.name}:${item.region ?? ''}:${item.country_code ?? ''}`;
    return arr.findIndex((i: any) => `${i.name}:${i.region ?? ''}:${i.country_code ?? ''}` === key) === index;
  });

  // Nearby — local override or user's current break coordinates
  const [nearbyOverride, setNearbyOverride] = useState<{ name: string; lat: number; lon: number } | null>(null);
  const [showNearbyBreakPicker, setShowNearbyBreakPicker] = useState(false);
  const [nearbyBreakSearch, setNearbyBreakSearch] = useState('');
  const [debouncedNearbySearch, setDebouncedNearbySearch] = useState('');
  const nearbyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userBreakCoords = (user as any)?.surf_break_coordinates;
  const userCoords = (user as any)?.coordinates;
  const userBreakName = (user as any)?.surf_break_name ?? (user as any)?.surfBreakName;

  // Try: 1) nearby override, 2) user's break coordinates, 3) user's device coordinates
  const resolvedLat = nearbyOverride?.lat
    ?? (userBreakCoords?.lat ? parseFloat(String(userBreakCoords.lat)) : null)
    ?? (userCoords?.lat ? parseFloat(String(userCoords.lat)) : null);
  const resolvedLon = nearbyOverride?.lon
    ?? (userBreakCoords?.lon ? parseFloat(String(userBreakCoords.lon)) : null)
    ?? (userCoords?.lon ? parseFloat(String(userCoords.lon)) : null);
  const nearbyLat = (resolvedLat != null && !isNaN(resolvedLat)) ? resolvedLat : null;
  const nearbyLon = (resolvedLon != null && !isNaN(resolvedLon)) ? resolvedLon : null;
  const currentNearbyName = nearbyOverride?.name ?? userBreakName;
  const hasNearbyCoords = nearbyLat != null && nearbyLon != null;

  const { data: nearbyBreaksData } = useGetNearbySurfBreaksQuery(
    { lat: nearbyLat ?? 0, long: nearbyLon ?? 0, radiusKm: nearbyPrefs.breaksKm },
    { skip: !hasNearbyCoords }
  );
  const { data: nearbyPhotographersData } = useGetNearbyPhotographersQuery(
    { lat: nearbyLat ?? 0, long: nearbyLon ?? 0, viewerId: user?.id, radiusKm: nearbyPrefs.photographersKm },
    { skip: !hasNearbyCoords || (isAuthenticated && !user?.id) }
  );
  const nearbyBreaks = nearbyBreaksData?.results?.nearbyBreaks ?? nearbyBreaksData?.results?.surfBreaks ?? [];
  const nearbyPhotographers = nearbyPhotographersData?.results?.nearbyPhotographers ?? nearbyPhotographersData?.results?.photographers ?? [];

  // Map bottom-sheet visibility threshold. Peek appears when the user is
  // zoomed in to at least state/coast level (latitudeDelta <= 2 ≈ ~200km
  // across). That's enough zoom-out that a surfer scanning their coastline
  // sees the bar early, but tight enough that we're not listing breaks across
  // a whole hemisphere. Zooming further out auto-closes.
  const SHEET_ZOOM_THRESHOLD = 2.0;
  const sheetInZoomRange = region.latitudeDelta <= SHEET_ZOOM_THRESHOLD;

  // Nearby break picker search
  const { data: nearbyPickerData, isFetching: nearbyPickerLoading } = useGetSurfBreaksQuery(
    { search: debouncedNearbySearch, limit: 8, continuationToken: '' },
    { skip: debouncedNearbySearch.length < 2 }
  );
  const nearbyPickerResults = nearbyPickerData?.results?.breaks ?? nearbyPickerData?.results?.surfBreaks ?? [];

  const handleNearbySearchInput = useCallback((text: string) => {
    setNearbyBreakSearch(text);
    if (nearbyDebounceRef.current) clearTimeout(nearbyDebounceRef.current);
    nearbyDebounceRef.current = setTimeout(() => setDebouncedNearbySearch(text), 400);
  }, []);

  const handleSelectNearbyBreak = useCallback((brk: any) => {
    const lat = parseFloat(brk.coordinates?.lat);
    const lon = parseFloat(brk.coordinates?.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      setNearbyOverride({ name: brk.name, lat, lon });
    }
    setShowNearbyBreakPicker(false);
    setNearbyBreakSearch('');
    setDebouncedNearbySearch('');
    Keyboard.dismiss();
  }, []);

  const handleRegionChange = useCallback((newRegion: Region) => {
    if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    // If programmatic animation, just update region directly without skipping query
    if (isAnimatingRef.current) {
      isAnimatingRef.current = false;
      setRegion(newRegion);
      return;
    }
    setRegionStable(false);
    regionDebounceRef.current = setTimeout(() => {
      setRegion(newRegion);
      setRegionStable(true);
    }, 800);
  }, []);

  const handleFilterPress = useCallback((newFilter: FilterType) => {
    if (newFilter !== 'all' && !requireAuth()) return;
    setFilter(newFilter);
  }, [requireAuth]);

  const navigateToBreakPage = useCallback((sb: any) => {
    if (!sb) return;
    const id = sb.surf_break_identifier;
    if (id) {
      const country = sb.country_code;
      const region = sb.region && sb.region !== '0' ? sb.region : '0';
      // Stash the break so the map can re-center + reopen its info card when
      // the user pops back from the break page.
      pendingRestoreBreak = sb;
      trackedPush(`/break/${country}/${region}/${id}` as any);
    }
  }, [trackedPush]);

  // When the map regains focus and we have a pending break (the user just
  // pressed back from a break page they opened from the map), animate to it
  // and reopen its info card so they pick up exactly where they left off.
  useFocusEffect(
    useCallback(() => {
      const sb = pendingRestoreBreak;
      if (!sb) return;
      pendingRestoreBreak = null;
      const lat = parseFloat(sb.coordinates?.lat);
      const lon = parseFloat(sb.coordinates?.lon);
      if (isNaN(lat) || isNaN(lon)) return;
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      isAnimatingRef.current = true;
      setRegionStable(true);
      mapRef.current?.animateToRegion({
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 500);
      // Reselect the break so its info card reopens where the user left off.
      setSelectedBreak(sb);
    }, [])
  );

  // Marker tap → set selection, switch sheet mode, snap to half. Zoom effect
  // controls peek visibility independently. Tap lifts the sheet from peek (or
  // wherever) up to half-snap so the carousel becomes visible for the tapped
  // item. Map is NOT animated — selection only changes the marker style.
  const handleMarkerPress = useCallback((sb: any) => {
    setSelectedBreak(sb);
    setSelectedAd(null);
    setSheetMode('break');
    sheetRef.current?.snapToIndex(1); // half (carousel)
  }, []);

  const handleAdMarkerPress = useCallback((ad: any) => {
    setSelectedAd(ad);
    setSelectedBreak(null);
    setSheetMode('ad');
    sheetRef.current?.snapToIndex(1);
    // Per-marker impression (the sheet also fires when an ad becomes the
    // carousel-centered item, but a direct tap is the strongest signal).
    recordImpression({ adId: ad.id, placement: 'map', device: currentDevice() }).catch(() => { /* best-effort */ });
  }, [recordImpression]);

  const handleSheetClose = useCallback(() => {
    setSelectedBreak(null);
    setSelectedAd(null);
  }, []);

  // Convert a raw break record to the sheet item shape. Shared between the
  // nearby list and the "ensure selected is included" fallback below.
  const breakToItem = useCallback((b: any): MapNearbyItem => ({
    kind: 'break' as const,
    id: String(b.id),
    name: b.name,
    subtitle:
      (b.region ? `${String(b.region).replaceAll('_', ' ')} · ` : '') +
      (b.country_code ?? ''),
    distanceLabel:
      typeof b.distance === 'number' && b.distance > 0
        ? formatDistance(b.distance, units)
        : null,
    lat: parseFloat(b.coordinates?.lat ?? b.lat ?? 0),
    lon: parseFloat(b.coordinates?.lon ?? b.lon ?? 0),
    thumbnailUrl: b.thumbnailUrl ?? b.thumbnail_url ?? null,
  }), [units]);

  const adToItem = useCallback((a: any): MapNearbyItem => ({
    kind: 'ad' as const,
    id: String(a.id),
    company: a.company_name ?? 'Sponsored',
    title: a.headline || a.company_name || 'Sponsored',
    placeName: a.place_name ?? null,
    venueCount: a.venue_count ? Number(a.venue_count) : undefined,
    ctaLabel: a.cta_label || (a.cta_type === 'tel' ? 'Call' : 'Learn more'),
    thumbnailUrl: a.thumbnail_url ?? a.image_url ?? null,
    lat: parseFloat(a.place_lat ?? a.lat ?? 0),
    lon: parseFloat(a.place_lon ?? a.lon ?? 0),
  }), []);

  // Sheet lists are VIEWPORT-anchored: only breaks/ads currently visible on
  // the map appear. Sorted by distance from map center so the closest items
  // come first in the carousel — feels like "what's right in front of me."
  // Re-shuffling on pan is naturally debounced by the existing region update
  // pipeline. Because the list is keyed on viewport rather than selection,
  // swiping the carousel can safely change the selected pin without causing
  // any list-reorder loop.
  const inViewportBreaks = useMemo(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    const minLat = latitude - latitudeDelta / 2;
    const maxLat = latitude + latitudeDelta / 2;
    const minLon = longitude - longitudeDelta / 2;
    const maxLon = longitude + longitudeDelta / 2;
    return (committedBreaks as any[]).filter((b: any) => {
      const lat = parseFloat(b.coordinates?.lat ?? b.lat ?? 0);
      const lon = parseFloat(b.coordinates?.lon ?? b.lon ?? 0);
      return !isNaN(lat) && !isNaN(lon) && lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
    });
  }, [committedBreaks, region]);

  const sortByDistanceFromCenter = useCallback(<T extends { lat: number; lon: number }>(items: T[]) => {
    const cLat = region.latitude;
    const cLon = region.longitude;
    return [...items].sort((a, b) => {
      const dA = (a.lat - cLat) ** 2 + (a.lon - cLon) ** 2;
      const dB = (b.lat - cLat) ** 2 + (b.lon - cLon) ** 2;
      return dA - dB;
    });
  }, [region.latitude, region.longitude]);

  const sheetBreaks = useMemo<MapNearbyItem[]>(() => {
    const items = inViewportBreaks.map(breakToItem);
    return sortByDistanceFromCenter(items);
  }, [inViewportBreaks, breakToItem, sortByDistanceFromCenter]);

  const sheetAds = useMemo<MapNearbyItem[]>(() => {
    // mapAds is already viewport-bounded server-side; no extra filtering needed.
    const items = (mapAds as any[]).map(adToItem);
    return sortByDistanceFromCenter(items);
  }, [mapAds, adToItem, sortByDistanceFromCenter]);

  // Carousel swipe → change which pin is selected on the map (visual
  // reference between list position and map position). Map is NOT animated —
  // that caused jarring camera moves and conflicted with manual map panning.
  // Safe from the previous loop because the list is viewport-anchored, not
  // selection-anchored: changing selection no longer reshuffles the list.
  const handleSheetCenterItem = useCallback(
    (item: MapNearbyItem) => {
      if (item.kind === 'ad') {
        const currentId = selectedAd?.id;
        if (String(currentId ?? '') === item.id) return;
        setSelectedAd(mapAds.find((a: any) => String(a.id) === item.id) ?? null);
      } else {
        const currentId = selectedBreak?.id;
        if (String(currentId ?? '') === item.id) return;
        setSelectedBreak(committedBreaks.find((b: any) => String(b.id) === item.id) ?? null);
      }
    },
    [selectedBreak, selectedAd, mapAds, committedBreaks],
  );

  // Tap a card in the sheet → navigate (breaks) or open click URL (ads).
  const handleSheetPressItem = useCallback(
    (item: MapNearbyItem) => {
      if (item.kind === 'break') {
        const sb = nearbyBreaks.find((b: any) => String(b.id) === item.id);
        if (sb) navigateToBreakPage(sb);
      } else {
        const ad = mapAds.find((a: any) => String(a.id) === item.id);
        if (ad) openAdClick(ad);
      }
    },
    [nearbyBreaks, mapAds, navigateToBreakPage, openAdClick],
  );

  // Zoom-driven sheet visibility. When the user zooms in past the regional
  // threshold, the sheet auto-shows at the PEEK snap (just the handle bar
  // above the tab bar — never auto-half-snap). Zoom back out → fully closed.
  // To open the sheet to half-snap the user must either swipe up from peek
  // OR tap a marker. `sheetAutoOpenedRef` debounces each transition to one
  // snap call so we don't fight a user who's manually dragged the sheet.
  useEffect(() => {
    if (sheetInZoomRange && !sheetAutoOpenedRef.current) {
      sheetAutoOpenedRef.current = true;
      sheetRef.current?.snapToIndex(0); // peek
    }
    if (!sheetInZoomRange && sheetAutoOpenedRef.current) {
      sheetAutoOpenedRef.current = false;
      sheetRef.current?.close();
    }
  }, [sheetInZoomRange]);

  const handleSearchInput = useCallback((text: string) => {
    setSearchTerm(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedTerm(text), 350);
  }, []);

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchTerm('');
      setDebouncedTerm('');
      setShowNearbyBreakPicker(false);
      setNearbyBreakSearch('');
      setDebouncedNearbySearch('');
      Keyboard.dismiss();
    } else {
      setSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  const navigateToBreakOnMap = useCallback((sb: any) => {
    const lat = parseFloat(sb.coordinates?.lat);
    const lon = parseFloat(sb.coordinates?.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      isAnimatingRef.current = true;
      setRegionStable(true);
      mapRef.current?.animateToRegion({
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 800);
      setSelectedBreak(sb);
    }
    setSearchOpen(false);
    setSearchTerm('');
    setDebouncedTerm('');
    Keyboard.dismiss();
  }, []);

  const dismissSelection = useCallback(() => {
    setSelectedBreak(null);
  }, []);

  const markerColor = filter === 'favorites' ? '#ef4444' : filter === 'mine' ? '#8b5cf6' : '#0ea5e9';

  const markers = useMemo(() => surfBreaks.map((sb: any) => (
    <SurfBreakMarker
      key={sb.id}
      sb={sb}
      markerColor={markerColor}
      isSelected={selectedBreak?.id === sb.id}
      onMarkerPress={handleMarkerPress}
    />
  )), [surfBreaks, markerColor, selectedBreak, handleMarkerPress]);

  // Ad venue pins — excluded from clustering (cluster={false}) so a sponsored
  // pin never disappears into a surf-break cluster. Amber default pin to read as
  // distinct from breaks. Tap → impression; callout tap → click-through.
  const adMarkers = useMemo(() => mapAds.map((ad: any) => {
    const lat = Number(ad.place_lat);
    const lon = Number(ad.place_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const isSelected = String(selectedAd?.id ?? '') === String(ad.id);
    return (
      <Marker
        key={`ad-${ad.id}`}
        // `cluster` is consumed by react-native-map-clustering, not part of the
        // react-native-maps Marker prop types — spread it untyped.
        {...({ cluster: false } as any)}
        coordinate={{ latitude: lat, longitude: lon }}
        // Selected ad uses red pin (Apple Maps' "selected place" color) to
        // stand out from the amber default. zIndex raises it above unselected
        // ad pins so the selection ring isn't covered by neighbors.
        pinColor={isSelected ? '#ef4444' : '#f59e0b'}
        zIndex={isSelected ? 999 : undefined}
        onPress={() => handleAdMarkerPress(ad)}
      />
    );
  }), [mapAds, handleAdMarkerPress, selectedAd]);

  const renderCluster = useCallback((cluster: any) => {
    const { id, geometry, onPress, properties } = cluster;
    const count = properties?.point_count ?? 0;
    return (
      <ClusterMarker
        key={`cluster-${id}`}
        id={id}
        coordinate={{
          latitude: geometry.coordinates[1],
          longitude: geometry.coordinates[0],
        }}
        count={count}
        color={markerColor}
        onPress={onPress}
      />
    );
  }, [markerColor]);

  const handleMapPress = useCallback((e: any) => {
    // On iOS a marker tap also fires the map's onPress with this action; ignore
    // it so tapping a marker doesn't immediately dismiss its info card.
    if (e?.nativeEvent?.action === 'marker-press') return;
    if (searchOpen && !searchTerm) {
      setSearchOpen(false);
      Keyboard.dismiss();
    }
    dismissSelection();
  }, [searchOpen, searchTerm, dismissSelection]);

  const handleMapLongPress = useCallback((e: any) => {
    if (!isSuperAdmin) return;
    const coord = e?.nativeEvent?.coordinate;
    if (!coord) return;
    Keyboard.dismiss();
    setSearchOpen(false);
    dismissSelection();
    setPendingBreakCoord({ latitude: coord.latitude, longitude: coord.longitude });
    setAddBreakSheetVisible(true);
  }, [isSuperAdmin, dismissSelection]);

  const closeAddBreakSheet = useCallback(() => {
    setAddBreakSheetVisible(false);
    setPendingBreakCoord(null);
  }, []);

  const handleCreateBreak = useCallback(async (name: string) => {
    if (!pendingBreakCoord) return;
    try {
      await createSurfBreak({
        name,
        lat: Number(pendingBreakCoord.latitude.toFixed(6)),
        lon: Number(pendingBreakCoord.longitude.toFixed(6)),
      }).unwrap();
    } catch (err: any) {
      throw new Error(err?.data?.message ?? 'Failed to create surf break. Please try again.');
    }
    closeAddBreakSheet();
    Alert.alert('Surf break created', `"${name.trim()}" was added to the map. Its country and region finalize in a moment.`);
  }, [pendingBreakCoord, createSurfBreak, closeAddBreakSheet]);

  return (
    <View style={styles.container}>
      <ClusteredMapView
        ref={mapRef as any}
        style={styles.map}
        initialRegion={initialMapRegion}
        onRegionChangeComplete={handleRegionChange}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        showsUserLocation={locationGranted}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        clusterColor={markerColor}
        clusterTextColor="#ffffff"
        radius={50}
        minPoints={2}
        minZoomLevel={2}
        maxZoomLevel={18}
        animationEnabled={false}
        onPress={handleMapPress}
        onLongPress={isSuperAdmin ? handleMapLongPress : undefined}
        renderCluster={renderCluster}
      >
        {markers}
        {adMarkers}
        {pendingBreakCoord && (
          <Marker
            coordinate={pendingBreakCoord}
            tracksViewChanges={true}
            anchor={{ x: 0.5, y: 1 }}
          >
            <Ionicons name="location" size={36} color="#22c55e" />
          </Marker>
        )}
      </ClusteredMapView>

      {/* Loading */}
      {isFetching && (
        <View style={[styles.loadingBadge, { backgroundColor: isDark ? 'rgba(17,24,39,0.85)' : 'rgba(255,255,255,0.9)' }]}>
          <ActivityIndicator size="small" color="#0ea5e9" />
        </View>
      )}

      {/* Search panel */}
      <SafeAreaView style={styles.topPanel} edges={['top']} pointerEvents="box-none">
        {searchOpen ? (
          <View style={[styles.searchPanel, { backgroundColor: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)' }]}>
            <View style={styles.searchRow}>
              <View style={[styles.searchInputWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                <Ionicons name="search-outline" size={16} color={isDark ? '#6b7280' : '#9ca3af'} />
                <TextInput
                  ref={searchInputRef}
                  value={searchTerm}
                  onChangeText={handleSearchInput}
                  placeholder="Search surf breaks..."
                  placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.searchInput, { color: isDark ? '#fff' : '#111827' }]}
                />
                {searchTerm.length > 0 && (
                  <Pressable onPress={() => { setSearchTerm(''); setDebouncedTerm(''); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={isDark ? '#6b7280' : '#9ca3af'} />
                  </Pressable>
                )}
              </View>
              <Pressable onPress={toggleSearch} hitSlop={8}>
                <Text style={{ fontSize: 15, color: '#0ea5e9', fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow} style={{ flexGrow: 0 }}>
              {(['all', 'favorites', 'mine'] as FilterType[]).map((f) => {
                const isActive = filter === f;
                const labels: Record<FilterType, string> = { all: 'All', favorites: 'Favorites', mine: 'My Spots' };
                const icons: Record<FilterType, string> = { all: 'earth-outline', favorites: 'heart-outline', mine: 'camera-outline' };
                return (
                  <Pressable
                    key={f}
                    onPress={() => handleFilterPress(f)}
                    style={[styles.filterChip, {
                      backgroundColor: isActive ? (isDark ? '#fff' : '#111827') : (isDark ? '#1f2937' : '#f3f4f6'),
                    }]}
                  >
                    <Ionicons
                      name={icons[f] as any}
                      size={13}
                      color={isActive ? (isDark ? '#111827' : '#fff') : (isDark ? '#d1d5db' : '#374151')}
                    />
                    <Text style={[styles.filterChipText, {
                      color: isActive ? (isDark ? '#111827' : '#fff') : (isDark ? '#d1d5db' : '#374151'),
                    }]}>{labels[f]}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {showNearbyBreakPicker ? (
              /* Nearby break picker — inline */
              <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={[styles.nearbyPickerSearch, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                  <Ionicons name="search-outline" size={16} color={isDark ? '#6b7280' : '#9ca3af'} />
                  <TextInput
                    value={nearbyBreakSearch}
                    onChangeText={handleNearbySearchInput}
                    placeholder="Search a location..."
                    placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                    autoFocus
                    style={[styles.nearbyPickerInput, { color: isDark ? '#fff' : '#111827' }]}
                  />
                  <Pressable onPress={() => { setShowNearbyBreakPicker(false); setNearbyBreakSearch(''); setDebouncedNearbySearch(''); }} hitSlop={8}>
                    <Ionicons name="close" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
                  </Pressable>
                </View>
                {nearbyPickerLoading && <ActivityIndicator size="small" style={{ marginVertical: 12 }} />}
                {nearbyPickerResults.map((brk: any) => (
                  <Pressable key={brk.id} onPress={() => handleSelectNearbyBreak(brk)} style={styles.nearbyRow}>
                    <Ionicons name="location-outline" size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={[styles.nearbyName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>{brk.name}</Text>
                      <Text style={{ fontSize: 11, color: isDark ? '#6b7280' : '#9ca3af' }}>
                        {brk.region?.replaceAll('_', ' ')} · {brk.country_code}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {debouncedNearbySearch.length < 2 && !nearbyPickerLoading && (
                  <Text style={{ color: isDark ? '#4b5563' : '#9ca3af', textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>
                    Search for a break to explore nearby
                  </Text>
                )}
              </ScrollView>
            ) : debouncedTerm.length >= 2 ? (
              /* Search results */
              <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {searchLoading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" />
                  </View>
                ) : searchResults.length > 0 ? (
                  searchResults.map((sb: any) => (
                    <Pressable key={sb.id} onPress={() => navigateToBreakOnMap(sb)} style={styles.resultRow}>
                      <Ionicons name="location-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                          {sb.name}
                        </Text>
                        <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280' }]} numberOfLines={1}>
                          {sb.region ? `${sb.region.replaceAll('_', ' ')} · ` : ''}{sb.country_code ?? ''}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <Text style={{ color: '#9ca3af', textAlign: 'center', paddingVertical: 20, fontSize: 14 }}>
                    No breaks found
                  </Text>
                )}
              </ScrollView>
            ) : (
              /* Nearby section — default view */
              <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Location pill */}
                <Pressable onPress={() => setShowNearbyBreakPicker(true)} style={styles.nearbyLocationRow}>
                  <Ionicons name="navigate-outline" size={14} color="#0ea5e9" />
                  <Text style={[styles.nearbyLocationText, { color: isDark ? '#d1d5db' : '#374151' }]} numberOfLines={1}>
                    {currentNearbyName ? `Near ${currentNearbyName}` : 'Set a location'}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={isDark ? '#6b7280' : '#9ca3af'} />
                </Pressable>

                {/* Nearby Photographers — horizontal */}
                {nearbyPhotographers.length > 0 && (
                  <View style={styles.nearbySection}>
                    <Text style={[styles.nearbySectionTitle, { color: isDark ? '#fff' : '#111827' }]}>
                      Photographers
                    </Text>
                    <FlatList
                      data={nearbyPhotographers}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(p: any) => p.id ?? p.handle}
                      contentContainerStyle={{ paddingHorizontal: 8, gap: 12, paddingVertical: 4 }}
                      renderItem={({ item: p }) => {
                        const noteActive =
                          !!p.status_note &&
                          Date.now() - new Date(p.status_note_set_at).getTime() <
                            7 * 24 * 60 * 60 * 1000;
                        const stops = p.active ? ACTIVE_STOPS : noteActive ? NOTE_STOPS : null;
                        const AVATAR = 44;
                        const RING_STROKE = 3;
                        const RING_GAP = 2;
                        const RING_TOTAL = AVATAR + (RING_STROKE + RING_GAP) * 2;
                        return (
                          <Pressable
                            onPress={() => trackedPush(`/user/${p.handle}`)}
                            style={styles.nearbyPhotographer}
                          >
                            <View style={{ width: RING_TOTAL, height: RING_TOTAL, alignItems: 'center', justifyContent: 'center' }}>
                              {stops && <GradientRing size={RING_TOTAL} strokeWidth={RING_STROKE} stops={stops} />}
                              <UserAvatar
                                uri={p.picture}
                                name={p.name ?? p.handle}
                                size={AVATAR}
                                verified={p.verified}
                                userType={p.verified ? (p.user_type ?? 'photographer') : undefined}
                                badgeBackgroundColor={isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)'}
                              />
                            </View>
                            <Text style={[styles.nearbyPhotographerHandle, { color: isDark ? '#d1d5db' : '#374151' }]} numberOfLines={1}>
                              @{p.handle}
                            </Text>
                          </Pressable>
                        );
                      }}
                    />
                  </View>
                )}

                {/* Nearby Surf Breaks — vertical list */}
                {nearbyBreaks.length > 0 && (
                  <View style={styles.nearbySection}>
                    <Text style={[styles.nearbySectionTitle, { color: isDark ? '#fff' : '#111827' }]}>
                      Surf Breaks
                    </Text>
                    {nearbyBreaks.slice(0, 8).map((sb: any) => (
                      <Pressable key={sb.id} onPress={() => navigateToBreakOnMap(sb)} style={styles.nearbyRow}>
                        <Ionicons name="location-outline" size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
                        <View style={{ marginLeft: 8, flex: 1 }}>
                          <Text style={[styles.nearbyName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                            {sb.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: isDark ? '#6b7280' : '#9ca3af' }}>
                            {sb.distance > 0 ? `${formatDistance(sb.distance, units)} · ` : ''}
                            {sb.region ? sb.region.replaceAll('_', ' ') : ''}{sb.country_code ? ` · ${sb.country_code}` : ''}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}

                {!currentNearbyName && nearbyBreaks.length === 0 && (
                  <View style={{ paddingVertical: 16, paddingHorizontal: 12 }}>
                    <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', fontSize: 13, textAlign: 'center' }}>
                      Set a location on your profile to see nearby breaks and photographers
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={styles.searchIconWrap}>
            <Pressable
              onPress={toggleSearch}
              style={[styles.searchIconBtn, {
                backgroundColor: isDark ? 'rgba(17,24,39,0.85)' : 'rgba(255,255,255,0.9)',
                shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
              }]}
            >
              <Ionicons name="search-outline" size={20} color={isDark ? '#d1d5db' : '#374151'} />
            </Pressable>
          </View>
        )}
      </SafeAreaView>


      {/* My location button */}
      <Pressable
        onPress={async () => {
          // Try Redux coords first, then fetch fresh location
          let lat = deviceCoords?.lat;
          let lon = deviceCoords?.lon;
          if (!lat || !lon) {
            try {
              const { status } = await Location.getForegroundPermissionsAsync();
              if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                lat = loc.coords.latitude;
                lon = loc.coords.longitude;
              }
            } catch {}
          }
          if (lat && lon) {
            if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
            isAnimatingRef.current = true;
            setRegionStable(true);
            mapRef.current?.animateToRegion({
              latitude: lat,
              longitude: lon,
              latitudeDelta: 0.15,
              longitudeDelta: 0.15,
            }, 500);
          }
        }}
        style={[styles.myLocationBtn, {
          backgroundColor: isDark ? 'rgba(17,24,39,0.85)' : 'rgba(255,255,255,0.9)',
          shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
          // Lift slightly when the sheet is at peek (zoomed-in default) so the
          // button doesn't sit right on top of the handle bar. We only know
          // for sure that the sheet is at peek (not half/full) when the user
          // hasn't dragged it up. The 60px clearance covers the peek bar +
          // a little breathing room — when they drag the sheet up, the button
          // is fine staying put because the sheet content covers it anyway.
          bottom: sheetInZoomRange ? 80 : 16,
        }]}
      >
        <Ionicons name="navigate-outline" size={18} color={isDark ? '#d1d5db' : '#374151'} />
      </Pressable>

      {/* Nearby content bottom sheet — replaces the old static break card +
          floating ad Callout. Half-snap = type-locked carousel; full-snap =
          sectioned horizontal scroll. See MapNearbySheet for full behavior. */}
      <MapNearbySheet
        ref={sheetRef}
        breaks={sheetBreaks}
        ads={sheetAds}
        mode={sheetMode}
        selectedId={sheetMode === 'ad' ? String(selectedAd?.id ?? '') : String(selectedBreak?.id ?? '')}
        isDark={isDark}
        onCenterItem={handleSheetCenterItem}
        onPressItem={handleSheetPressItem}
        onClose={handleSheetClose}
        onAdImpression={(adId) => {
          recordImpression({ adId, placement: 'map', device: currentDevice() }).catch(() => { /* best-effort */ });
        }}
        cardWidth={CARD_WIDTH}
        initialIndex={initialSheetIndexRef.current}
      />

      {isSuperAdmin && (
        <AddSurfBreakSheet
          visible={addBreakSheetVisible}
          coordinate={pendingBreakCoord}
          onClose={closeAddBreakSheet}
          onCreate={handleCreateBreak}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  // Ad pin callout (light card; map callouts don't theme reliably, keep neutral).
  adCallout: { width: 180, paddingVertical: 2 },
  adCalloutBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 3,
  },
  adCalloutBadgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.4, color: '#b45309' },
  adCalloutTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  adCalloutSub: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  adCalloutCta: { fontSize: 12, fontWeight: '600', color: '#0284c7', marginTop: 3 },
  marker: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: '#fff',
  },
  selectedPin: {
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  cluster: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
  },
  clusterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  breakCardWrap: {
    position: 'absolute', left: 12, right: 12, bottom: 16,
  },
  breakCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  breakCardClose: { padding: 4, marginLeft: 8 },
  calloutName: { fontSize: 16, fontWeight: '700' },
  calloutSub: { fontSize: 12, marginTop: 1 },
  calloutAction: { fontSize: 13, fontWeight: '600', color: '#0ea5e9', marginTop: 5 },
  loadingBadge: {
    position: 'absolute', top: 60, alignSelf: 'center',
    borderRadius: 20, padding: 8,
  },
  topPanel: {
    position: 'absolute', top: 0, left: 0, right: 0,
  },
  searchIconWrap: {
    alignItems: 'flex-end', paddingRight: 12, paddingTop: 8,
  },
  searchIconBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  searchPanel: {
    marginHorizontal: 12, marginTop: 8,
    borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  searchInput: { flex: 1, marginLeft: 6, fontSize: 15 },
  filtersRow: {
    flexDirection: 'row', gap: 6, paddingTop: 8,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  resultsWrap: {
    borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 4,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 4,
  },
  resultName: { fontSize: 14, fontWeight: '600' },
  resultSub: { fontSize: 12, marginTop: 1 },
  nearbyLocationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(156,163,175,0.2)',
  },
  nearbyLocationText: { fontSize: 13, fontWeight: '500', flex: 1 },
  nearbySection: { paddingTop: 10, paddingHorizontal: 4 },
  nearbySectionTitle: { fontSize: 13, fontWeight: '700', paddingHorizontal: 8, marginBottom: 4 },
  nearbyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 10,
  },
  nearbyName: { fontSize: 13, fontWeight: '600' },
  nearbyPhotographer: { alignItems: 'center', maxWidth: 90 },
  nearbyPhotographerHandleRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  nearbyPhotographerHandle: { fontSize: 10, fontWeight: '500', flexShrink: 1 },
  nearbyActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981', flexShrink: 0 },
  nearbyPickerSearch: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 8, marginTop: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  nearbyPickerInput: { flex: 1, marginLeft: 6, fontSize: 14 },
  myLocationBtn: {
    position: 'absolute', bottom: 16, right: 12,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
});
