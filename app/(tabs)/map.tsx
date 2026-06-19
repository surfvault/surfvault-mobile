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
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTrackedPush } from '../../src/context/NavigationContext';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Region, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
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
import { useGetMapSurfBreaksQuery, useGetMapAdsQuery, useGetSurfBreaksQuery, useGetMapSearchContentQuery, useUpdateUserRecentSearchesMutation, useCreateSurfBreakMutation, useRecordAdImpressionMutation } from '../../src/store';
import { buildAdClickUrl, currentDevice } from '../../src/helpers/adTracking';
import AddSurfBreakSheet from '../../src/components/AddSurfBreakSheet';
import React from 'react';

type FilterType = 'all' | 'favorites' | 'mine';

// Pre-rendered dot-marker PNGs (generated in assets/markers). Keyed by color;
// `_LG` is the enlarged variant used for the SELECTED break (replaces the old
// halo ring). Density variants (@2x/@3x) are resolved by Metro automatically.
const PIN: Record<string, any> = {
  sky: require('../../assets/markers/pin-sky.png'),
  red: require('../../assets/markers/pin-red.png'),
  violet: require('../../assets/markers/pin-violet.png'),
  green: require('../../assets/markers/pin-green.png'),
};
const PIN_LG: Record<string, any> = {
  sky: require('../../assets/markers/pin-sky-lg.png'),
  red: require('../../assets/markers/pin-red-lg.png'),
  violet: require('../../assets/markers/pin-violet-lg.png'),
  green: require('../../assets/markers/pin-green-lg.png'),
};

