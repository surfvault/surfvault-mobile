import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Animated,
  useColorScheme,
  StyleSheet,
  TextInput,
  Keyboard,
} from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { useTrackedPush, useSetNavDepth } from '../../src/context/NavigationContext';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import {
  useGetLatestSessionsQuery,
  useGetNearbySurfBreaksQuery,
  useGetNearbyPhotographersQuery,
  useGetMapSearchContentQuery,
  useGetSearchSuggestionsQuery,
  useGetPopularTagsQuery,
  useGetAdsQuery,
  useGetLatestShapersQuery,
  useGetShapersFromFollowingQuery,
  useGetShapersForSurfBreakQuery,
  useGetFilmsForSurfBreakQuery,
  useGetFilmsNearQuery,
  useGetLatestFilmsQuery,
  useGetSurfBreaksQuery,
  useUpdateUserRecentSearchesMutation,
  useUpdatePreferencesMutation,
  useGetUserFavoritesQuery,
  useGetUserFollowingQuery,
} from '../../src/store';
import { useUser } from '../../src/context/UserProvider';
import { useUserPreferences, formatDistance, kmToUnit, unitToKm } from '../../src/helpers/preferences';
import { countryNameFromCode } from '../../src/helpers/countryNames';
import { useAuth } from '../../src/context/AuthProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useTabBar } from '../../src/context/TabBarContext';
import SessionCard from '../../src/components/SessionCard';
import FavoritesRails from '../../src/components/FavoritesRails';
import BreakDateCard, { type BreakDateGroup } from '../../src/components/BreakDateCard';
import SurfBreakCard from '../../src/components/SurfBreakCard';
import PhotographerCard from '../../src/components/PhotographerCard';
import UserAvatar from '../../src/components/UserAvatar';
import GradientRing, { ACTIVE_STOPS, NOTE_STOPS } from '../../src/components/GradientRing';
import BoardroomFeed, { type BoardroomFeedHandle } from '../../src/components/BoardroomFeed';
import ShaperFeedCard from '../../src/components/ShaperFeedCard';
import SponsoredCard from '../../src/components/SponsoredCard';
import HomeSkeleton from '../../src/components/HomeSkeleton';
import {
  SessionTile,
  ShaperTile,
  BusinessTile,
  FilmTile,
  RAIL_TILE_WIDTH,
} from '../../src/components/home/FeedTiles';
import CreateFilmSheet from '../../src/components/CreateFilmSheet';
import ExploreGrid from '../../src/components/home/ExploreGrid';
import BoardsExploreGrid from '../../src/components/home/BoardsExploreGrid';
import FilmsExploreGrid from '../../src/components/home/FilmsExploreGrid';
import SearchResultsGrid from '../../src/components/home/SearchResultsGrid';
import ProfileRails from '../../src/components/home/ProfileRails';
import BoardIcon from '../../src/components/BoardIcon';
import RailSkeleton from '../../src/components/home/RailSkeleton';
import {
  // groupAdsByPartner intentionally not imported — Phase B retired
  // partner-level ad grouping in favor of per-ad media[] carousels.
  interleavePromoGroups,
  zipPromoGroups,
  shuffleAdsByPartner,
  type FeedRow,
} from '../../src/helpers/interleaveAds';
import { useUserCoords } from '../../src/hooks/useUserCoords';

type SearchType = 'surf_break' | 'user';
type FeedType = 'surfvault' | 'discover' | 'following' | 'favorites' | 'boardroom';

// A manually-pinned nearby anchor (chosen via the in-page location picker).
// Mirrors web Home's "Set location" — overrides the GPS/home-break chain.
type NearbyAnchor = { lat: number; lon: number; breakId?: string; name?: string };

// NOTE: 'discover' and 'boardroom' are intentionally NOT in the picker.
// 'discover' lives in the Explore grid (Search screen). 'boardroom' is a
// "See all" drill-down off the Nearby Shapers rail (back-arrow header). Both
// types are retained for the internal `feedType === ...` guards / rendering.
const FEED_OPTIONS: { value: FeedType; label: string; description: string; comingSoon?: boolean }[] = [
  { value: 'surfvault', label: 'SurfVault', description: 'Sessions, breaks & shapers near you' },
  { value: 'following', label: 'Following', description: 'Sessions from people you follow' },
  { value: 'favorites', label: 'Favorites', description: 'Sessions at your favorited breaks' },
];

// Quick filter pills below the Discover search bar. The first three re-sort the
// same session grid; 'boards' swaps in a location-independent grid of shaper
// boards from across the vault.
type ExploreTab = 'latest' | 'recent' | 'popular' | 'onThisDay' | 'films' | 'boards';
const EXPLORE_TABS: { value: ExploreTab; label: string; icon?: string }[] = [
  { value: 'latest', label: 'New' },
  { value: 'recent', label: 'Recent' },
  { value: 'popular', label: 'Popular', icon: 'flame' },
  { value: 'onThisDay', label: 'On This Day', icon: 'calendar' },
  { value: 'films', label: 'Films', icon: 'logo-youtube' },
  { value: 'boards', label: 'Boards' },
];

// Content-type chips for the free structured search lane (single-select).
// People = surfers + photographers; Brands = shapers + advertisers.
const SEARCH_TYPE_CHIPS = [
  { key: 'session', label: 'Sessions' },
  { key: 'film', label: 'Films' },
  { key: 'board', label: 'Boards' },
  { key: 'people', label: 'People' },
  { key: 'brand', label: 'Brands' },
];

// Default "Try searching" chips — fallback when the DB-backed list
// (/search-suggestions) is empty/unreachable. Structured ones (types + term) run
// the FREE lane; the bare one is a genuine NL example (date parsing).
const DEFAULT_SUGGESTIONS: { label: string; types?: string[]; term?: string }[] = [
  { label: 'Films in California', types: ['film'], term: 'California' },
  { label: 'Longboard shapers', types: ['brand'], term: 'longboard' },
  { label: 'Drone photographers', types: ['people'], term: 'drone' },
  { label: 'Sessions at Pipeline last winter' },
];

// Module-level so the offset survives any remount (tab detach/attach cycles).
let savedFeedOffset = 0;
// Same trick for the active feed type — useSmartBack does router.replace which
// re-mounts the home tab, so without persistence boardroom users land on
// discover when they back out of /shaper/[id] or any other top-level route.
// Defaults to the nearby "SurfVault" feed (mirrors web's nearby landing).
let savedFeedType: FeedType = 'surfvault';
// Persisted manual anchor — survives the same remount cycles as the feed type
// so a user's chosen location isn't lost when backing out of a pushed route.
let savedAnchor: NearbyAnchor | null = null;
// Persist the Discover overlay across home-tab remounts. Backing out of a
// session/break opened from Explore can remount the tab (smartBack replaces),
// which would otherwise drop the overlay and land on the feed. Seeding initial
// state from these re-opens Discover on the same pill. (When smartBack instead
// pops — depth ≥ 2 — the tab never remounts and the overlay/scroll are kept
// natively; these stay in sync either way.)
let savedSearchVisible = false;
let savedExploreTab: ExploreTab = 'latest';

// Radius presets — round numbers in the DISPLAYED unit (matches Settings). The
// stored value is always km, so a tapped option is converted on write.
const BREAK_RADIUS_PRESETS: Record<string, number[]> = { mi: [25, 50, 100, 150, 250], km: [50, 100, 200, 300, 500] };
const PHOTOG_RADIUS_PRESETS: Record<string, number[]> = { mi: [10, 25, 50, 100, 150], km: [25, 50, 100, 200, 300] };

