import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  ScrollView,
  useColorScheme,
  StyleSheet,
  TextInput,
  Keyboard,
} from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { useTrackedPush } from '../../src/context/NavigationContext';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import {
  useGetLatestSessionsQuery,
  useGetNearbySurfBreaksQuery,
  useGetNearbyPhotographersQuery,
  useGetMapSearchContentQuery,
  useGetPopularTagsQuery,
  useGetAdsQuery,
  useGetLatestShapersQuery,
  useGetShapersFromFollowingQuery,
  useGetShapersForSurfBreakQuery,
  useGetSurfBreaksQuery,
  useUpdateUserRecentSearchesMutation,
} from '../../src/store';
import { useUser } from '../../src/context/UserProvider';
import { useUserPreferences, formatDistance } from '../../src/helpers/preferences';
import { useAuth } from '../../src/context/AuthProvider';
import { useTabBar } from '../../src/context/TabBarContext';
import SessionCard from '../../src/components/SessionCard';
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
  NearbySessionRailCard,
  NearbyShaperRailCard,
  NearbyBusinessRailCard,
} from '../../src/components/home/NearbyRail';
import ExploreGrid from '../../src/components/home/ExploreGrid';
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

// NOTE: 'discover' is intentionally NOT in the picker — worldwide latest
// sessions now live in the Explore grid (the Search screen's default state).
// The type is retained for the few internal `feedType === 'discover'` guards.
const FEED_OPTIONS: { value: FeedType; label: string; description: string; comingSoon?: boolean }[] = [
  { value: 'surfvault', label: 'SurfVault', description: 'Sessions, breaks & shapers near you' },
  { value: 'following', label: 'Following', description: 'Sessions from people you follow' },
  { value: 'favorites', label: 'Favorites', description: 'Sessions at your favorited breaks' },
  { value: 'boardroom', label: 'Boardroom', description: 'Custom surfboards near you' },
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

export default function HomeScreen() {
  const router = useRouter();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();
  const { units, nearby: nearbyPrefs } = useUserPreferences();
  const { isAuthenticated } = useAuth();
  const { setTabBarVisible } = useTabBar();
  const [updateUserRecentSearches] = useUpdateUserRecentSearchesMutation();

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
  const { data: nearbyBreaksData } = useGetNearbySurfBreaksQuery(
    { lat: nearbyLat ?? 0, long: nearbyLon ?? 0, radiusKm: nearbyPrefs.breaksKm },
    { skip: !hasNearbyAnchor || !isSurfVault }
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
      limit: 10,
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
        feedType === 'boardroom'
        || (isAuthenticated && !user?.id)
        || ((feedType === 'following' || feedType === 'favorites') && !user?.id)
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
    savedFeedType = next;
    setFeedType(next);
  }, [feedType, resetFeedAccumulator]);

  const feedMenuActions = useMemo(() => {
    return [
      {
        id: 'surfvault' as FeedType,
        title: 'SurfVault',
        subtitle: 'Near you',
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
      {
        id: 'boardroom' as FeedType,
        title: 'Boardroom',
        state: feedType === 'boardroom' ? ('on' as const) : undefined,
      },
    ];
  }, [feedType, user?.id]);

  // ---- Search overlay ----
  const [searchVisible, setSearchVisible] = useState(false);
  // Input focus drives whether the Breaks/People segments show. When the
  // overlay first opens (unfocused, empty) it shows the Explore grid instead.
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('surf_break');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
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
    if (feedType !== 'surfvault') {
      savedFeedType = 'surfvault';
      setFeedType('surfvault');
    }
    closeLocationPicker();
  }, [feedType, resetFeedAccumulator, closeLocationPicker]);

  // Drop the manual pin — fall back to the GPS / home-break chain.
  const clearManualAnchor = useCallback(() => {
    savedAnchor = null;
    setManualAnchor(null);
    resetFeedAccumulator();
    closeLocationPicker();
  }, [resetFeedAccumulator, closeLocationPicker]);

  // Nearby photographers — anchored on the same resolved nearby point as the
  // breaks query above (which lives higher up so sessions can scope to it).
  const { data: nearbyPhotographersData } = useGetNearbyPhotographersQuery(
    { lat: nearbyLat ?? 0, long: nearbyLon ?? 0, viewerId: user?.id, radiusKm: nearbyPrefs.photographersKm },
    { skip: !hasNearbyAnchor || !isSurfVault || (isAuthenticated && !user?.id) }
  );

  // Search — uses /map/search which returns { results: { searchContent: [...] } }
  // API accepts type: "all" | "surf_break" | "photographer" (legacy) | "user" (all users)
  const hasTagFilter = searchType === 'user' && selectedTags.length > 0;
  const { data: searchData, isFetching: searchLoading } = useGetMapSearchContentQuery(
    {
      search: searchTerm,
      type: searchType, // "surf_break" or "user" — "user" returns surfers + photographers
      tags: searchType === 'user' ? selectedTags : [],
      viewerId: user?.id,
    },
    { skip: (searchTerm.length < 2 && !hasTagFilter) || (isAuthenticated && !user?.id) }
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
  const { data: adsData } = useGetAdsQuery({
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
  // SurfVault "Nearby Shapers" — shapers tied to the anchor break's region (or
  // country fallback). This is genuinely location-scoped, so changing the pinned
  // location swaps the shaper set (or empties it). NOTE: deliberately NOT
  // getBoardroomShapers — that returns ALL shapers globally, just re-sorted by
  // distance, so the rail never visibly changed when the location moved.
  const { data: surfvaultShapersData } = useGetShapersForSurfBreakQuery(
    { breakId: anchorBreakId as string, limit: 20 },
    { skip: !isSurfVault || !anchorBreakId }
  );

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
  const filteredRecents = recentSearches.filter((r: any) => {
    if (searchType === 'surf_break') return r.itemType === 'surf_break';
    // "user" mode shows any recent person search (surfers + photographers).
    return r.itemType === 'user';
  });

  const handleSearchInput = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
  }, [setTabBarVisible]);

  // Leave search mode but stay in the overlay → back to the Explore grid.
  const exitSearchMode = useCallback(() => {
    Keyboard.dismiss();
    searchInputRef.current?.clear();
    searchInputRef.current?.blur();
    setSearchTerm('');
    setSelectedTags([]);
    setSearchFocused(false);
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

  const isSearching = searchTerm.length >= 2 || hasTagFilter;

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
              placeholder={searchType === 'user' ? 'Search people...' : 'Search surf breaks...'}
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
              onChangeText={handleSearchInput}
              onFocus={() => setSearchFocused(true)}
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

        {/* Breaks/People segments + tags — only once the user enters search mode
            (focus or an active query). Before that, the Explore grid shows. */}
        {(searchFocused || isSearching) && (
        <>
        {/* Type toggle */}
        <View style={[styles.toggleWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <Pressable
            onPress={() => { setSearchType('surf_break'); setSelectedTags([]); setSearchTerm(''); }}
            style={[
              styles.toggleBtn,
              searchType === 'surf_break' && {
                backgroundColor: isDark ? '#374151' : '#ffffff',
                shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
              },
            ]}
          >
            <Text style={[
              styles.toggleText,
              { color: searchType === 'surf_break' ? (isDark ? '#fff' : '#111827') : (isDark ? '#9ca3af' : '#6b7280') },
              searchType === 'surf_break' && styles.toggleTextActive,
            ]}>Breaks</Text>
          </Pressable>
          <Pressable
            onPress={() => { setSearchType('user'); setSearchTerm(''); }}
            style={[
              styles.toggleBtn,
              searchType === 'user' && {
                backgroundColor: isDark ? '#374151' : '#ffffff',
                shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
              },
            ]}
          >
            <Text style={[
              styles.toggleText,
              { color: searchType === 'user' ? (isDark ? '#fff' : '#111827') : (isDark ? '#9ca3af' : '#6b7280') },
              searchType === 'user' && styles.toggleTextActive,
            ]}>People</Text>
          </Pressable>
        </View>

        {/* Tags — people search only (naturally surfaces photographers since surfers have no tags) */}
        {searchType === 'user' && popularTags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagsWrap}
            style={{ flexGrow: 0 }}
          >
            {popularTags.map((tag: any) => {
              const tagName = tag.tag ?? tag;
              const isSelected = selectedTags.includes(tagName);
              return (
                <Pressable
                  key={tagName}
                  onPress={() => toggleTag(tagName)}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor: isSelected ? '#0ea5e9' : 'transparent',
                      borderColor: isSelected ? '#0ea5e9' : (isDark ? '#374151' : '#e5e7eb'),
                    },
                  ]}
                >
                  <Text style={[
                    styles.tagText,
                    { color: isSelected ? '#ffffff' : (isDark ? '#9ca3af' : '#4b5563') },
                    isSelected && { fontWeight: '500' },
                  ]}>{tagName}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        </>
        )}

        {/* Body: live search results / recents when in search mode; otherwise
            the browsable Explore grid (the old worldwide "Discover" feed). */}
        {isSearching || searchFocused ? (
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {isSearching ? (
            /* ---- Active search results ---- */
            <View style={styles.resultsWrap}>
              {searchLoading ? (
                <View style={styles.centered}><ActivityIndicator /></View>
              ) : searchContent.length > 0 ? (
                searchContent.map((item: any) => {
                  // User result
                  if (item.handle) {
                    const userType = item.user_type;
                    return (
                      <Pressable key={item.id ?? item.handle} onPress={() => navigateToUser(item)} style={styles.resultRow}>
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
                  No {searchType === 'user' ? 'people' : 'surf breaks'} found
                </Text>
              )}
            </View>
          ) : (
            <>
              {/* ---- Recent searches ---- */}
              {filteredRecents.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#111827' }]}>
                    Recent
                  </Text>
                  {filteredRecents.map((recent: any, idx: number) => {
                    const item = recent.itemType === 'surf_break' ? recent.surfBreak : recent.user;
                    if (!item) return null;

                    if (recent.itemType === 'user' && item.handle) {
                      return (
                        <Pressable key={item.id ?? idx} onPress={() => navigateToUser(item)} style={styles.resultRow}>
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

              {/* Empty state when no recents */}
              {filteredRecents.length === 0 && (
                <View style={styles.centered}>
                  <Text style={{ color: '#9ca3af', fontSize: 14 }}>
                    Search for {searchType === 'user' ? 'people' : 'surf breaks'}
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
        ) : (
          <ExploreGrid onNavigate={navigateAndClose} />
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
            <View style={styles.centered}>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>Search for a surf break</Text>
            </View>
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
    feedType !== 'boardroom' && feedType !== 'surfvault' && sessions.length === 0 && !sessionsCurrentData;

  // SurfVault rail data. `sessions` already holds break+date groups (grouped
  // feed), scoped to nearby breaks via the session query's surfBreakIds.
  const nearbySessions = sessions.slice(0, 12);
  const nearbyShapers = (surfvaultShapersData?.results?.shapers ?? []).slice(0, 12);
  const nearbyBusinessAds = (adsData?.results?.ads ?? []).slice(0, 12);
  const surfvaultLoading = isSurfVault && hasNearbyAnchor && nearbyBreaks.length === 0 && !nearbyBreaksData;

  return (
    <View className="flex-1 bg-white dark:bg-black" style={{ paddingTop: topInset }}>
      <View style={styles.header}>
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
              {feedType === 'boardroom' && typeof user?.surf_break_name === 'string' && user.surf_break_name ? (
                <Text
                  style={[styles.feedTriggerCaption, { color: isDark ? '#9ca3af' : '#6b7280' }]}
                  numberOfLines={1}
                >
                  {user.surf_break_name as string}
                </Text>
              ) : feedType === 'surfvault' && anchorName ? (
                <Text
                  style={[styles.feedTriggerCaption, { color: isDark ? '#9ca3af' : '#6b7280' }]}
                  numberOfLines={1}
                >
                  {anchorName}
                </Text>
              ) : null}
            </View>
          </MenuView>
        </View>
        <Pressable onPress={openSearch} hitSlop={8}>
          <Ionicons name="search-outline" size={24} color={isDark ? '#e5e7eb' : '#374151'} />
        </Pressable>
      </View>

      {feedType === 'surfvault' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
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
                  <View style={styles.railHeader}>
                    <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>Nearby Surf Breaks</Text>
                    <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      Surf breaks within {formatDistance(nearbyPrefs.breaksKm, units)} of here
                    </Text>
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
              {nearbySessions.length > 0 && (
                <View style={styles.railSection}>
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
                      <NearbySessionRailCard
                        group={item}
                        isViewable={feedFocused && sessionRailViewable.has(`${item.session_date}|${item.group_key}`)}
                      />
                    )}
                  />
                </View>
              )}

              {/* Nearby Photographers */}
              {nearbyPhotographers.length > 0 && (
                <View style={styles.railSection}>
                  <View style={styles.railHeader}>
                    <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>Nearby Photographers</Text>
                    <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      Photographers within {formatDistance(nearbyPrefs.photographersKm, units)} of here
                    </Text>
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
                              verified={item.verified}
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
              )}

              {/* Nearby Shapers */}
              {nearbyShapers.length > 0 && (
                <View style={styles.railSection}>
                  <View style={styles.railHeader}>
                    <Text style={[styles.nearbyTitle, { color: isDark ? '#fff' : '#111827' }]}>Nearby Shapers</Text>
                    <Text style={[styles.nearbySubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      Tap a shaper to browse their boards.
                    </Text>
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
                      <NearbyShaperRailCard
                        shaper={item}
                        isViewable={feedFocused && shaperRailViewable.has(item.id ?? item.handle)}
                      />
                    )}
                  />
                </View>
              )}

              {/* Nearby Business */}
              {nearbyBusinessAds.length > 0 && (
                <View style={styles.railSection}>
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
                      <NearbyBusinessRailCard
                        ad={item}
                        surfBreakId={anchorBreakId}
                        isViewable={feedFocused && adRailViewable.has(item.id)}
                      />
                    )}
                  />
                </View>
              )}

              {/* Anchor set, but nothing within range */}
              {nearbyBreaks.length === 0 &&
                nearbySessions.length === 0 &&
                nearbyPhotographers.length === 0 &&
                nearbyShapers.length === 0 &&
                nearbyBusinessAds.length === 0 && (
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
        </ScrollView>
      ) : feedType === 'boardroom' ? (
        <BoardroomFeed ref={boardroomRef} isDark={isDark} />
      ) : showSkeleton ? <HomeSkeleton /> : (
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
                    name={
                      feedType === 'following'
                        ? 'account-multiple-outline'
                        : feedType === 'favorites'
                        ? 'star-outline'
                        : 'compass-outline'
                    }
                    size={36}
                    color={isDark ? '#9ca3af' : '#6b7280'}
                  />
                </View>
                <Text style={[styles.boardroomTitle, { color: isDark ? '#ffffff' : '#111827' }]}>
                  No sessions yet
                </Text>
                <Text style={[styles.boardroomBody, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                  {feedType === 'following'
                    ? 'Follow more photographers and surfers to see their latest sessions here.'
                    : feedType === 'favorites'
                    ? 'Favorite a break to see its latest sessions here.'
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
  resultsWrap: { paddingHorizontal: 16 },
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
  railContent: { paddingHorizontal: 16, paddingTop: 10 },
  photographerHandle: { fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  activeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
});