// Break pin as an IMAGE marker (a pre-rendered dot PNG), NOT a custom `<View>`.
// iOS + the New Architecture drop custom-view markers whenever the map's
// children change (another marker mounting, the selection halo toggling, a
// commit) — that was the root of the crash / blank-pin / vanish-on-select bugs.
// Image markers render natively from the bitmap and are immune to that entire
// class (the ad `pinColor` markers never broke for the same reason). Selection
// is a pure IMAGE PROP SWAP to the larger PNG — no separate halo marker is
// mounted/unmounted, so nothing ever disturbs the other pins.
const SurfBreakMarker = React.memo(({
  sb,
  image,
  onMarkerPress,
}: {
  sb: any;
  image: any;
  onMarkerPress: (sb: any) => void;
}) => {
  const handlePress = useCallback(() => onMarkerPress(sb), [sb, onMarkerPress]);
  return (
    <Marker
      coordinate={{
        latitude: parseFloat(sb.coordinates?.lat) || 0,
        longitude: parseFloat(sb.coordinates?.lon) || 0,
      }}
      image={image}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={handlePress}
      tracksViewChanges={false}
      stopPropagation
    />
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
  const { units } = useUserPreferences();
  const { isAuthenticated } = useAuth();
  const requireAuth = useRequireAuth();
  const dispatch = useDispatch();
  const mapRef = useRef<MapView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const hasAnimatedToLocation = useRef(false);
  const isAnimatingRef = useRef(false);
  // Clears `isAnimatingRef` a beat after the LAST region-change event of a
  // programmatic animation. Android emits several events per animation, so a
  // single one-shot reset would mis-classify the trailing ones as user pans.
  const animationResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp of the most recent marker tap. `handleMapPress` uses it to
  // ignore the map's onPress that fires right after a marker tap on iOS (where
  // the marker tap propagates to the map and `action` is undefined, so the
  // Android-only `marker-press` guard misses it).
  const lastMarkerPressAtRef = useRef(0);
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

  // Safe-area top inset — used to position the my-location button just below
  // the search button regardless of platform (iOS notch is ~50px, Android
  // status bar is ~24px, so a hardcoded `top` value drifts between platforms).
  const safeAreaInsets = useSafeAreaInsets();
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

  // Fetch a box slightly LARGER than the visible viewport. A margin means
  // everything on screen is covered even if `region` under-reports the frame
  // (e.g. mapPadding insets the reported region), and it buffers small pans so
  // markers don't pop in late. The server LIMIT + client 200-cap bound the cost.
  const BOUNDS_MARGIN = 0.35; // +35% of each delta on every side
  const latSpan = region.latitudeDelta * (0.5 + BOUNDS_MARGIN);
  const lonSpan = region.longitudeDelta * (0.5 + BOUNDS_MARGIN);
  // Round bounds based on zoom level — coarser when zoomed out, precise when zoomed in
  const precision = region.latitudeDelta > 10 ? 10 : region.latitudeDelta > 1 ? 100 : 1000;
  const minLat = Math.floor((region.latitude - latSpan) * precision) / precision;
  const maxLat = Math.ceil((region.latitude + latSpan) * precision) / precision;
  const minLon = Math.floor((region.longitude - lonSpan) * precision) / precision;
  const maxLon = Math.ceil((region.longitude + lonSpan) * precision) / precision;

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

  // Commit new markers once the region is stable. We commit DIRECTLY in the
  // render cycle rather than via InteractionManager.runAfterInteractions: a
  // custom-view marker that mounts inside that deferred idle callback often
  // fails to snapshot on iOS + Fabric, so the dot never paints (the break
  // shows in the sheet but has no pin) until a later interaction. `regionStable`
  // (plus the animation-reset gating in handleRegionChange) already guarantees
  // we're not mid-gesture, so the idle defer was redundant. Painting of the
  // committed pins is handled by the two-phase remount below (`renderedBreaks`).
  useEffect(() => {
    if (isZoomedTooFarOut) {
      setCommittedBreaks([]);
      return;
    }
    if (!regionStable) return;
    setCommittedBreaks(latestBreaks);
  }, [latestBreaks, regionStable, isZoomedTooFarOut]);

  // Cap markers (200) AND render them in a STABLE id order. The backend now
  // orders breaks by proximity to the viewport center, so the same breaks come
  // back in a *different array order* every time the center moves — which would
  // make React reorder marker subviews (remove+insert), the exact interleaved
  // mutation that crashes AIRMap's `insertReactSubview:atIndex:` on Fabric.
  // Sorting by id makes the order independent of the fetch, so membership
  // changes are pure inserts/removes, never reorders. We also return the SAME
  // array reference when the set of ids is unchanged (panning within the same
  // breaks), so the two-phase commit below doesn't needlessly blink the pins.
  const surfBreaksRef = useRef<{ sig: string; arr: any[] }>({ sig: '', arr: [] });
  const surfBreaks = useMemo(() => {
    const capped = committedBreaks.length > 200 ? committedBreaks.slice(0, 200) : committedBreaks;
    const sorted = [...capped].sort((a, b) => {
      const x = String(a.id), y = String(b.id);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    // Signature includes the active flag (not just id) so a break going
    // active/inactive repaints the green pin even when the break SET is
    // unchanged. Active toggles are rare, so the crash-protective membership
    // stability still holds for ordinary panning.
    const sig = sorted.map((b) => `${b.id}:${b.has_active_photographer ? 1 : 0}`).join(',');
    if (sig === surfBreaksRef.current.sig) return surfBreaksRef.current.arr;
    surfBreaksRef.current = { sig, arr: sorted };
    return sorted;
  }, [committedBreaks]);

  // Two-phase marker commit (THE fix for the `-[AIRMap insertReactSubview:
  // atIndex:]` NSRangeException on zoom-out/refetch). When the break membership
  // changes we first render ZERO break markers, then repopulate on the next
  // frame. Going A→[]→B splits the change into two separate mount transactions:
  // a pure "remove all" then a pure "append into empty" — neither contains the
  // interleaved remove+insert that makes AIRMap compute an out-of-bounds insert
  // index and crash. The requestAnimationFrame guarantees the two setState calls
  // land in DIFFERENT React commits (a synchronous pair would batch into one
  // transaction and reintroduce the crash). Because `surfBreaks` is reference-
  // stable for unchanged membership, this only fires — and only blinks the pins —
  // when breaks actually enter or leave the viewport.
  const [renderedBreaks, setRenderedBreaks] = useState<any[]>([]);
  useEffect(() => {
    setRenderedBreaks([]);
    const raf = requestAnimationFrame(() => setRenderedBreaks(surfBreaks));
    return () => cancelAnimationFrame(raf);
  }, [surfBreaks]);

  // Search uses /map/search (getMapSearchContent) rather than the plain
  // surf-break search so it can be SCOPED to the active map filter — when
  // Favorites or My Spots is on, the backend restricts results to that scope
  // (matches web's MapControlStack). We keep it breaks-only by passing
  // `type: 'surf_break'` and guarding on `surf_break_identifier`.
  const { data: searchData, isFetching: searchLoading } = useGetMapSearchContentQuery(
    {
      search: debouncedTerm,
      type: 'surf_break',
      viewerId: user?.id,
      favorites: filter === 'favorites',
      mine: filter === 'mine',
    },
    { skip: debouncedTerm.length < 2 || (isAuthenticated && !user?.id) }
  );
  const rawSearchResults = (searchData?.results?.searchContent ?? []).filter(
    (item: any) => item?.surf_break_identifier
  );
  const searchResults = rawSearchResults.filter((item: any, index: number, arr: any[]) => {
    const key = `${item.name}:${item.region ?? ''}:${item.country_code ?? ''}`;
    return arr.findIndex((i: any) => `${i.name}:${i.region ?? ''}:${i.country_code ?? ''}` === key) === index;
  });

  // Recent break searches (server-synced via the user's recentSearches) and a
  // suggested fallback — together they replace the old "nearby" lists that
  // duplicated Home + the map's own "In This Area" sheet. Only breaks are kept
  // since map search is breaks-only.
  const [updateUserRecentSearches] = useUpdateUserRecentSearchesMutation();
  const recentBreaks = useMemo(
    () =>
      ((user as any)?.recentSearches ?? [])
        .filter((r: any) => r.itemType === 'surf_break' && r.surfBreak)
        .map((r: any) => r.surfBreak),
    [user]
  );
  // Suggested breaks: a shuffled slice of the catalog. The backend `suggest`
  // mode is users-only, so breaks fall back to getSurfBreaks (mirrors Home).
  // Only fetched when the panel is open with no query AND no recents to show.
  const wantSuggestions = searchOpen && debouncedTerm.length < 2 && recentBreaks.length === 0;
  const { data: suggestBreaksData } = useGetSurfBreaksQuery(
    { limit: 24 },
    { skip: !wantSuggestions }
  );
  const suggestedBreaks = useMemo(() => {
    const breaks = [...(suggestBreaksData?.results?.breaks ?? suggestBreaksData?.results?.surfBreaks ?? [])];
    for (let i = breaks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [breaks[i], breaks[j]] = [breaks[j], breaks[i]];
    }
    return breaks.slice(0, 10);
  }, [suggestBreaksData]);

  // Map bottom-sheet visibility threshold. Peek appears when the user is
  // zoomed in to at least state/coast level (latitudeDelta <= 2 ≈ ~200km
  // across). That's enough zoom-out that a surfer scanning their coastline
  // sees the bar early, but tight enough that we're not listing breaks across
  // a whole hemisphere. Zooming further out auto-closes.
  const SHEET_ZOOM_THRESHOLD = 2.0;
  const sheetInZoomRange = region.latitudeDelta <= SHEET_ZOOM_THRESHOLD;

  const handleRegionChange = useCallback((newRegion: Region) => {
    if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    // If programmatic animation, just update region directly without skipping
    // query. Don't clear the flag on the first event — Android fires several
    // region-change events across one animateToRegion, and clearing here would
    // make the trailing events look like user pans (spurious refetch + marker
    // churn). Instead keep pushing a short reset out; once events stop (the
    // animation settled), the timer clears the flag.
    if (isAnimatingRef.current) {
      setRegion(newRegion);
      // Suppress marker commits for the duration of the fly-to. Android emits
      // a region-change event per animation frame; if we leave `regionStable`
      // true the commit effect re-runs the surf-break query bounds on every
      // intermediate frame and swaps the whole marker set in/out the entire
      // way (pins churn/disappear, then pop to the final set). Hold markers
      // steady, then commit ONCE when the trailing timer confirms the camera
      // has settled.
      setRegionStable(false);
      if (animationResetTimerRef.current) clearTimeout(animationResetTimerRef.current);
      animationResetTimerRef.current = setTimeout(() => {
        isAnimatingRef.current = false;
        animationResetTimerRef.current = null;
        setRegionStable(true);
      }, 400);
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
    lastMarkerPressAtRef.current = Date.now();
    setSelectedBreak(sb);
    setSelectedAd(null);
    setSheetMode('break');
    sheetRef.current?.snapToIndex(1); // half (carousel)
  }, []);

  const handleAdMarkerPress = useCallback((ad: any) => {
    lastMarkerPressAtRef.current = Date.now();
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
    thumbnailUrl: b.thumbnail ?? b.thumbnailUrl ?? b.thumbnail_url ?? null,
    active: !!b.has_active_photographer,
  }), [units]);

  const adToItem = useCallback((a: any): MapNearbyItem => ({
    kind: 'ad' as const,
    id: String(a.id),
    company: a.company_name ?? 'Sponsored',
    title: a.headline || '',
    placeName: a.place_name ?? null,
    venueCount: a.venue_count ? Number(a.venue_count) : undefined,
    ctaLabel: a.cta_label || (a.cta_type === 'tel' ? 'Call' : 'Learn more'),
    // `getMapAds` server-side already resolves the best thumbnail (preferring
    // the explicit thumbnail_ad_media_id, falling back to the first sorted
    // media slide, then legacy media_url) and ships it as `thumbnail`. The
    // value is a full CDN URL ready for <Image source={{ uri }} />.
    thumbnailUrl: a.thumbnail ?? a.logo_url ?? null,
    lat: parseFloat(a.place_lat ?? a.lat ?? 0),
    lon: parseFloat(a.place_lon ?? a.lon ?? 0),
  }), []);

  // Sheet lists mirror what's RENDERED on the map. Both `committedBreaks` and
  // `mapAds` are already viewport-bounded server-side via the map queries —
  // re-filtering by `region` client-side would cause an off-by-one when the
  // current region has drifted slightly from the last API query (markers
  // still on screen but technically outside the new bounds → would render on
  // the map but vanish from the list).
  //
  // Order along the viewport's DOMINANT geographic axis so swiping the carousel
  // sweeps the selected pin smoothly across the map in one direction, instead
  // of hopping by radius from center (which scatters the selection all over the
  // screen). A N–S spread sorts north→south; an E–W spread sorts west→east.
  // Self-relative (depends only on the items' own spread), so it doesn't
  // re-sort on every small pan the way a center-relative sort does.
  const sortBySpatialSweep = useCallback(<T extends { lat: number; lon: number }>(items: T[]) => {
    if (items.length < 2) return items;
    let minLatV = Infinity, maxLatV = -Infinity, minLonV = Infinity, maxLonV = -Infinity;
    for (const it of items) {
      if (it.lat < minLatV) minLatV = it.lat;
      if (it.lat > maxLatV) maxLatV = it.lat;
      if (it.lon < minLonV) minLonV = it.lon;
      if (it.lon > maxLonV) maxLonV = it.lon;
    }
    const latSpread = maxLatV - minLatV;
    // Longitude degrees shrink toward the poles — scale by cos(midLat) so the
    // spread comparison reflects real east–west distance, not raw degrees.
    const midLatRad = (((maxLatV + minLatV) / 2) * Math.PI) / 180;
    const lonSpread = (maxLonV - minLonV) * Math.cos(midLatRad);
    const byLat = latSpread >= lonSpread;
    return [...items].sort((a, b) =>
      byLat
        ? b.lat - a.lat || a.lon - b.lon // north→south, then west→east
        : a.lon - b.lon || b.lat - a.lat, // west→east, then north→south
    );
  }, []);

  // Build the sheet list from `surfBreaks` (the 200-capped set actually
  // rendered as pins), NOT the uncapped `committedBreaks`. Otherwise a carousel
  // card past the cap has no pin on the map — swiping to it selects a break
  // with nothing to highlight, so the sheet and map silently disagree.
  const sheetBreaks = useMemo<MapNearbyItem[]>(() => {
    const items = (surfBreaks as any[]).map(breakToItem);
    return sortBySpatialSweep(items);
  }, [surfBreaks, breakToItem, sortBySpatialSweep]);

  const sheetAds = useMemo<MapNearbyItem[]>(() => {
    const items = (mapAds as any[]).map(adToItem);
    return sortBySpatialSweep(items);
  }, [mapAds, adToItem, sortBySpatialSweep]);

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
        // Keep the current selection if the centered card isn't in the latest
        // in-bounds set (a region settle can drop it) — don't null it out.
        const next = mapAds.find((a: any) => String(a.id) === item.id);
        if (next) setSelectedAd(next);
      } else {
        const currentId = selectedBreak?.id;
        if (String(currentId ?? '') === item.id) return;
        const next = surfBreaks.find((b: any) => String(b.id) === item.id);
        if (next) setSelectedBreak(next);
      }
    },
    [selectedBreak, selectedAd, mapAds, surfBreaks],
  );

  // Tap a card in the sheet → navigate (breaks) or open click URL (ads). Look
  // up in `surfBreaks` — the same capped, viewport-bounded set that populates
  // both the sheet carousel and the map pins.
  const handleSheetPressItem = useCallback(
    (item: MapNearbyItem) => {
      if (item.kind === 'break') {
        const sb = surfBreaks.find((b: any) => String(b.id) === item.id);
        if (sb) navigateToBreakPage(sb);
      } else {
        const ad = mapAds.find((a: any) => String(a.id) === item.id);
        if (ad) openAdClick(ad);
      }
    },
    [surfBreaks, mapAds, navigateToBreakPage, openAdClick],
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
      Keyboard.dismiss();
    } else {
      setSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  const navigateToBreakOnMap = useCallback((sb: any) => {
    // Record the pick into the user's recent searches (server-synced) so it
    // surfaces in the empty-state list next time. Best-effort; only for signed-
    // in users with a real break id.
    if (user?.id && sb?.id) {
      updateUserRecentSearches({ payload: { recentSearch: { type: 'surf_break', data: { id: sb.id } } } });
    }
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
    } else if (sb?.surf_break_identifier) {
      // Recent-search records carry no coordinates (only id/identifier/region/
      // country), so we can't fly the camera — open the break page instead.
      setSearchOpen(false);
      setSearchTerm('');
      setDebouncedTerm('');
      Keyboard.dismiss();
      navigateToBreakPage(sb);
      return;
    }
    setSearchOpen(false);
    setSearchTerm('');
    setDebouncedTerm('');
    Keyboard.dismiss();
  }, [user?.id, updateUserRecentSearches, navigateToBreakPage]);

  const dismissSelection = useCallback(() => {
    setSelectedBreak(null);
  }, []);

  // Color KEY (not hex) → indexes the PIN / PIN_LG image maps.
  const markerColorKey = filter === 'favorites' ? 'red' : filter === 'mine' ? 'violet' : 'sky';

  // Break markers. Each picks a dot IMAGE by color (active → green, else filter
  // color) and the LARGER image when it's the selected break. The KEY includes
  // `-sel` for the selected break so it REMOUNTS on (de)selection: iOS rn-maps
  // does not reliably re-render a marker when only its `image` prop changes, so
  // an in-place swap left non-active pins small. Remounting forces the new image
  // to paint. Safe now that these are image markers — remounting one pin doesn't
  // drop its neighbours (the custom-view-era vanish bug). Only the 1–2 pins
  // whose selection changed remount; the rest keep stable keys.
  const markers = useMemo(() => renderedBreaks.map((sb: any) => {
    // Skip breaks with missing/unparseable coordinates rather than dropping a
    // pin at (0,0) off West Africa.
    const lat = parseFloat(sb.coordinates?.lat);
    const lon = parseFloat(sb.coordinates?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const ck = sb.has_active_photographer ? 'green' : markerColorKey;
    const isSelected = String(selectedBreak?.id ?? '') === String(sb.id);
    return (
      <SurfBreakMarker
        key={`brk-${sb.id}${isSelected ? '-sel' : ''}`}
        sb={sb}
        image={isSelected ? PIN_LG[ck] : PIN[ck]}
        onMarkerPress={handleMarkerPress}
      />
    );
    // Dense array — no `null` holes (kept from the custom-view era; harmless and
    // still avoids any mid-array gaps).
  }).filter(Boolean), [renderedBreaks, markerColorKey, selectedBreak, handleMarkerPress]);

  // Ad venue pins. Amber default, red when selected. Tap → impression + open
  // sheet to ad mode. Inline rendering (no wrapper component) because the
  // wrapper layer was specifically a clustering-library workaround, and we
  // dropped clustering. `selectedAd` is in the useMemo deps so the array
  // recreates on selection change — fine for a small list (5–10 ads max),
  // and there's no clustering pass to over-react to the new array reference.
  const adMarkers = useMemo(() => mapAds.map((ad: any) => {
    const lat = Number(ad.place_lat);
    const lon = Number(ad.place_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const isSelected = String(selectedAd?.id ?? '') === String(ad.id);
    return (
      <Marker
        key={`ad-${ad.id}`}
        coordinate={{ latitude: lat, longitude: lon }}
        pinColor={isSelected ? '#ef4444' : '#f59e0b'}
        zIndex={isSelected ? 9999 : undefined}
        onPress={() => handleAdMarkerPress(ad)}
      />
    );
  }).filter(Boolean), [mapAds, handleAdMarkerPress, selectedAd]);

  // Single, dense, keyed children array for <MapView>. Passing ONE flat list
  // (rather than multiple sibling arrays interleaved with conditional markers)
  // keeps the native subview list in lockstep with one React-reconciled key
  // list. ORDER MATTERS: the stable, few ad pins come FIRST and the volatile
  // break markers come LAST, so the two-phase clear/repopulate of breaks (see
  // `renderedBreaks`) is always a pure TAIL remove-all then append-all — the
  // safest possible mutation for AIRMap's interop subview path. The admin
  // pending-pin sits after the breaks (also a tail toggle). There is NO separate
  // selection halo anymore — selection is an image swap on the break marker.
  const baseMarkers = useMemo(() => [...adMarkers, ...markers], [adMarkers, markers]);

  const handleMapPress = useCallback((e: any) => {
    // Android sets action === 'marker-press' on the map onPress that follows a
    // marker tap; ignore it so tapping a marker doesn't dismiss its info card.
    if (e?.nativeEvent?.action === 'marker-press') return;
    // iOS doesn't set that action and `stopPropagation` is unreliable for
    // custom-view markers, so the marker tap's propagated map onPress would
    // otherwise clear the selection we just set in the same tick. Ignore any
    // map press within a short window of a marker tap.
    if (Date.now() - lastMarkerPressAtRef.current < 350) return;
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
      <MapView
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
        // Android auto-centers the camera on a tapped marker by default, which
        // fires onRegionChangeComplete → debounced refetch → the whole marker
        // set is swapped out from under the user (markers "shift/disappear on
        // tap"). We drive the camera ourselves, so disable the auto-move.
        moveOnMarkerPress={false}
        minZoomLevel={2}
        maxZoomLevel={18}
        // Small bottom inset just clears the peek sheet (handle + tab bar) so
        // the map attribution / user-location dot aren't hidden behind it.
        // It used to be 40% of the screen to push Android's auto-center-on-tap
        // above the sheet, but that's disabled now (moveOnMarkerPress=false) —
        // and a large inset shrinks the region react-native-maps reports, which
        // dropped the bottom of the visible map out of the fetch bounds so
        // on-screen breaks went missing.
        mapPadding={{
          top: 0,
          left: 0,
          right: 0,
          bottom: safeAreaInsets.bottom + 72,
        }}
        // Keep all markers mounted across viewport pans to avoid the
        // `-[AIRMap insertReactSubview:atIndex:]` crash class on the new
        // architecture — costs a bit of memory but is the documented fix.
        removeClippedSubviews={false}
        onPress={handleMapPress}
        onLongPress={isSuperAdmin ? handleMapLongPress : undefined}
      >
        {/* Ad pins + break image-dots. Selection is an image swap inside this
            array (no separate halo marker), so nothing toggles a sibling that
            could disturb the pins. */}
        {baseMarkers}
        {pendingBreakCoord && (
          <Marker
            key="pending-break"
            coordinate={pendingBreakCoord}
            tracksViewChanges={true}
            anchor={{ x: 0.5, y: 1 }}
          >
            <Ionicons name="location" size={36} color="#22c55e" />
          </Marker>
        )}
      </MapView>

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

            {debouncedTerm.length >= 2 ? (
              /* Search results — scoped to the active All / Favorites / My Spots filter */
              <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Scope pill — mirrors web: tells the user the search is
                    restricted to whatever pin filter is active. */}
                <View style={styles.scopeRow}>
                  <Text style={[styles.scopeEyebrow, { color: isDark ? '#6b7280' : '#9ca3af' }]}>SEARCHING</Text>
                  <View style={[styles.scopePill, {
                    backgroundColor: filter === 'favorites' ? 'rgba(239,68,68,0.15)' : filter === 'mine' ? 'rgba(139,92,246,0.15)' : 'rgba(14,165,233,0.15)',
                  }]}>
                    <Text style={[styles.scopePillText, {
                      color: filter === 'favorites' ? '#ef4444' : filter === 'mine' ? '#8b5cf6' : '#0ea5e9',
                    }]}>
                      {filter === 'favorites' ? 'Favorites' : filter === 'mine' ? 'My Spots' : 'All'}
                    </Text>
                  </View>
                </View>
                {searchLoading && searchResults.length === 0 ? (
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
                          {sb.region ? `${String(sb.region).replaceAll('_', ' ')} · ` : ''}{sb.country_code ?? ''}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <Text style={{ color: '#9ca3af', textAlign: 'center', paddingVertical: 20, fontSize: 14 }}>
                    {filter === 'favorites' ? 'No favorited breaks match.' : filter === 'mine' ? 'None of your spots match.' : 'No breaks found'}
                  </Text>
                )}
              </ScrollView>
            ) : (
              /* Empty state — recent searches, then suggested breaks, then a
                 prompt. Replaces the old nearby lists (which duplicated Home +
                 the map's own "In This Area" sheet). */
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {recentBreaks.length > 0 ? (
                  <View style={styles.nearbySection}>
                    <Text style={[styles.nearbySectionTitle, { color: isDark ? '#fff' : '#111827' }]}>Recent</Text>
                    {recentBreaks.slice(0, 8).map((sb: any) => (
                      <Pressable key={`recent-${sb.id}`} onPress={() => navigateToBreakOnMap(sb)} style={styles.nearbyRow}>
                        <Ionicons name="time-outline" size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
                        <View style={{ marginLeft: 8, flex: 1 }}>
                          <Text style={[styles.nearbyName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>{sb.name}</Text>
                          <Text style={{ fontSize: 11, color: isDark ? '#6b7280' : '#9ca3af' }}>
                            {sb.region ? String(sb.region).replaceAll('_', ' ') : ''}{sb.country_code ? ` · ${sb.country_code}` : ''}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : suggestedBreaks.length > 0 ? (
                  <View style={styles.nearbySection}>
                    <Text style={[styles.nearbySectionTitle, { color: isDark ? '#fff' : '#111827' }]}>Suggested</Text>
                    {suggestedBreaks.map((sb: any) => (
                      <Pressable key={`sugg-${sb.id}`} onPress={() => navigateToBreakOnMap(sb)} style={styles.nearbyRow}>
                        <Ionicons name="location-outline" size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
                        <View style={{ marginLeft: 8, flex: 1 }}>
                          <Text style={[styles.nearbyName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>{sb.name}</Text>
                          <Text style={{ fontSize: 11, color: isDark ? '#6b7280' : '#9ca3af' }}>
                            {sb.region ? String(sb.region).replaceAll('_', ' ') : ''}{sb.country_code ? ` · ${sb.country_code}` : ''}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 18, paddingHorizontal: 12 }}>
                    <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', fontSize: 13, textAlign: 'center' }}>
                      Search for a surf break to jump there on the map.
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


      {/* My location button — hidden while the search panel is open since the
          panel expands down the top-right corner and the button would render
          on top of (or right next to) the Cancel link. */}
      {!searchOpen && <Pressable
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
          // Compute top relative to the search button's bottom edge:
          //   safe-area-top (varies by platform) + searchIconWrap.paddingTop (8)
          //   + searchIconBtn height (44) + 16px gap = insets.top + 68
          // Keeps the gap visually identical on iOS and Android.
          top: safeAreaInsets.top + 68,
          backgroundColor: isDark ? 'rgba(17,24,39,0.85)' : 'rgba(255,255,255,0.9)',
          shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
        }]}
      >
        <Ionicons name="navigate-outline" size={18} color={isDark ? '#d1d5db' : '#374151'} />
      </Pressable>}

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
  // Transparent padded box around the visible dot. Enlarges the tappable
  // annotation (rn-maps snapshots the whole view) without changing how the pin
  // looks. ~30px is a comfortable touch target while still letting adjacent
  // pins be distinguished.
  markerHit: {
    width: 30, height: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  marker: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: '#fff',
  },
  // Selected-break overlay: concentric halo + dot. Outer ring is translucent
  // and 32px wide; inner core is solid and 14px wide, both in the marker
  // color. Reads as "this one's selected" without obscuring the spot itself.
  selectedHaloWrap: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedHalo: {
    position: 'absolute',
    width: 32, height: 32, borderRadius: 16,
    opacity: 0.28,
  },
  selectedCore: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
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
  scopeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 4, paddingTop: 8, paddingBottom: 2,
  },
  scopeEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  scopePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  scopePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
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
    // `top` is set dynamically from `useSafeAreaInsets()` so the gap below the
    // search button is identical on iOS (notch) and Android (status bar) —
    // hardcoding it drifted because the safe-area top differs by ~25px.
    position: 'absolute', right: 12,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
});