// Inline radius selector for the nearby rail headers (logged-in only) — a
// native menu, same pattern as the feed picker. Shows the current radius; tap
// to pick a new one, which writes the preference (km) and re-fetches the rail.
function RadiusMenu({
  presets,
  units,
  valueKm,
  onChange,
}: {
  presets: number[];
  units: string;
  valueKm: number;
  onChange: (km: number) => void;
}) {
  const unitLabel = units === 'mi' ? 'mi' : 'km';
  const current = Math.round(kmToUnit(valueKm, units as any));
  const actions = presets.map((p) => ({
    id: String(Math.round(unitToKm(p, units as any))),
    title: `${p}${unitLabel}`,
    state: p === current ? ('on' as const) : undefined,
  }));
  return (
    <MenuView actions={actions} onPressAction={({ nativeEvent }) => onChange(Number(nativeEvent.event))}>
      <View style={styles.radiusChip}>
        <Text style={styles.radiusChipText}>{formatDistance(valueKm, units as any)}</Text>
        <Ionicons name="chevron-down" size={12} color="#0ea5e9" style={{ marginLeft: 2 }} />
      </View>
    </MenuView>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const trackedPush = useTrackedPush();
  const setNavDepth = useSetNavDepth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();
  const { units, nearby: nearbyPrefs } = useUserPreferences();
  const { isAuthenticated } = useAuth();
  const requireAuth = useRequireAuth();
  const { setTabBarVisible } = useTabBar();
  const [updateUserRecentSearches] = useUpdateUserRecentSearchesMutation();
  const [updatePreferences] = useUpdatePreferencesMutation();
  // Write a nearby radius preference (optimistic via getSelf cache; rail
  // re-fetches with the new radiusKm). Best-effort — never throws to the UI.
  const setNearbyRadius = useCallback(
    (key: 'breaksKm' | 'photographersKm', km: number) => {
      updatePreferences({ preferences: { nearby: { [key]: km } } })
        .unwrap()
        .catch(() => {});
    },
    [updatePreferences]
  );

  // Cache the top inset so it never drops to 0 mid-session (safe-area-context
  // can briefly report 0 during stack push/pop transitions, which makes the
  // header snap above the status bar until the next frame).
  const insets = useSafeAreaInsets();
  const stableTopRef = useRef(0);
  if (insets.top > stableTopRef.current) stableTopRef.current = insets.top;
  const topInset = stableTopRef.current;

  // Location — read from Redux (set by map page when permission is granted)
  const coords = useSelector((state: any) => state.location.coordinates);
  // Manually-pinned nearby anchor (in-page "Set location" picker). Seeded from
  // the module-level cache so a pinned location survives remounts.
  const [manualAnchor, setManualAnchor] = useState<NearbyAnchor | null>(savedAnchor);
  // Also request on first home visit if the user never opened the map tab —
  // BUT only when the user hasn't set a home break in their profile OR pinned a
  // location manually. In either case we already have a geo anchor and don't
  // need to nag for OS permission.
  const hasProfileBreak = !!(user as any)?.surf_break_id;
  const { lat: userLat, lon: userLon, hasCoords } = useUserCoords({
    skipPrompt: hasProfileBreak || !!manualAnchor,
  });

  // Shaper feed anchors on the user's home break first (custom shapers are
  // bought near where you surf, not where you stand) and falls back to device
  // GPS — same logic as BoardroomFeed. Without this fallback, users who have
  // a home break but no GPS permission would see an empty shaper stream on
  // Discover even though Boardroom shows them just fine.
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
  const shaperLat = breakLat ?? userLat;
  const shaperLon = breakLon ?? userLon;
  const hasShaperCoords = shaperLat != null && shaperLon != null;

  // Active feed — declared up here so the nearby queries below can skip when
  // we're not on the SurfVault (nearby) feed. Nearby content lives ONLY on the
  // SurfVault landing now; Discover/Following/Favorites are pure session feeds.
  const [feedType, setFeedType] = useState<FeedType>(savedFeedType);
  const isSurfVault = feedType === 'surfvault';

  // ---- Nearby anchor ----
  // Resolution order mirrors web Home:
  //   1. manual pin (in-page "Set location" picker)
  //   2. the user's home break (set in profile)
  //   3. device GPS (`useUserCoords` auto-prompts on home visit)
  //   4. last-known Redux coords (set by the map tab)
  // Declared up here (above the sessions query) so the SurfVault landing feed
  // can scope sessions/ads to the nearby break ids.
  const nearbyLat = manualAnchor?.lat ?? breakLat ?? userLat ?? coords?.lat ?? null;
  const nearbyLon = manualAnchor?.lon ?? breakLon ?? userLon ?? coords?.lon ?? null;
  const hasNearbyAnchor = nearbyLat != null && nearbyLon != null;
  // `currentData` (not `data`): clears the instant the location/anchor changes
  // so the nearby rails fall back to skeletons instead of showing the previous
  // location's stale breaks/sessions/etc. while the new ones load.
  const { currentData: nearbyBreaksData } = useGetNearbySurfBreaksQuery(
    { lat: nearbyLat ?? 0, long: nearbyLon ?? 0, radiusKm: nearbyPrefs.breaksKm },
    // Runs on SurfVault (rails) AND Boardroom — keeps `anchorBreakId` resolving
    // to the nearest break on both so Boardroom's region filter is consistent
    // (GPS-only users with no home break). Cached across both, no extra fetch.
    { skip: !hasNearbyAnchor || (feedType !== 'surfvault' && feedType !== 'boardroom') }
  );
  // API returns `nearbyBreaks` (not `surfBreaks`) — see CLAUDE.md gotchas.
  const nearbyBreaks =
    nearbyBreaksData?.results?.nearbyBreaks ?? nearbyBreaksData?.results?.surfBreaks ?? [];
  const nearbyBreakIds = useMemo(
    () => (nearbyBreaks as any[]).map((b) => b.id).filter(Boolean),
    [nearbyBreaks]
  );
  // The break to anchor shaper distance + the picker label on. Manual pin wins,
  // then the profile home break, then the closest break to the GPS anchor.
  const anchorBreakId =
    manualAnchor?.breakId ?? (user as any)?.surf_break_id ?? (nearbyBreaks[0] as any)?.id ?? undefined;
  const anchorName =
    manualAnchor?.name ??
    ((user as any)?.surf_break_name as string | undefined) ??
    ((nearbyBreaks[0] as any)?.name as string | undefined) ??
    undefined;
  // The anchor break's country/region — fed to the nearby-films rail so film
  // subtitles resolve to the viewer-context region (web NearbyFilmCard parity).
  const anchorBreak =
    (nearbyBreaks as any[]).find((b) => b.id === anchorBreakId) ?? (nearbyBreaks as any[])[0];
  const anchorCountryCode = anchorBreak?.country_code ?? (user as any)?.surf_break_country_code ?? null;
  const anchorRegion = anchorBreak?.region ?? (user as any)?.surf_break_region ?? null;
  // Title-cased region for the "in {Region}" rail subtitle (stored UPPER-case);
  // no region → full country name (e.g. Portugal) over the bare country code.
  const anchorRegionLabel = anchorRegion
    ? String(anchorRegion).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
    : countryNameFromCode(anchorCountryCode);

  // ---- Add-a-film (from the Nearby Surf Films rail) ----
  const [createFilmVisible, setCreateFilmVisible] = useState(false);
  const handleAddFilm = useCallback(() => {
    if (!requireAuth()) return;
    setCreateFilmVisible(true);
  }, [requireAuth]);

  // ---- Viewability tracking ----
  // Until the first non-empty viewability report arrives, treat every card as
  // viewable. Otherwise tab re-focus / scroll restoration causes cards to mount
  // with isViewable=false, then flip true on first report, retriggering
  // fade-in animations — visible as a "flash twice" on every tab return.
  const [hasViewabilityReport, setHasViewabilityReport] = useState(false);
  const [viewableIds, setViewableIds] = useState<Set<string>>(new Set());
  // Pause clip autoplay when the Home tab is blurred (another tab / a pushed
  // route on top) — "in view" means on-screen AND focused.
  const [feedFocused, setFeedFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFeedFocused(true);
      return () => setFeedFocused(false);
    }, [])
  );
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    // Ignore transient empty reports (fires briefly during back-navigation
    // re-attach and during programmatic scrollToOffset). Treating those as
    // "nothing visible" causes every card to flip isViewable → false → true,
    // which restarts every fade animation and looks like a flash.
    if (viewableItems.length === 0) return;
    setHasViewabilityReport(true);
    setViewableIds(new Set(viewableItems.map((v) => v.key)));
  }).current;

  // Viewability for the SurfVault horizontal rails → autoplay the clips/ad
  // videos of tiles currently in each rail (gated on tab focus below). One set
  // per rail; a single shared config (each FlatList needs a STABLE callback).
  const [sessionRailViewable, setSessionRailViewable] = useState<Set<string>>(new Set());
  const onSessionRailViewable = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setSessionRailViewable(new Set(viewableItems.map((v) => v.key)));
  }).current;
  const [shaperRailViewable, setShaperRailViewable] = useState<Set<string>>(new Set());
  const onShaperRailViewable = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setShaperRailViewable(new Set(viewableItems.map((v) => v.key)));
  }).current;
  const [adRailViewable, setAdRailViewable] = useState<Set<string>>(new Set());
  const onAdRailViewable = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    setAdRailViewable(new Set(viewableItems.map((v) => v.key)));
  }).current;
  const railViewConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  // SurfVault page scroll drives two things:
  //   (a) fade the anchor break name into the header as the location bar
  //       scrolls out of sight, and
  //   (b) gate rail autoplay to rails actually on-screen vertically — a
  //       horizontal rail's own viewability can't tell it's been scrolled
  //       off the top, so without this its clips would keep playing off-screen.
  const surfScrollY = useRef(new Animated.Value(0)).current;
  const surfScrollYNum = useRef(0);
  const railLayoutsRef = useRef<Record<string, { y: number; h: number }>>({});
  const surfViewportH = useRef(0);
  const [railsInView, setRailsInView] = useState<Record<string, boolean>>({});
  const recomputeRailsInView = useCallback((y: number) => {
    const vh = surfViewportH.current;
    if (!vh) return;
    const top = y;
    const bottom = y + vh;
    setRailsInView((prev) => {
      const layouts = railLayoutsRef.current;
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(layouts)) {
        const l = layouts[k];
        const vis = l.y < bottom && l.y + l.h > top;
        if (next[k] !== vis) {
          next[k] = vis;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);
  const onSurfScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: surfScrollY } } }], {
        useNativeDriver: true,
        listener: (e: any) => {
          const y = e.nativeEvent.contentOffset.y;
          surfScrollYNum.current = y;
          recomputeRailsInView(y);
        },
      }),
    [recomputeRailsInView, surfScrollY]
  );
  // Anchor name is hidden while the location bar is visible, then fades into the
  // header as you scroll past it (~location-bar height).
  const headerCaptionOpacity = surfScrollY.interpolate({
    inputRange: [40, 92],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const onRailLayout = (key: string) => (e: any) => {
    const { y, height } = e.nativeEvent.layout;
    railLayoutsRef.current[key] = { y, h: height };
    // Settle the initial in-view state once positions are known (no scroll yet).
    recomputeRailsInView(surfScrollYNum.current);
  };

  // ---- Feed type (SurfVault / Discover / Following / Favorites / Boardroom) ----
  // `feedType` + `isSurfVault` are declared above (near the nearby queries).
  const currentFeed = FEED_OPTIONS.find((f) => f.value === feedType) ?? FEED_OPTIONS[0];

  // ---- Discover Feed ----
  const [sessions, setSessions] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const seenIdsRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const isFetchingMoreRef = useRef(false);
  const feedListRef = useRef<FlatList<any>>(null);
  const boardroomRef = useRef<BoardroomFeedHandle>(null);
  // Frozen at mount so re-renders never push a new contentOffset prop into
  // the ScrollView (which on iOS would reset the user's current scroll).
  const initialContentOffset = useRef({ x: 0, y: savedFeedOffset }).current;

  const handleFeedScroll = useCallback((e: any) => {
    savedFeedOffset = e.nativeEvent.contentOffset.y;
  }, []);

  // Restore scroll position on focus, single attempt. Multiple retries
  // caused viewable-items thrash (re-firing all the card animations as
  // the Set was rebuilt repeatedly).
  useFocusEffect(
    useCallback(() => {
      const target = savedFeedOffset;
      if (target <= 0) return;
      const t = setTimeout(() => {
        feedListRef.current?.scrollToOffset({ offset: target, animated: false });
      }, 100);
      return () => clearTimeout(t);
    }, [])
  );

  // Tap the Home tab while focused → scroll feed to top
  const navigation = useNavigation();
  useEffect(() => {
    const unsub = (navigation as any).addListener?.('tabPress', () => {
      if ((navigation as any).isFocused?.()) {
        savedFeedOffset = 0;
        feedListRef.current?.scrollToOffset({ offset: 0, animated: true });
        boardroomRef.current?.scrollToTop();
      }
    });
    return unsub;
  }, [navigation]);

  const [refreshing, setRefreshing] = useState(false);

  const feedQueryArg = feedType === 'following' || feedType === 'favorites' ? feedType : undefined;
  // Discover + Favorites + SurfVault get the grouped (break+date) feed shape.
  // Following stays per-session — the point of Following is "what did this
  // person do", not "what happened at this place".
  const useGroupedFeed = feedType === 'discover' || feedType === 'favorites' || feedType === 'surfvault';
  // SurfVault scopes the grouped session feed to nearby breaks (mirrors web's
  // "Nearby Sessions"). Only engaged once the nearby breaks have resolved.
  // (`isSurfVault` is declared above near the nearby queries.)
  const { data: sessionsData, currentData: sessionsCurrentData, isLoading, isFetching, refetch: refetchSessions } = useGetLatestSessionsQuery(
    {
      userId: user?.id,
      // 12 to match web's Nearby Sessions rail (which fetches limit:12). Also
      // the page size for the vertical Discover/Following/Favorites feeds, which
      // paginate via continuationToken — a slightly larger page is harmless.
      limit: 12,
      continuationToken,
      feed: feedQueryArg,
      groupByBreakDate: useGroupedFeed,
      surfBreakIds: isSurfVault ? nearbyBreakIds : undefined,
    },
    {
      // Wait for the authed user's id to land before fetching — otherwise
      // the first fetch goes out with no viewerId and the server-side block
      // filter is a no-op. Anonymous users (not logged in) fetch immediately.
      // SurfVault waits for a nearby anchor + resolved breaks; with none, the
      // empty state prompts the user to set a location.
      skip:
        // boardroom + favorites render their own components (BoardroomFeed /
        // FavoritesRails) which fetch their own data — don't double-fetch here.
        feedType === 'boardroom'
        || feedType === 'favorites'
        || (isAuthenticated && !user?.id)
        || (feedType === 'following' && !user?.id)
        || (isSurfVault && nearbyBreakIds.length === 0),
    }
  );

  useEffect(() => {
    const results = sessionsCurrentData?.results;
    if (!results) return;
    // Grouped feeds return `groups`, ungrouped return `sessions`. Either way
    // the items are plugged into the same row pipeline; downstream we
    // dispatch the renderer based on shape (group_key present → BreakDateCard).
    const incoming = Array.isArray(results.groups)
      ? results.groups
      : Array.isArray(results.sessions) ? results.sessions : [];
    const nextToken = results.continuationToken || '';
    hasMoreRef.current = Boolean(nextToken);

    // Dedup key: groups → "date|group_key", sessions → session_id.
    const keyOf = (item: any): string | null => {
      if (item?.group_key && item?.session_date) return `${item.session_date}|${item.group_key}`;
      return item?.session_id ?? item?.id ?? null;
    };

    if (isRefreshingRef.current) {
      // On refresh: replace with fresh data
      seenIdsRef.current = new Set();
      const unique = incoming.filter((s: any) => {
        const id = keyOf(s);
        if (!id || seenIdsRef.current.has(id)) return false;
        seenIdsRef.current.add(id);
        return true;
      });
      setSessions(unique);
      isRefreshingRef.current = false;
      isFetchingMoreRef.current = false;
      return;
    }

    if (!incoming.length) { isFetchingMoreRef.current = false; return; }
    setSessions((prev) => {
      const newItems: any[] = [];
      for (const s of incoming) {
        const id = keyOf(s);
        if (!id) continue;
        if (!seenIdsRef.current.has(id)) { seenIdsRef.current.add(id); newItems.push(s); }
      }
      if (!newItems.length) return prev;
      return prev.concat(newItems);
    });
    isFetchingMoreRef.current = false;
  }, [sessionsCurrentData]);

  const isRefreshingRef = useRef(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const keyOf = (item: any): string | null => {
      if (item?.group_key && item?.session_date) return `${item.session_date}|${item.group_key}`;
      return item?.session_id ?? item?.id ?? null;
    };
    try {
      if (continuationToken !== '') {
        // Deep cursor → '': a real arg change reliably re-fires the query, so the
        // effect's refresh branch rebuilds the list from page 1.
        isRefreshingRef.current = true;
        setContinuationToken('');
        await refetchSessions();
      } else {
        // Already at page 1: the arg doesn't change, so RTK structural sharing can
        // keep sessionsCurrentData's reference stable and the effect won't re-run —
        // which would leave isRefreshingRef stuck true and make the NEXT scroll
        // wipe the feed to a single page. Rebuild directly from the forced refetch.
        const res: any = await refetchSessions().unwrap();
        const results = res?.results;
        const incoming = Array.isArray(results?.groups)
          ? results.groups
          : Array.isArray(results?.sessions) ? results.sessions : [];
        seenIdsRef.current = new Set();
        const unique = incoming.filter((s: any) => {
          const id = keyOf(s);
          if (!id || seenIdsRef.current.has(id)) return false;
          seenIdsRef.current.add(id);
          return true;
        });
        hasMoreRef.current = Boolean(results?.continuationToken);
        isFetchingMoreRef.current = false;
        isRefreshingRef.current = false;
        setSessions(unique);
      }
    } catch {}
    setRefreshing(false);
  }, [continuationToken, refetchSessions]);

  const handleLoadMore = useCallback(() => {
    if (!hasMoreRef.current || isFetchingMoreRef.current) return;
    const nextToken = sessionsData?.results?.continuationToken;
    if (!nextToken) return;
    isFetchingMoreRef.current = true;
    setContinuationToken(nextToken);
  }, [sessionsData]);

  // Clear the accumulated session list + pagination so the feed rebuilds from
  // page 1. Shared by feed switches AND nearby-anchor changes (re-pinning a
  // location must drop sessions from the old anchor).
  const resetFeedAccumulator = useCallback(() => {
    seenIdsRef.current = new Set();
    hasMoreRef.current = false;
    isFetchingMoreRef.current = false;
    setSessions([]);
    setContinuationToken('');
    setViewableIds(new Set());
    setHasViewabilityReport(false);
    savedFeedOffset = 0;
    feedListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const handleFeedChange = useCallback((next: FeedType) => {
    if (next === feedType) return;
    resetFeedAccumulator();
    // Reset the shared scroll value so the header caption starts hidden on the
    // new feed (both SurfVault + Boardroom drive this for the anchor-name fade).
    surfScrollY.setValue(0);
    savedFeedType = next;
    setFeedType(next);
  }, [feedType, resetFeedAccumulator, surfScrollY]);

  const feedMenuActions = useMemo(() => {
    return [
      {
        id: 'surfvault' as FeedType,
        title: 'SurfVault',
        subtitle: 'Nearby',
        state: feedType === 'surfvault' ? ('on' as const) : undefined,
      },
      {
        id: 'following' as FeedType,
        title: 'Following',
        state: feedType === 'following' ? ('on' as const) : undefined,
        attributes: !user?.id ? { disabled: true } : undefined,
      },
      {
        id: 'favorites' as FeedType,
        title: 'Favorites',
        state: feedType === 'favorites' ? ('on' as const) : undefined,
        attributes: !user?.id ? { disabled: true } : undefined,
      },
    ];
  }, [feedType, user?.id]);

  // ---- Search overlay ----
  const [searchVisible, setSearchVisible] = useState(savedSearchVisible);
  // Input focus drives whether the Breaks/People segments show. When the
  // overlay first opens (unfocused, empty) it shows the Explore grid instead.
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('surf_break');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // Active Explore pill — three session sorts + a boards mode. Driven by the
  // pill row below the Discover search bar (browse state only).
  const [exploreTab, setExploreTab] = useState<ExploreTab>(savedExploreTab);
  // NL + structured search state (mirrors web Home). nlQuery = submitted
  // sentence (AI); searchScope = a content-type chip → free structured search;
  // focusedUser = a tapped account → in-search focused-profile view.
  const [nlQuery, setNlQuery] = useState('');
  const [searchScope, setSearchScope] = useState<string | null>(null);
  const [focusedUser, setFocusedUser] = useState<any>(null);
  const [, setActiveIntent] = useState<any>(null);

  // Keep the module-level mirrors in sync so a home-tab remount restores the
  // overlay + pill exactly. Also hide the tab bar on a restore-into-Discover
  // mount (the overlay is full-screen and owns its own chrome).
  useEffect(() => { savedSearchVisible = searchVisible; }, [searchVisible]);
  useEffect(() => { savedExploreTab = exploreTab; }, [exploreTab]);
  useEffect(() => {
    if (savedSearchVisible) setTabBarVisible(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const searchInputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Location picker (SurfVault "Set location" — mirrors web Home) ----
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const locationInputRef = useRef<TextInput>(null);
  const locationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: locationBreaksData, isFetching: locationLoading } = useGetSurfBreaksQuery(
    { search: locationSearch, limit: 12 },
    { skip: !locationPickerVisible || locationSearch.length < 2 }
  );
  const locationResults = locationBreaksData?.results?.breaks ?? [];

  const openLocationPicker = useCallback(() => {
    setLocationPickerVisible(true);
    setTabBarVisible(false);
    setTimeout(() => locationInputRef.current?.focus(), 100);
  }, [setTabBarVisible]);

  const closeLocationPicker = useCallback(() => {
    Keyboard.dismiss();
    setLocationPickerVisible(false);
    setTabBarVisible(true);
    setLocationSearch('');
  }, [setTabBarVisible]);

  const handleLocationSearchInput = useCallback((text: string) => {
    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);
    locationDebounceRef.current = setTimeout(() => setLocationSearch(text), 350);
  }, []);

  // Pin a chosen break as the nearby anchor. Resets the feed so nearby
  // sessions rebuild from the new location, and jumps to SurfVault mode.
  const pickAnchorBreak = useCallback((b: any) => {
    const lat = parseCoord(b?.coordinates?.lat ?? b?.lat);
    const lon = parseCoord(b?.coordinates?.lon ?? b?.lon);
    if (lat == null || lon == null) return;
    const next: NearbyAnchor = { lat, lon, breakId: b.id, name: b.name };
    savedAnchor = next;
    setManualAnchor(next);
    resetFeedAccumulator();
    // Stay on the current feed — the picker is reached from both the SurfVault
    // and Boardroom location bars, and both consume the same anchor.
    closeLocationPicker();
  }, [resetFeedAccumulator, closeLocationPicker]);

  // Drop the manual pin — fall back to the GPS / home-break chain.
  const clearManualAnchor = useCallback(() => {
    savedAnchor = null;
    setManualAnchor(null);
    resetFeedAccumulator();
    closeLocationPicker();
  }, [resetFeedAccumulator, closeLocationPicker]);

  // Nearby photographers — anchored on the same resolved nearby point as the
  // breaks query above (which lives higher up so sessions can scope to it).
  const { currentData: nearbyPhotographersData } = useGetNearbyPhotographersQuery(
    { lat: nearbyLat ?? 0, long: nearbyLon ?? 0, viewerId: user?.id, radiusKm: nearbyPrefs.photographersKm },
    { skip: !hasNearbyAnchor || !isSurfVault || (isAuthenticated && !user?.id) }
  );

  // Search — uses /map/search which returns { results: { searchContent: [...] } }
  // API accepts type: "all" | "surf_break" | "photographer" (legacy) | "user" (all users)
  // Structured (type-chip) search is on when a content type is picked + there's
  // a term — builds the intent client-side and skips the LLM.
  const structuredActive = !!searchScope && searchTerm.length >= 2;
  // Instant quick-jump panel: combined breaks + people (type 'all'). Skipped
  // while showing NL results, structured results, or a focused profile.
  const { data: searchData, isFetching: searchLoading } = useGetMapSearchContentQuery(
    { search: searchTerm, type: 'all', tags: [], viewerId: user?.id },
    {
      skip:
        searchTerm.length < 2 ||
        (isAuthenticated && !user?.id) ||
        !!nlQuery ||
        !!focusedUser ||
        structuredActive,
    }
  );

  const { data: tagsData } = useGetPopularTagsQuery(undefined);

  // API returns `nearbyPhotographers` (not `photographers`) — see CLAUDE.md
  // gotchas. (`nearbyBreaks` is parsed up top alongside the breaks query.)
  const nearbyPhotographers =
    nearbyPhotographersData?.results?.nearbyPhotographers ??
    nearbyPhotographersData?.results?.photographers ??
    [];
  const popularTags = tagsData?.results?.tags ?? [];

  // Ads for the home feed — geo-boosted when we have user coords.
  // Mobile has no sidebar rail, so we pull ALL eligible ads (no placement filter)
  // and render them all as post-style cards in the feed. This keeps "sidebar"
  // inventory from being wasted on mobile, which is where most traffic lands.
  const { currentData: adsData } = useGetAdsQuery({
    feed: true,
    lat: hasCoords && userLat != null ? userLat : undefined,
    lon: hasCoords && userLon != null ? userLon : undefined,
    // SurfVault feed = "Nearby Business": scope ads to the nearby breaks
    // (mirrors web Home). Other feeds rely on the lat/lon geo-boost.
    surfBreakIds: isSurfVault && nearbyBreakIds.length ? nearbyBreakIds : undefined,
    // Pull the server cap (30) so the interleave has enough inventory to
    // cover deep scrolls at AD_EVERY_N_ITEMS cadence before exhausting.
    limit: 30,
  });
  // Discover: latest shapers (anyone, sorted by latest featured-board
  // activity — the freshest upload bubbles to the top).
  // Following: shapers the viewer follows, same activity-based sort.
  // Favorites + Boardroom don't include shapers in this interleave.
  // No lat/lon plumbing — shaper location comes from `users.surf_break_id`
  // server-side now, not from device GPS.
  const { data: nearbyShapersData } = useGetLatestShapersQuery(
    { limit: 100 },
    { skip: feedType !== 'discover' }
  );
  const { data: followedShapersData } = useGetShapersFromFollowingQuery(
    { limit: 100 },
    { skip: !user?.id || feedType !== 'following' }
  );
  // The favorites/following probes ONLY run once the session feed has resolved
  // EMPTY — i.e. exactly when the empty-state message needs to disambiguate.
  // For users who follow people / have favorites with sessions, these never
  // fire (no wasted query in the common case).
  const feedResolvedEmpty = !!sessionsCurrentData && sessions.length === 0;

  // Favorites empty state: "no favorites yet" vs "favorites, but no sessions".
  const { data: favoritesData, isLoading: favoritesProbing } = useGetUserFavoritesQuery(
    {} as any,
    { skip: !user?.id || feedType !== 'favorites' || !feedResolvedEmpty }
  );
  const favoritesCount = favoritesData?.results?.favorites?.length ?? 0;
  // Following empty state: "not following anyone" vs "following, but no
  // sessions". A limit-1 probe is enough to detect presence.
  const { data: followingListData, isLoading: followingProbing } = useGetUserFollowingQuery(
    { handle: (user as any)?.handle ?? '', filter: 'following', search: '', limit: 1 },
    { skip: !user?.id || !(user as any)?.handle || feedType !== 'following' || !feedResolvedEmpty }
  );
  const followsAnyone = (followingListData?.results?.followStats?.length ?? 0) > 0;
  // While the empty-state probe is in flight, keep showing the skeleton (not a
  // spinner) so the disambiguated message appears only once it's known.
  const probeLoading =
    (feedType === 'favorites' && favoritesProbing) || (feedType === 'following' && followingProbing);
  // SurfVault "Nearby Shapers" — shapers tied to the anchor break's region (or
  // country fallback). This is genuinely location-scoped, so changing the pinned
  // location swaps the shaper set (or empties it). NOTE: deliberately NOT
  // getBoardroomShapers — that returns ALL shapers globally, just re-sorted by
  // distance, so the rail never visibly changed when the location moved.
  const { currentData: surfvaultShapersData } = useGetShapersForSurfBreakQuery(
    { breakId: anchorBreakId as string, limit: 20 },
    { skip: !isSurfVault || !anchorBreakId }
  );

  // Nearby Surf Films — region-anchored to the nearby break (same model as web
  // Home2). With an anchor → region/country films; without → latest films.
  const { currentData: regionFilmsData } = useGetFilmsForSurfBreakQuery(
    { breakId: anchorBreakId as string, limit: 12 },
    { skip: !isSurfVault || !anchorBreakId }
  );
  const { currentData: latestFilmsData } = useGetLatestFilmsQuery(
    { limit: 12 },
    { skip: !isSurfVault || !!anchorBreakId }
  );
  const nearbyFilms = (
    (anchorBreakId ? regionFilmsData?.results?.films : latestFilmsData?.results?.films) ?? []
  ).slice(0, 12);

  // ---- "On This Day" rail ----
  // Sessions + films shot on today's calendar month-day across all past years.
  // Nearby-scoped when a location is resolved; otherwise a GLOBAL fallback (no
  // surfBreakIds / no coords) so logged-out users and users with no location
  // still get content. Month/day come from the device's LOCAL date (not UTC).
  // "See all" opens the global Explore On This Day pill. Only rendered in the
  // SurfVault feed; hidden entirely when even the fallback is empty.
  const onThisDayDate = useMemo(() => {
    const d = new Date();
    return { month: d.getMonth() + 1, day: d.getDate() };
  }, []);
  const otdNearby = isSurfVault && hasNearbyAnchor && nearbyBreakIds.length > 0;
  const { currentData: otdSessionsData } = useGetLatestSessionsQuery(
    {
      userId: user?.id,
      limit: 12,
      groupByBreakDate: true,
      surfBreakIds: otdNearby ? nearbyBreakIds : undefined,
      month: onThisDayDate.month,
      day: onThisDayDate.day,
    },
    { skip: !isSurfVault || (isAuthenticated && !user?.id) }
  );
  const { currentData: otdFilmsData } = useGetFilmsNearQuery(
    {
      lat: otdNearby ? nearbyLat ?? undefined : undefined,
      lon: otdNearby ? nearbyLon ?? undefined : undefined,
      // Scope films to the same radius as the nearby breaks/sessions half,
      // otherwise the proximity sort leaks far-away films into the rail.
      radiusKm: otdNearby ? nearbyPrefs.breaksKm : undefined,
      month: onThisDayDate.month,
      day: onThisDayDate.day,
      limit: 12,
    },
    { skip: !isSurfVault }
  );
  const onThisDayItems = useMemo(() => {
    const groups = ((otdSessionsData as any)?.results?.groups ?? []).map((group: any) => ({
      kind: 'session' as const,
      key: `session|${group.session_date}|${group.group_key}`,
      date: group.session_date,
      group,
    }));
    const films = ((otdFilmsData as any)?.results?.films ?? []).map((film: any) => ({
      kind: 'film' as const,
      key: `film|${film.id}`,
      date: film.film_date || film.created_at,
      film,
    }));
    return [...groups, ...films].sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || ''))
    );
  }, [otdSessionsData, otdFilmsData]);

  // Pick the active shaper stream by feedType. Combined into a single promo
  // pool with paid ads — one slot per shaper (featured boards swipe inside
  // the card) so a prolific shaper can't dominate. Sessions still drive the
  // cadence (one promo per AD_EVERY_N_ITEMS items). Ads and shapers
  // alternate (ad-first) so neither side crowds the other out of the cadence.
  // Re-seeded on each filter change (and per mount) so the ad order is freshly
  // shuffled rather than serving RTK Query's one cached weighted-random draw.
  const adShuffleSeed = useMemo(() => Math.floor(Math.random() * 1e9), [feedType]);
  const feedAds = useMemo(() => {
    // Round-robin by advertiser + fresh per-filter shuffle so a fresh batch
    // from one advertiser can't clump at the top of the feed.
    const ads = shuffleAdsByPartner(adsData?.results?.ads || [], adShuffleSeed).map(
      (a: any) => ({ ...a, _kind: 'ad' as const })
    );
    const activeShapersData =
      feedType === 'following'
        ? followedShapersData
        : feedType === 'surfvault'
        ? surfvaultShapersData
        : nearbyShapersData;
    const shapers = (activeShapersData?.results?.shapers || []).map((s: any) => ({
      ...s,
      _kind: 'shaper' as const,
    }));
    // Phase B: each ad is its own promo slot. The carousel inside
    // SponsoredCard now renders the ad's media[] slides; partner grouping
    // was retired. Wrap each ad as a single-element "group" so the
    // interleave helper's group-iteration semantics still apply.
    const adGroups = ads.map((a: any) => [a]);
    const shaperGroups = shapers.map((s: any) => [s]);
    // TEMP: shaper-first so the first promo slot in Discover is a shaper.
    // Revert to `zipPromoGroups(adGroups, shaperGroups)` to restore ad-first.
    return zipPromoGroups(shaperGroups, adGroups);
  }, [adsData, nearbyShapersData, followedShapersData, surfvaultShapersData, feedType, adShuffleSeed]);

  // Interleave alternating ad/shaper groups into the session feed at the
  // shared cadence — matches web so both platforms place promos identically.
  // Custom itemKey handles the grouped feed shape (groups have group_key,
  // not session_id) so React keys stay unique across both shapes.
  // `hasMoreSessions` gates the tail-dump: while more pages can be fetched,
  // hold back leftover promos so they don't pile up consecutively at the end
  // of every partial page.
  const hasMoreSessions = Boolean(sessionsCurrentData?.results?.continuationToken);
  const feedRows = useMemo(
    () => {
      const rows = interleavePromoGroups(
        sessions,
        feedAds,
        undefined,
        (t: any, i: number) =>
          t?.group_key && t?.session_date
            ? `g-${t.session_date}-${t.group_key}`
            : t?.session_id ?? t?.id ?? `item-${i}`,
        hasMoreSessions
      ) as FeedRow<any, any>[];

      // Following only: a followed shaper is editorial content the viewer
      // explicitly opted into — not a fill-in ad. interleavePromoGroups anchors
      // promos on sessions and returns [] when there are none, which would
      // silently drop the shaper if nobody you follow has posted a session.
      // Once the session query has resolved empty, surface the followed shapers
      // on their own so they aren't lost. (Ads are intentionally NOT drained
      // here — an ads-only feed is exactly what the empty-items guard avoids.)
      if (rows.length === 0 && feedType === 'following' && sessionsCurrentData) {
        const shapers = followedShapersData?.results?.shapers || [];
        return shapers.map((s: any) => ({
          type: 'ad' as const,
          key: `a-${s.id ?? s.handle}`,
          data: [{ ...s, _kind: 'shaper' as const }],
        })) as FeedRow<any, any>[];
      }

      return rows;
    },
    [sessions, feedAds, hasMoreSessions, feedType, sessionsCurrentData, followedShapersData]
  );

  // Parse search results — API returns searchContent array, dedupe by composite key
  const rawSearchContent = searchData?.results?.searchContent ?? [];
  const searchContent = rawSearchContent.filter((item: any, index: number, arr: any[]) => {
    const key = item.handle
      ? `user:${item.handle}`
      : `break:${item.name}:${item.region ?? ''}:${item.country_code ?? ''}`;
    return arr.findIndex((i: any) => {
      const iKey = i.handle
        ? `user:${i.handle}`
        : `break:${i.name}:${i.region ?? ''}:${i.country_code ?? ''}`;
      return iKey === key;
    }) === index;
  });

  // Recent searches from user profile
  const recentSearches = user?.recentSearches ?? [];
  const filteredRecents = recentSearches.filter(
    (r: any) => r.itemType === 'surf_break' || r.itemType === 'user'
  );

  const handleSearchInput = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setNlQuery('');
    setFocusedUser(null);
    debounceRef.current = setTimeout(() => setSearchTerm(text), 350);
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  // Open the search/explore overlay. Does NOT auto-focus — the overlay opens
  // showing the Explore grid; the user taps the input to enter search mode.
  const openSearch = useCallback(() => {
    setSearchVisible(true);
    setTabBarVisible(false);
  }, [setTabBarVisible]);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearchVisible(false);
    setTabBarVisible(true);
    setSearchTerm('');
    setSelectedTags([]);
    setSearchFocused(false);
    setNlQuery('');
    setSearchScope(null);
    setFocusedUser(null);
    setActiveIntent(null);
    // Back at the plain home tab — clear the depth we set while browsing the
    // overlay so normal tab navigation behaves as usual.
    setNavDepth(0);
  }, [setTabBarVisible, setNavDepth]);

  // Leave search mode but stay in the overlay → back to the Explore grid.
  const exitSearchMode = useCallback(() => {
    Keyboard.dismiss();
    searchInputRef.current?.clear();
    searchInputRef.current?.blur();
    setSearchTerm('');
    setSelectedTags([]);
    setSearchFocused(false);
    setNlQuery('');
    setSearchScope(null);
    setFocusedUser(null);
    setActiveIntent(null);
  }, []);

  const navigateAndClose = useCallback((path: string) => {
    Keyboard.dismiss();
    setSearchVisible(false);
    setTabBarVisible(true);
    setSearchTerm('');
    setSelectedTags([]);
    setSearchFocused(false);
    router.push(path as any);
  }, [router, setTabBarVisible]);

  // Navigate INTO content from the browse grid WITHOUT closing the Discover
  // overlay. The overlay is a conditional render inside this (still-mounted)
  // tab, so the pushed route stacks over it and backing out returns to the
  // Explore grid with its scroll position + loaded tiles intact. (Typed-search
  // results still use navigateAndClose — closing after a search is correct.)
  const navigateKeepExplore = useCallback((path: string) => {
    Keyboard.dismiss();
    // Treat the open overlay as depth 1 and the pushed screen as depth 2, so its
    // smartBack pops (router.back) to the still-mounted overlay instead of
    // replacing the tab (which remounts it and drops the overlay). Set (not
    // increment) so repeated taps stay at 2 with no drift.
    setNavDepth(2);
    router.push(path as any);
  }, [router, setNavDepth]);

  // Record a tapped search result into the user's recent-search history.
  // Invalidates the User tag so getSelf refetches with the item bumped to top.
  const recordSearch = useCallback(
    (type: 'surf_break' | 'user', id?: string) => {
      if (user?.id && id) {
        updateUserRecentSearches({ payload: { recentSearch: { type, data: { id } } } });
      }
    },
    [user?.id, updateUserRecentSearches]
  );

  const navigateToBreak = useCallback((item: any) => {
    recordSearch('surf_break', item.id);
    const identifier = item.surf_break_identifier;
    if (identifier) {
      // identifier could be "COUNTRY/REGION/BREAK" or just "BREAK"
      const parts = identifier.split('/');
      if (parts.length === 3) {
        navigateAndClose(`/break/${parts[0]}/${parts[1]}/${parts[2]}`);
      } else {
        // Build path from separate fields
        const country = item.country_code ?? item.country ?? '';
        const region = item.region && item.region !== '' ? item.region : '0';
        navigateAndClose(`/break/${country}/${region}/${identifier}`);
      }
    }
  }, [navigateAndClose, recordSearch]);

  const navigateToUser = useCallback((item: any) => {
    recordSearch('user', item.id);
    navigateAndClose(`/user/${item.handle}`);
  }, [navigateAndClose, recordSearch]);

  const isSearching = searchTerm.length >= 2;

  // Client-built structured filter (free, no-LLM lane) from the type chip + term.
  const structuredIntent = structuredActive
    ? { entityTypes: [searchScope], keyword: searchTerm, sort: 'recent' }
    : null;
  // Context for the NL parse (viewer's LOCAL date + coords).
  const nowDate = new Date();
  const searchContext = {
    today: `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`,
    lat: hasCoords && userLat != null ? userLat : undefined,
    lon: hasCoords && userLon != null ? userLon : undefined,
  };

  // Run a full NL search (the only path that calls the LLM). Records the query.
  const runNlSearch = (text?: string) => {
    const q = (text ?? searchTerm).trim();
    if (q.length < 2) return;
    // NL (AI) path is signed-in only — prompt login for guests. Type chips +
    // instant panel stay open to everyone (no LLM).
    if (!user?.id) { requireAuth(); return; }
    setSearchScope(null);
    setFocusedUser(null);
    setActiveIntent(null);
    setSearchTerm(q);
    setNlQuery(q);
    if (user?.id) {
      try { updateUserRecentSearches({ payload: { recentSearch: { type: 'query', data: { query: q } } } }); } catch {}
    }
  };

  // Content-type chip (single-select) → free structured search lane.
  const toggleScope = (key: string) => {
    setNlQuery('');
    setFocusedUser(null);
    setActiveIntent(null);
    setSearchScope((prev) => (prev === key ? null : key));
  };

  // Open the in-search focused-profile view for a tapped account (+ record it).
  const focusAccount = (acct: any) => {
    if (acct?.id) recordSearch('user', acct.id);
    setFocusedUser(acct);
  };

  // "Try searching" suggestion: structured (types+term) → free lane; else NL.
  const applySuggestion = (s: any) => {
    if (s.types?.length && s.term) {
      setNlQuery('');
      setFocusedUser(null);
      setActiveIntent(null);
      setSearchScope(s.types[0]);
      setSearchTerm(s.term);
      searchInputRef.current?.setNativeProps({ text: s.term });
    } else {
      runNlSearch(s.label);
    }
  };

  // Empty-state suggestions (mirrors web's no-recents / logged-out search):
  //   People → recent users via the `suggest` param on /map/search.
  //   Breaks → a shuffled slice of the catalog (the backend `suggest` is
  //            users-only, so breaks use getSurfBreaks rather than location).
  // Only when the input is focused, there's no query, and no recents to show.
  const wantSuggestions = searchVisible && searchFocused && !isSearching && filteredRecents.length === 0;
  const { data: suggestPeopleData } = useGetMapSearchContentQuery(
    { search: '', type: 'user', suggest: 10, viewerId: user?.id },
    { skip: !wantSuggestions || (isAuthenticated && !user?.id) }
  );
  const { data: suggestBreaksData } = useGetSurfBreaksQuery(
    { limit: 24 },
    { skip: !wantSuggestions }
  );
  const suggestedItems = useMemo(() => {
    const people = (suggestPeopleData?.results?.searchContent ?? []).slice(0, 5);
    const breaks = [...(suggestBreaksData?.results?.breaks ?? [])];
    for (let i = breaks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [breaks[i], breaks[j]] = [breaks[j], breaks[i]];
    }
    return [...people, ...breaks.slice(0, 5)];
  }, [suggestPeopleData, suggestBreaksData]);

  // "Try searching" chips (DB-backed; fallback to defaults) + recent NL queries.
  const { data: suggestionsData } = useGetSearchSuggestionsQuery();
  const trySuggestions = suggestionsData?.results?.suggestions?.length
    ? suggestionsData.results.suggestions
    : DEFAULT_SUGGESTIONS;
  const recentQueries = ((user as any)?.recentQueries ?? [])
    .map((r: any) => r?.query)
    .filter(Boolean);

  // ---- Search overlay ----
  if (searchVisible) {
    return (
      <View style={[styles.flex, { backgroundColor: isDark ? '#000000' : '#ffffff', paddingTop: topInset }]}>
        {/* Header */}
        <View style={styles.searchHeader}>
          <Text style={[styles.searchTitle, { color: isDark ? '#ffffff' : '#111827' }]}>Discover</Text>
          <Pressable onPress={closeSearch} hitSlop={8}>
            <Ionicons name="close" size={24} color={isDark ? '#e5e7eb' : '#374151'} />
          </Pressable>
        </View>

        {/* Search input (+ Cancel → back to the Explore grid once in search mode) */}
        <View style={styles.searchRow}>
          <View style={[styles.searchInputWrap, { flex: 1, marginHorizontal: 0, marginBottom: 0, backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            <Ionicons name="search-outline" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
            <TextInput
              ref={searchInputRef}
              placeholder="Search anything — breaks, films, brands…"
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
              onChangeText={handleSearchInput}
              onFocus={() => setSearchFocused(true)}
              onSubmitEditing={(e) => runNlSearch(e.nativeEvent.text)}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.searchInput, { color: isDark ? '#ffffff' : '#111827' }]}
            />
          </View>
          {(searchFocused || isSearching) && (
            <Pressable onPress={exitSearchMode} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          )}
        </View>

        {/* Content-type chips — pick one to run a FREE structured search; leave
            blank and press search to describe what you want (AI). Hidden while a
            focused profile is open. */}
        {(searchFocused || isSearching) && !focusedUser && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagsWrap}
            style={{ flexGrow: 0 }}
          >
            {SEARCH_TYPE_CHIPS.map((c) => {
              const active = searchScope === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => toggleScope(c.key)}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor: active ? '#0ea5e9' : 'transparent',
                      borderColor: active ? '#0ea5e9' : (isDark ? '#374151' : '#e5e7eb'),
                    },
                  ]}
                >
                  <Text style={[
                    styles.tagText,
                    { color: active ? '#ffffff' : (isDark ? '#9ca3af' : '#4b5563') },
                    active && { fontWeight: '500' },
                  ]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Body: focused profile → structured results → NL results → instant
            panel → browsable Explore grid. */}
        {focusedUser ? (
          <ProfileRails user={focusedUser} onBack={() => setFocusedUser(null)} onNavigate={navigateAndClose} />
        ) : structuredActive ? (
          <SearchResultsGrid intent={structuredIntent} onNavigate={navigateAndClose} onAccountSelect={focusAccount} />
        ) : nlQuery ? (
          <SearchResultsGrid query={nlQuery} context={searchContext} onNavigate={navigateAndClose} onAccountSelect={focusAccount} onIntent={setActiveIntent} />
        ) : isSearching || searchFocused ? (
        <ScrollView
          style={styles.flex}
          // flexGrow:1 makes the content fill the viewport even when suggestions
          // are short, so a tap on the empty area (with persistTaps="handled")
          // dismisses the keyboard — otherwise on-drag never fires without
          // scrollable overflow and the keyboard gets stuck open.
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {isSearching ? (
            /* ---- Active search results ---- */
            <View style={styles.resultsWrap}>
              {/* Run the full natural-language search for the typed phrase. */}
              <Pressable
                onPress={() => runNlSearch(searchTerm)}
                style={[styles.nlCta, { borderColor: isDark ? '#0ea5e955' : '#bae6fd', backgroundColor: isDark ? '#0ea5e91a' : '#f0f9ff' }]}
              >
                <Ionicons name="search" size={16} color="#0ea5e9" />
                <Text style={styles.nlCtaText} numberOfLines={1}>Search the vault for “{searchTerm}”</Text>
                <Text style={styles.nlCtaHint}>Go</Text>
              </Pressable>
              {searchLoading ? (
                <View style={styles.centered}><ActivityIndicator /></View>
              ) : searchContent.length > 0 ? (
                searchContent.map((item: any) => {
                  // User result → open the focused profile view in search
                  if (item.handle) {
                    const userType = item.user_type;
                    return (
                      <Pressable key={item.id ?? item.handle} onPress={() => focusAccount(item)} style={styles.resultRow}>
                        <UserAvatar uri={item.picture} name={item.name ?? item.handle} size={40} verified={item.verified} userType={userType} />
                        <View style={styles.resultInfo}>
                          <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                            {item.name ?? item.handle}
                          </Text>
                          <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280', marginTop: 1 }]} numberOfLines={1}>
                            @{item.handle}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  }
                  // Surf break result
                  return (
                    <Pressable key={item.id} onPress={() => navigateToBreak(item)} style={styles.resultRow}>
                      <View style={[styles.resultIcon, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                        <Ionicons name="location-outline" size={20} color={isDark ? '#9ca3af' : '#6b7280'} />
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                          {item.name}
                        </Text>
                        <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                          {item.region ? `${item.region.replaceAll('_', ' ')} · ` : ''}{item.country_code ?? ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={[styles.emptyText, { color: '#9ca3af' }]}>
                  No breaks or people match — tap above to search everything.
                </Text>
              )}
            </View>
          ) : (
            <>
              {/* ---- Recent NL searches (re-runnable query chips) ---- */}
              {recentQueries.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>
                    Recent searches
                  </Text>
                  <View style={styles.chipsWrap}>
                    {recentQueries.map((q: string) => (
                      <Pressable
                        key={q}
                        onPress={() => runNlSearch(q)}
                        style={[styles.queryChip, { borderColor: isDark ? '#374151' : '#e5e7eb' }]}
                      >
                        <Ionicons name="time-outline" size={12} color={isDark ? '#9ca3af' : '#9ca3af'} />
                        <Text style={[styles.queryChipText, { color: isDark ? '#d1d5db' : '#4b5563' }]} numberOfLines={1}>{q}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* ---- "Try searching" suggestions ---- */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>
                  Try searching
                </Text>
                <View style={styles.chipsWrap}>
                  {trySuggestions.map((s: any) => (
                    <Pressable
                      key={s.label}
                      onPress={() => applySuggestion(s)}
                      style={[styles.queryChip, { borderColor: isDark ? '#374151' : '#e5e7eb' }]}
                    >
                      <Text style={[styles.queryChipText, { color: isDark ? '#d1d5db' : '#4b5563' }]}>{s.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* ---- Recently viewed (entity quick-jump) ---- */}
              {filteredRecents.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>
                    Recently viewed
                  </Text>
                  {filteredRecents.map((recent: any, idx: number) => {
                    const item = recent.itemType === 'surf_break' ? recent.surfBreak : recent.user;
                    if (!item) return null;

                    if (recent.itemType === 'user' && item.handle) {
                      return (
                        <Pressable key={item.id ?? idx} onPress={() => focusAccount(item)} style={styles.resultRow}>
                          <UserAvatar uri={item.picture} name={item.name ?? item.handle} size={36} />
                          <View style={styles.resultInfo}>
                            <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                              {item.name ?? item.handle}
                            </Text>
                            <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280', marginTop: 1 }]} numberOfLines={1}>
                              @{item.handle}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    }

                    return (
                      <Pressable key={item.id ?? idx} onPress={() => navigateToBreak(item)} style={styles.resultRow}>
                        <View style={[styles.resultIcon, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                          <Ionicons name="location-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                        </View>
                        <View style={styles.resultInfo}>
                          <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                            {item.name}
                          </Text>
                          <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                            {item.region ? `${item.region.replaceAll('_', ' ')} · ` : ''}{item.country_code ?? ''}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* No recents → suggested list (mirrors web), else a prompt */}
              {filteredRecents.length === 0 && (
                suggestedItems.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>
                      Suggested
                    </Text>
                    {suggestedItems.map((item: any) =>
                      item.handle ? (
                        <Pressable key={item.id ?? item.handle} onPress={() => focusAccount(item)} style={styles.resultRow}>
                          <UserAvatar uri={item.picture} name={item.name ?? item.handle} size={40} verified={item.verified} userType={item.user_type} />
                          <View style={styles.resultInfo}>
                            <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                              {item.name ?? item.handle}
                            </Text>
                            <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280', marginTop: 1 }]} numberOfLines={1}>
                              @{item.handle}
                            </Text>
                          </View>
                        </Pressable>
                      ) : (
                        <Pressable key={item.id} onPress={() => navigateToBreak(item)} style={styles.resultRow}>
                          <View style={[styles.resultIcon, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                            <Ionicons name="location-outline" size={20} color={isDark ? '#9ca3af' : '#6b7280'} />
                          </View>
                          <View style={styles.resultInfo}>
                            <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>{item.name}</Text>
                            <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                              {item.region ? `${String(item.region).replaceAll('_', ' ')} · ` : ''}{item.country_code ?? ''}
                            </Text>
                          </View>
                        </Pressable>
                      )
                    )}
                  </View>
                ) : (
                  <View style={styles.centered}>
                    <Text style={{ color: '#9ca3af', fontSize: 14 }}>
                      Search breaks, films, people and brands
                    </Text>
                  </View>
                )
              )}
            </>
          )}
        </ScrollView>
        ) : (
          <View style={styles.flex}>
            {/* Quick filter pills below the search bar — New / Recent / Popular
                re-sort the session grid; Boards swaps in the shaper-board grid.
                Persistent above the scrolling content. Horizontally scrollable so
                the row never crowds/clips as pills are added. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.exploreSortScroll}
              contentContainerStyle={styles.exploreSortRow}
            >
              {EXPLORE_TABS.map((tab) => {
                const active = exploreTab === tab.value;
                return (
                  <Pressable
                    key={tab.value}
                    onPress={() => setExploreTab(tab.value)}
                    style={[
                      styles.exploreSortChip,
                      {
                        backgroundColor: active ? '#0ea5e9' : 'transparent',
                        borderColor: active ? '#0ea5e9' : isDark ? '#374151' : '#e5e7eb',
                      },
                    ]}
                  >
                    {tab.value === 'boards' ? (
                      <BoardIcon
                        size={15}
                        color={active ? '#ffffff' : isDark ? '#9ca3af' : '#6b7280'}
                        style={{ marginRight: 4 }}
                      />
                    ) : tab.icon ? (
                      <Ionicons
                        name={tab.icon as any}
                        size={13}
                        color={active ? '#ffffff' : isDark ? '#9ca3af' : '#6b7280'}
                        style={{ marginRight: 4 }}
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.exploreSortText,
                        { color: active ? '#ffffff' : isDark ? '#9ca3af' : '#4b5563' },
                        active && { fontWeight: '600' },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {exploreTab === 'boards' ? (
              <BoardsExploreGrid onNavigate={navigateKeepExplore} />
            ) : exploreTab === 'films' ? (
              <FilmsExploreGrid onNavigate={navigateKeepExplore} />
            ) : exploreTab === 'onThisDay' ? (
              <ExploreGrid
                onNavigate={navigateKeepExplore}
                month={new Date().getMonth() + 1}
                day={new Date().getDate()}
              />
            ) : (
              <ExploreGrid onNavigate={navigateKeepExplore} sort={exploreTab} />
            )}
          </View>
        )}
      </View>
    );
  }

  // ---- Location picker overlay (SurfVault "Set location") ----
  if (locationPickerVisible) {
    return (
      <View style={[styles.flex, { backgroundColor: isDark ? '#000000' : '#ffffff', paddingTop: topInset }]}>
        <View style={styles.searchHeader}>
          <Text style={[styles.searchTitle, { color: isDark ? '#ffffff' : '#111827' }]}>Set location</Text>
          <Pressable onPress={closeLocationPicker} hitSlop={8}>
            <Ionicons name="close" size={24} color={isDark ? '#e5e7eb' : '#374151'} />
          </Pressable>
        </View>

        <Text style={[styles.locationHint, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
          Pick a surf break to see the sessions, photographers and shapers near it.
        </Text>

        <View style={[styles.searchInputWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <Ionicons name="search-outline" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
          <TextInput
            ref={locationInputRef}
            placeholder="Search surf breaks..."
            placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            onChangeText={handleLocationSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: isDark ? '#ffffff' : '#111827' }]}
          />
        </View>

        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Drop the manual pin → back to GPS / home break */}
          {manualAnchor && (
            <Pressable onPress={clearManualAnchor} style={styles.resultRow}>
              <View style={[styles.resultIcon, { backgroundColor: isDark ? '#0c4a6e' : '#e0f2fe' }]}>
                <Ionicons name="navigate" size={18} color="#0ea5e9" />
              </View>
              <View style={styles.resultInfo}>
                <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>
                  Use my current location
                </Text>
                <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                  Back to your GPS or home break
                </Text>
              </View>
            </Pressable>
          )}

          {locationSearch.length < 2 ? (
            nearbyBreaks.length > 0 ? (
              <>
                <Text style={[styles.locationHint, { color: isDark ? '#6b7280' : '#9ca3af', marginTop: 4 }]}>
                  Nearby breaks
                </Text>
                {(nearbyBreaks as any[]).map((b: any) => (
                  <Pressable key={b.id} onPress={() => pickAnchorBreak(b)} style={styles.resultRow}>
                    <View style={[styles.resultIcon, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                      <Ionicons name="location-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                    </View>
                    <View style={styles.resultInfo}>
                      <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>{b.name}</Text>
                      <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                        {b.region ? `${String(b.region).replaceAll('_', ' ')} · ` : ''}{b.country_code ?? ''}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </>
            ) : (
              <View style={styles.centered}>
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>Search for a surf break</Text>
              </View>
            )
          ) : locationLoading ? (
            <View style={styles.centered}><ActivityIndicator /></View>
          ) : locationResults.length > 0 ? (
            locationResults.map((b: any) => (
              <Pressable key={b.id} onPress={() => pickAnchorBreak(b)} style={styles.resultRow}>
                <View style={[styles.resultIcon, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                  <Ionicons name="location-outline" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                </View>
                <View style={styles.resultInfo}>
                  <Text style={[styles.resultName, { color: isDark ? '#fff' : '#111827' }]}>{b.name}</Text>
                  <Text style={[styles.resultSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                    {b.region ? `${String(b.region).replaceAll('_', ' ')} · ` : ''}{b.country_code ?? ''}
                  </Text>
                </View>
              </Pressable>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: '#9ca3af' }]}>No surf breaks found</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ---- Main feed ----
  // Show skeleton whenever the current feed has no data yet — covers initial load
  // and feed-switching (currentData becomes undefined during arg change).
  // (SurfVault has its own dedicated rails layout below, so it's excluded here.)
  const showSkeleton =
    (feedType !== 'boardroom' && feedType !== 'surfvault' && sessions.length === 0 && !sessionsCurrentData) ||
    probeLoading;

  // SurfVault rail data. `sessions` already holds break+date groups (grouped
  // feed), scoped to nearby breaks via the session query's surfBreakIds.
  const nearbySessions = sessions.slice(0, 12);
  const nearbyShapers = (surfvaultShapersData?.results?.shapers ?? []).slice(0, 12);
  const nearbyBusinessAds = (adsData?.results?.ads ?? []).slice(0, 12);
  const surfvaultLoading = isSurfVault && hasNearbyAnchor && nearbyBreaks.length === 0 && !nearbyBreaksData;

  // Per-section loading flags — a section's query is in flight (no response
  // yet) and not skipped. Lets each rail show a skeleton instead of just being
  // absent while the breaks (which return first) are already on screen.
  const photographersSkipped = isAuthenticated && !user?.id;
  const sessionsLoading = nearbyBreakIds.length > 0 && !sessionsCurrentData;
  const photographersLoading = hasNearbyAnchor && !photographersSkipped && !nearbyPhotographersData;
  const shapersLoading = !!anchorBreakId && !surfvaultShapersData;
  const businessLoading = !adsData;

  return (
    <View className="flex-1 bg-white dark:bg-black" style={{ paddingTop: topInset }}>
      <View style={styles.header}>
        {feedType === 'boardroom' ? (
          // Drill-down header: back to SurfVault + "Boardroom" title (Boardroom
          // is reached via the Nearby Shapers "See all", not the picker).
          <Pressable onPress={() => handleFeedChange('surfvault')} style={styles.headerLeft} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={isDark ? '#ffffff' : '#000000'} />
            {/* Title + location stacked normally (no logo to center against, so
                the SurfVault absolute-caption trick isn't needed here). */}
            <View style={{ marginLeft: 2 }}>
              <Text style={[styles.feedTriggerText, { color: isDark ? '#ffffff' : '#000000' }]}>Boardroom</Text>
              {anchorName ? (
                <Text
                  style={[styles.boardroomCaption, { color: isDark ? '#9ca3af' : '#6b7280' }]}
                  numberOfLines={1}
                >
                  {anchorName}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ) : (
        <View style={styles.headerLeft}>
          <Image
            source={isDark ? require('../../assets/surfvault-logo-dark.png') : require('../../assets/surfvault-logo.png')}
            style={styles.headerLogo}
            contentFit="contain"
          />
          <MenuView
            shouldOpenOnLongPress={false}
            actions={feedMenuActions as any}
            onPressAction={({ nativeEvent }) => {
              handleFeedChange(nativeEvent.event as FeedType);
            }}
          >
            <View style={styles.feedTrigger}>
              <Text style={[styles.feedTriggerText, { color: isDark ? '#ffffff' : '#000000' }]}>
                {currentFeed.label}
              </Text>
              <Ionicons
                name="chevron-down"
                size={14}
                color={isDark ? '#9ca3af' : '#6b7280'}
                style={styles.feedTriggerCaret}
              />
              {/* Caption is absolutely positioned so it hangs below without
                  affecting the row height — keeps the label vertically
                  centered with the logo + search icon across all feed types. */}
              {feedType === 'surfvault' && anchorName ? (
                // Fades in as the location bar scrolls out of view.
                <Animated.Text
                  style={[styles.feedTriggerCaption, { color: isDark ? '#9ca3af' : '#6b7280', opacity: headerCaptionOpacity }]}
                  numberOfLines={1}
                >
                  {anchorName}
                </Animated.Text>
              ) : null}
            </View>
          </MenuView>
        </View>
        )}
        {feedType !== 'boardroom' && (
          <Pressable onPress={openSearch} hitSlop={8}>
            <Ionicons name="search-outline" size={24} color={isDark ? '#e5e7eb' : '#374151'} />
          </Pressable>
        )}
      </View>

      {feedType === 'surfvault' ? (
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          onScroll={onSurfScroll}
          scrollEventThrottle={16}
          onLayout={(e) => { surfViewportH.current = e.nativeEvent.layout.height; recomputeRailsInView(surfScrollYNum.current); }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          {/* Location bar — pin/change the nearby anchor (mirrors web "Set location") */}
          <Pressable
            onPress={openLocationPicker}
            style={[
              styles.locationBar,
              { backgroundColor: isDark ? '#0c1620' : '#f0f9ff', borderColor: isDark ? '#155e75' : '#bae6fd' },
            ]}
          >
            <Ionicons name="location" size={16} color="#0ea5e9" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.locationBarLabel, { color: isDark ? '#7dd3fc' : '#0369a1' }]}>
                {manualAnchor ? 'PINNED LOCATION' : 'NEAR YOU'}
              </Text>
              <Text style={[styles.locationBarName, { color: isDark ? '#ffffff' : '#0c4a6e' }]} numberOfLines={1}>
                {anchorName ?? 'Set a location'}
              </Text>
            </View>
            <Text style={[styles.locationBarChange, { color: '#0ea5e9' }]}>Change</Text>
          </Pressable>

          {/* On This Day — sessions + films shot on today's date in past years.
              Nearby-scoped when a location is set, else a global teaser. Sits
              above everything (incl. the set-location prompt) so the feed always
              links back into the archive. "See all" opens the global Explore On
              This Day pill. Renders ONLY once there's content — no loading
              skeleton — because on most days a location-scoped archive has nothing
              for today, and a skeleton that flashes then vanishes reads worse than
              a quiet pop-in when there IS something. */}
          {onThisDayItems.length > 0 ? (
            <View style={styles.railSection}>
              <Pressable
                onPress={() => { setExploreTab('onThisDay'); setSearchVisible(true); }}
                style={[styles.railHeader, styles.railHeaderRow]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>On This Day</Text>
                  <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                    Shot on today&apos;s date in past years{otdNearby ? ' near here' : ''}.
                  </Text>
                </View>
                <Text style={{ color: '#0ea5e9', fontWeight: '600', fontSize: 13 }}>See all</Text>
              </Pressable>
              <FlatList
                data={onThisDayItems}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
                keyExtractor={(it: any) => it.key}
                renderItem={({ item }: any) =>
                  item.kind === 'film'
                    ? <FilmTile film={item.film} showCredit showDate />
                    : <SessionTile group={item.group} />
                }
              />
            </View>
          ) : null}

          {!hasNearbyAnchor ? (
            // No anchor yet (GPS denied / still resolving + no home break).
            <View style={[styles.emptyStateWrap, { paddingVertical: 64 }]}>
              <View style={[styles.boardroomIconWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                <Ionicons name="location-outline" size={36} color={isDark ? '#9ca3af' : '#6b7280'} />
              </View>
              <Text style={[styles.boardroomTitle, { color: isDark ? '#ffffff' : '#111827' }]}>Set your location</Text>
              <Text style={[styles.boardroomBody, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                Pin a surf break to see the sessions, photographers and shapers near it.
              </Text>
              <Pressable onPress={openLocationPicker} style={[styles.emptyCta, { backgroundColor: '#0ea5e9' }]}>
                <Ionicons name="location" size={16} color="#ffffff" />
                <Text style={styles.emptyCtaText}>Set location</Text>
              </Pressable>
            </View>
          ) : surfvaultLoading ? (
            <HomeSkeleton showNearby />
          ) : (
            <>
              {/* Nearby Surf Breaks */}
              {nearbyBreaks.length > 0 && (
                <View style={styles.railSection}>
                  <View style={[styles.railHeader, styles.railHeaderRow]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>Nearby Surf Breaks</Text>
                      <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                        Surf breaks within {formatDistance(nearbyPrefs.breaksKm, units)} of here
                      </Text>
                    </View>
                    {user?.id ? (
                      <RadiusMenu
                        presets={BREAK_RADIUS_PRESETS[units] ?? BREAK_RADIUS_PRESETS.mi}
                        units={units}
                        valueKm={nearbyPrefs.breaksKm}
                        onChange={(km) => setNearbyRadius('breaksKm', km)}
                      />
                    ) : null}
                  </View>
                  <FlatList
                    data={nearbyBreaks}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.railContent}
                    keyExtractor={(item: any) => item.id}
                    renderItem={({ item }) => <SurfBreakCard surfBreak={item} compact />}
                  />
                </View>
              )}

              {/* Nearby Sessions */}
              {nearbySessions.length > 0 ? (
                <View style={styles.railSection} onLayout={onRailLayout('sessions')}>
                  <View style={styles.railHeader}>
                    <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>Nearby Sessions</Text>
                    <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      The latest sessions shot at breaks near here.
                    </Text>
                  </View>
                  <FlatList
                    data={nearbySessions}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.railContent}
                    keyExtractor={(g: any) => `${g.session_date}|${g.group_key}`}
                    extraData={sessionRailViewable}
                    onViewableItemsChanged={onSessionRailViewable}
                    viewabilityConfig={railViewConfig}
                    renderItem={({ item }) => (
                      <SessionTile
                        group={item}
                        isViewable={feedFocused && railsInView.sessions !== false && sessionRailViewable.has(`${item.session_date}|${item.group_key}`)}
                      />
                    )}
                  />
                </View>
              ) : sessionsLoading ? (
                <RailSkeleton title="Nearby Sessions" subtitle="The latest sessions shot at breaks near here." />
              ) : null}

              {/* Nearby Photographers */}
              {nearbyPhotographers.length > 0 ? (
                <View style={styles.railSection}>
                  <View style={[styles.railHeader, styles.railHeaderRow]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>Nearby Photographers</Text>
                      <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                        Photographers within {formatDistance(nearbyPrefs.photographersKm, units)} of here
                      </Text>
                    </View>
                    {user?.id ? (
                      <RadiusMenu
                        presets={PHOTOG_RADIUS_PRESETS[units] ?? PHOTOG_RADIUS_PRESETS.mi}
                        units={units}
                        valueKm={nearbyPrefs.photographersKm}
                        onChange={(km) => setNearbyRadius('photographersKm', km)}
                      />
                    ) : null}
                  </View>
                  <FlatList
                    data={nearbyPhotographers}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.railContent, { gap: 16 }]}
                    keyExtractor={(item: any) => item.id ?? item.handle}
                    renderItem={({ item }) => {
                      const noteActive =
                        !!item.status_note &&
                        Date.now() - new Date(item.status_note_set_at).getTime() < 7 * 24 * 60 * 60 * 1000;
                      const stops = item.active ? ACTIVE_STOPS : noteActive ? NOTE_STOPS : null;
                      const AVATAR = 64;
                      const RING_TOTAL = AVATAR + (3 + 2) * 2;
                      return (
                        <Pressable
                          onPress={() => trackedPush(`/user/${item.handle}` as any)}
                          style={{ alignItems: 'center', width: 80 }}
                        >
                          <View style={{ width: RING_TOTAL, height: RING_TOTAL, alignItems: 'center', justifyContent: 'center' }}>
                            {stops && <GradientRing size={RING_TOTAL} strokeWidth={3} stops={stops} />}
                            <UserAvatar
                              uri={item.picture}
                              name={item.name ?? item.handle}
                              size={AVATAR}
                              // `active` drives the ACTIVE pill + badge-hide;
                              // `noRing` suppresses UserAvatar's own border so
                              // the GradientRing stays the only ring (no doubled
                              // green border).
                              active={!!item.active}
                              noRing
                              // Drop the pill onto the GradientRing's bottom
                              // edge (it sits ~5px outside the borderless avatar).
                              activeBadgeOffset={5}
                              verified={!!item.verified}
                              userType={item.verified ? (item.user_type ?? 'photographer') : undefined}
                            />
                          </View>
                          <Text
                            style={[styles.photographerHandle, { color: isDark ? '#fff' : '#111827' }]}
                            numberOfLines={1}
                          >
                            @{item.handle}
                          </Text>
                        </Pressable>
                      );
                    }}
                  />
                </View>
              ) : photographersLoading ? (
                <RailSkeleton title="Nearby Photographers" variant="avatar" />
              ) : null}

              {/* Nearby Shapers */}
              {nearbyShapers.length > 0 ? (
                <View style={styles.railSection} onLayout={onRailLayout('shapers')}>
                  <View style={[styles.railHeader, styles.railHeaderRow]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>Nearby Shapers</Text>
                      <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                        Tap a shaper to browse their boards.
                      </Text>
                    </View>
                    {/* Boardroom drill-down — the full shaper feed. */}
                    <Pressable onPress={() => handleFeedChange('boardroom')} hitSlop={8} style={{ paddingLeft: 12 }}>
                      <Text style={styles.seeAll}>See all ›</Text>
                    </Pressable>
                  </View>
                  <FlatList
                    data={nearbyShapers}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.railContent}
                    keyExtractor={(s: any) => s.id ?? s.handle}
                    extraData={shaperRailViewable}
                    onViewableItemsChanged={onShaperRailViewable}
                    viewabilityConfig={railViewConfig}
                    renderItem={({ item }) => (
                      <ShaperTile
                        shaper={item}
                        isViewable={feedFocused && railsInView.shapers !== false && shaperRailViewable.has(item.id ?? item.handle)}
                      />
                    )}
                  />
                </View>
              ) : shapersLoading ? (
                <RailSkeleton title="Nearby Shapers" subtitle="Tap a shaper to browse their boards." />
              ) : null}

              {/* Nearby Surf Films — always shown so there's always an entry to
                  add a film. With films: an "Add" button sits opposite the title.
                  Empty: a single add-a-film placeholder tile fills the rail. */}
              <View style={styles.railSection}>
                <View style={[styles.railHeader, styles.filmsHeaderRow]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>Nearby Surf Films</Text>
                    <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      {anchorRegionLabel ? `in ${anchorRegionLabel}` : 'Surf films from around your area.'}
                    </Text>
                  </View>
                  {nearbyFilms.length > 0 && (
                    <Pressable onPress={handleAddFilm} hitSlop={8} style={styles.addFilmBtn}>
                      <Ionicons name="add" size={16} color="#0ea5e9" />
                      <Text style={styles.addFilmBtnText}>Add</Text>
                    </Pressable>
                  )}
                </View>
                {nearbyFilms.length > 0 ? (
                  <FlatList
                    data={nearbyFilms}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.railContent}
                    keyExtractor={(f: any) => f.id}
                    renderItem={({ item }) => <FilmTile film={item} showCredit showDate />}
                  />
                ) : (
                  <View style={styles.railContent}>
                    <Pressable
                      onPress={handleAddFilm}
                      style={[styles.addFilmTile, { borderColor: isDark ? '#1f2937' : '#cbd5e1' }]}
                    >
                      <View style={styles.addFilmTileIcon}>
                        <Ionicons name="add" size={26} color="#0ea5e9" />
                      </View>
                      <Text style={[styles.addFilmTileText, { color: isDark ? '#fff' : '#111827' }]}>Add a film</Text>
                      <Text style={[styles.addFilmTileSub, { color: isDark ? '#9ca3af' : '#6b7280' }]} numberOfLines={2}>
                        Catalogue a YouTube edit from around here
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {/* Nearby Business */}
              {nearbyBusinessAds.length > 0 ? (
                <View style={styles.railSection} onLayout={onRailLayout('business')}>
                  <View style={styles.railHeader}>
                    <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>Nearby Business</Text>
                    <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      Businesses near you that support the surf community.
                    </Text>
                  </View>
                  <FlatList
                    data={nearbyBusinessAds}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.railContent}
                    keyExtractor={(a: any) => a.id}
                    extraData={adRailViewable}
                    onViewableItemsChanged={onAdRailViewable}
                    viewabilityConfig={railViewConfig}
                    renderItem={({ item }) => (
                      <BusinessTile
                        ad={item}
                        surfBreakId={anchorBreakId}
                        isViewable={feedFocused && railsInView.business !== false && adRailViewable.has(item.id)}
                      />
                    )}
                  />
                </View>
              ) : businessLoading ? (
                <RailSkeleton title="Nearby Business" subtitle="Businesses near you that support the surf community." />
              ) : null}

              {/* Anchor set, but nothing within range — only once everything settled */}
              {nearbyBreaks.length === 0 &&
                nearbySessions.length === 0 &&
                nearbyPhotographers.length === 0 &&
                nearbyShapers.length === 0 &&
                nearbyFilms.length === 0 &&
                nearbyBusinessAds.length === 0 &&
                !sessionsLoading &&
                !photographersLoading &&
                !shapersLoading &&
                !businessLoading && (
                  <View style={[styles.emptyStateWrap, { paddingVertical: 64 }]}>
                    <View style={[styles.boardroomIconWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                      <Ionicons name="search-outline" size={36} color={isDark ? '#9ca3af' : '#6b7280'} />
                    </View>
                    <Text style={[styles.boardroomTitle, { color: isDark ? '#ffffff' : '#111827' }]}>Nothing nearby yet</Text>
                    <Text style={[styles.boardroomBody, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      We couldn’t find anything around here. Try pinning a different spot.
                    </Text>
                    <Pressable onPress={openLocationPicker} style={[styles.emptyCta, { backgroundColor: '#0ea5e9' }]}>
                      <Ionicons name="location" size={16} color="#ffffff" />
                      <Text style={styles.emptyCtaText}>Change location</Text>
                    </Pressable>
                  </View>
                )}
            </>
          )}
        </Animated.ScrollView>
      ) : feedType === 'boardroom' ? (
        <BoardroomFeed ref={boardroomRef} isDark={isDark} anchorBreakId={anchorBreakId} />
      ) : feedType === 'favorites' ? (
        // Favorites renders as per-break RAILS (ordered by the user's favorites
        // order), not the chronological feed — see FavoritesRails. It fetches
        // its own favorites + grouped sessions.
        <FavoritesRails isDark={isDark} />
      ) : showSkeleton ? <HomeSkeleton showNearby={false} /> : (
      <FlatList
        ref={feedListRef}
          data={feedRows}
          keyExtractor={(row) => row.key}
          renderItem={({ item: row }) => {
            const viewable = feedFocused && (!hasViewabilityReport || viewableIds.has(row.key));
            if (row.type === 'ad') {
              // Mixed promo stream — first entry's _kind picks the renderer.
              // Each ad now occupies its own slot (Phase B per-ad carousels)
              // — the `row.data` group is always a 1-element array for ads.
              const first = row.data[0];
              if (first?._kind === 'shaper') {
                return <ShaperFeedCard shaper={first} isViewable={viewable} />;
              }
              return (
                <SponsoredCard
                  ad={first}
                  placement="content"
                  isViewable={viewable}
                />
              );
            }
            const item = row.data;
            // Grouped feed (Discover/Favorites): item is a BreakDateGroup
            // with a `group_key`. Following stays on per-session SessionCard.
            if (item?.group_key && Array.isArray(item?.sessions)) {
              return <BreakDateCard group={item as BreakDateGroup} isViewable={viewable} />;
            }
            return (
              <SessionCard
                session={item}
                isViewable={viewable}
                enableCarousel
                hideAspectRatioOption
                onPress={() => {
                  const sid = item.session_id ?? item.id;
                  if (sid) trackedPush(`/session/${sid}` as any);
                }}
              />
            );
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScroll={handleFeedScroll}
          onMomentumScrollEnd={handleFeedScroll}
          onScrollEndDrag={handleFeedScroll}
          scrollEventThrottle={16}
          // Initial scroll position; reference is frozen at mount via
          // useRef so re-renders don't reset the user's live scroll.
          contentOffset={initialContentOffset}
          contentContainerStyle={sessions.length === 0 ? { flexGrow: 1 } : undefined}
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyStateWrap}>
                <View style={[styles.boardroomIconWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                  <MaterialCommunityIcons
                    name={feedType === 'following' ? 'account-multiple-outline' : 'compass-outline'}
                    size={36}
                    color={isDark ? '#9ca3af' : '#6b7280'}
                  />
                </View>
                <Text style={[styles.boardroomTitle, { color: isDark ? '#ffffff' : '#111827' }]}>
                  {feedType === 'following'
                    ? followsAnyone
                      ? 'Nothing new yet'
                      : 'Not following anyone yet'
                    : 'No sessions yet'}
                </Text>
                <Text style={[styles.boardroomBody, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                  {feedType === 'following'
                    ? followsAnyone
                      ? 'No new sessions from people you follow yet. Check back soon.'
                      : 'Follow photographers and surfers to see their sessions here.'
                    : 'Check back later for new sessions in your area.'}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            isFetching && sessions.length > 0 ? (
              <View className="py-6"><ActivityIndicator /></View>
            ) : null
          }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
      />
      )}
      <CreateFilmSheet
        visible={createFilmVisible}
        onClose={() => setCreateFilmVisible(false)}
        defaultSurfBreakId={anchorBreakId}
        defaultBreakName={anchorName}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  searchTitle: { fontSize: 18, fontWeight: '700' },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#0ea5e9' },
  toggleWrap: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleText: { fontSize: 14 },
  toggleTextActive: { fontWeight: '600' },
  tagsWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    alignSelf: 'center',
  },
  tagText: { fontSize: 13 },
  // Horizontal pill scroller: flexGrow 0 so it hugs the pill height instead of
  // expanding into the flex:1 column below it.
  exploreSortScroll: { flexGrow: 0, flexShrink: 0 },
  exploreSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  exploreSortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  exploreSortText: { fontSize: 13 },
  resultsWrap: { paddingHorizontal: 16 },
  nlCta: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  nlCtaText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0ea5e9' },
  nlCtaHint: { fontSize: 12, fontWeight: '600', color: '#0ea5e999' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  queryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  queryChipText: { fontSize: 13, fontWeight: '500' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: { marginLeft: 12, flex: 1 },
  resultName: { fontSize: 15, fontWeight: '600' },
  resultSub: { fontSize: 13, marginTop: 1 },
  centered: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { textAlign: 'center', paddingVertical: 48 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 4,
    paddingRight: 16,
    paddingVertical: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 72,
    height: 72,
  },
  feedTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 2,
    position: 'relative',
  },
  feedTriggerText: {
    fontSize: 19,
    fontFamily: 'SurfVaultFont',
  },
  feedTriggerCaret: {
    marginLeft: 6,
  },
  feedTriggerCaption: {
    position: 'absolute',
    top: '100%',
    left: 0,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 1,
    maxWidth: 220,
  },
  // Boardroom caption — same look as feedTriggerCaption but in normal flow
  // (stacked under the title), not absolutely positioned.
  boardroomCaption: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 2,
    maxWidth: 220,
  },
  locationHint: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  locationBarLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  locationBarName: { fontSize: 15, fontWeight: '700', marginTop: 1 },
  locationBarChange: { fontSize: 13, fontWeight: '600', marginLeft: 8 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    marginTop: 20,
  },
  emptyCtaText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  emptyStateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 80,
  },
  boardroomIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  boardroomTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  boardroomBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 14,
    maxWidth: 280,
  },
  nearbyTitle: { fontSize: 18, fontWeight: '700' },
  nearbySubtitle: { fontSize: 13, marginTop: 2 },
  railSection: { marginBottom: 28 },
  railHeader: { paddingHorizontal: 16, marginBottom: 4 },
  filmsHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  addFilmBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 8 } as any,
  addFilmBtnText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },
  addFilmTile: {
    width: RAIL_TILE_WIDTH,
    height: Math.round((RAIL_TILE_WIDTH * 5) / 4),
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  addFilmTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(14,165,233,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  addFilmTileText: { fontSize: 14, fontWeight: '700' },
  addFilmTileSub: { fontSize: 11, textAlign: 'center', marginTop: 4 },
  railHeaderRow: { flexDirection: 'row', alignItems: 'flex-end' },
  seeAll: { fontSize: 13, fontWeight: '600', color: '#0ea5e9' },
  radiusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingBottom: 1,
  },
  radiusChipText: { fontSize: 13, fontWeight: '600', color: '#0ea5e9' },
  railContent: { paddingHorizontal: 16, paddingTop: 10 },
  photographerHandle: { fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  activeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
});
