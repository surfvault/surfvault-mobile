import { useState, useCallback, useRef, useEffect } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTrackedPush } from '../../src/context/NavigationContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Callout, Region, PROVIDER_DEFAULT } from 'react-native-maps';
import ClusteredMapView from 'react-native-map-clustering';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import * as Location from 'expo-location';
import { useUser } from '../../src/context/UserProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useGetMapSurfBreaksQuery, useGetSurfBreaksQuery, useGetNearbySurfBreaksQuery, useGetNearbyPhotographersQuery } from '../../src/store';
import UserAvatar from '../../src/components/UserAvatar';
import { FlatList } from 'react-native';

type FilterType = 'all' | 'favorites' | 'mine';

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

export default function MapScreen() {
  const router = useRouter();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();
  const requireAuth = useRequireAuth();
  const mapRef = useRef<MapView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const markerRefs = useRef<Record<string, any>>({});
  const hasAnimatedToLocation = useRef(false);

  // Device location from Redux (set by home screen)
  const deviceCoords = useSelector((state: any) => state.location.coordinates);

  // Animate to user's location on first availability
  useEffect(() => {
    if (hasAnimatedToLocation.current) return;
    if (deviceCoords?.lat && deviceCoords?.lon) {
      hasAnimatedToLocation.current = true;
      mapRef.current?.animateToRegion({
        latitude: deviceCoords.lat,
        longitude: deviceCoords.lon,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }, 800);
    }
  }, [deviceCoords]);

  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [selectedBreak, setSelectedBreak] = useState<any>(null);
  const pendingCalloutRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const minLat = region.latitude - region.latitudeDelta / 2;
  const maxLat = region.latitude + region.latitudeDelta / 2;
  const minLon = region.longitude - region.longitudeDelta / 2;
  const maxLon = region.longitude + region.longitudeDelta / 2;

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

  const { data, isFetching } = useGetMapSurfBreaksQuery(
    {
      viewerId: user?.id ?? '',
      continent: getContinent(region.latitude, region.longitude),
      minLat, maxLat, minLon, maxLon,
      favorites: filter === 'favorites',
      mine: filter === 'mine',
    },
    { refetchOnMountOrArgChange: true }
  );

  const surfBreaks = data?.results?.breaks ?? data?.results?.surfBreaks ?? [];

  // Show pending callout once the marker renders after data loads
  useEffect(() => {
    if (!pendingCalloutRef.current) return;
    const id = pendingCalloutRef.current;
    // Poll briefly for the marker ref to appear after data loads
    let attempts = 0;
    const interval = setInterval(() => {
      if (markerRefs.current[id]) {
        markerRefs.current[id].showCallout?.();
        pendingCalloutRef.current = null;
        clearInterval(interval);
      }
      if (++attempts > 20) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [data]);

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
    { lat: nearbyLat ?? 0, long: nearbyLon ?? 0 },
    { skip: !hasNearbyCoords }
  );
  const { data: nearbyPhotographersData } = useGetNearbyPhotographersQuery(
    { lat: nearbyLat ?? 0, long: nearbyLon ?? 0 },
    { skip: !hasNearbyCoords }
  );
  const nearbyBreaks = nearbyBreaksData?.results?.nearbyBreaks ?? nearbyBreaksData?.results?.surfBreaks ?? [];
  const nearbyPhotographers = nearbyPhotographersData?.results?.nearbyPhotographers ?? nearbyPhotographersData?.results?.photographers ?? [];

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
    setRegion(newRegion);
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
      trackedPush(`/break/${country}/${region}/${id}` as any);
    }
  }, [router]);

  const handleMarkerPress = useCallback((sb: any) => {
    setSelectedBreak(sb);
    // Show callout after a tick
    setTimeout(() => {
      markerRefs.current[sb.id]?.showCallout?.();
    }, 100);
  }, []);

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
      mapRef.current?.animateToRegion({
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 800);
      setSelectedBreak(sb);
      pendingCalloutRef.current = sb.id;
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

  return (
    <View style={styles.container}>
      <ClusteredMapView
        ref={mapRef as any}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        onRegionChangeComplete={handleRegionChange}
        provider={PROVIDER_DEFAULT}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        showsUserLocation
        showsMyLocationButton={false}
        clusterColor={markerColor}
        clusterTextColor="#ffffff"
        radius={50}
        minZoomLevel={2}
        maxZoomLevel={15}
        animationEnabled={false}
        onPress={() => {
          if (searchOpen && !searchTerm) {
            setSearchOpen(false);
            Keyboard.dismiss();
          }
          dismissSelection();
        }}
        renderCluster={(cluster: any) => {
          const { id, geometry, onPress, properties } = cluster;
          const count = properties?.point_count ?? 0;
          return (
            <Marker
              key={`cluster-${id}`}
              coordinate={{
                latitude: geometry.coordinates[1],
                longitude: geometry.coordinates[0],
              }}
              onPress={onPress}
            >
              <View style={[styles.cluster, { backgroundColor: markerColor }]}>
                <Text style={styles.clusterText}>{count}</Text>
              </View>
            </Marker>
          );
        }}
      >
        {surfBreaks.map((sb: any) => (
          <Marker
            key={sb.id}
            ref={(ref) => { if (ref) markerRefs.current[sb.id] = ref; }}
            coordinate={{
              latitude: parseFloat(sb.coordinates?.lat) || 0,
              longitude: parseFloat(sb.coordinates?.lon) || 0,
            }}
            onPress={() => handleMarkerPress(sb)}
          >
            <View style={[
              styles.marker,
              { backgroundColor: markerColor },
              selectedBreak?.id === sb.id && styles.markerSelected,
            ]} />
            <Callout
              tooltip
              onPress={() => navigateToBreakPage(sb)}
            >
              <View style={[styles.callout, { backgroundColor: isDark ? '#1f2937' : '#ffffff' }]}>
                <Text style={[styles.calloutName, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                  {sb.name}
                </Text>
                <Text style={[styles.calloutSub, { color: isDark ? '#9ca3af' : '#6b7280' }]} numberOfLines={1}>
                  {sb.region ? `${sb.region.replaceAll('_', ' ')} · ` : ''}{sb.country_code ?? ''}
                </Text>
                <Text style={styles.calloutAction}>View Sessions →</Text>
              </View>
            </Callout>
          </Marker>
        ))}
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
                      renderItem={({ item: p }) => (
                        <Pressable
                          onPress={() => trackedPush(`/user/${p.handle}`)}
                          style={styles.nearbyPhotographer}
                        >
                          <UserAvatar uri={p.picture} name={p.name ?? p.handle} size={44} verified={p.verified} />
                          <View style={styles.nearbyPhotographerHandleRow}>
                            <Text style={[styles.nearbyPhotographerHandle, { color: isDark ? '#d1d5db' : '#374151' }]} numberOfLines={1}>
                              @{p.handle}
                            </Text>
                            {p.active && <View style={styles.nearbyActiveDot} />}
                          </View>
                        </Pressable>
                      )}
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
                            {sb.distance > 1 ? `${sb.distance.toFixed(0)}km · ` : sb.distance > 0 ? `${(sb.distance * 1000).toFixed(0)}m · ` : ''}
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
        }]}
      >
        <Ionicons name="navigate-outline" size={18} color={isDark ? '#d1d5db' : '#374151'} />
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  marker: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: '#fff',
  },
  markerSelected: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 3,
  },
  cluster: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
  },
  clusterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  callout: {
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    minWidth: 160, maxWidth: 300,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  calloutName: { fontSize: 14, fontWeight: '700' },
  calloutSub: { fontSize: 11, marginTop: 1 },
  calloutAction: { fontSize: 11, fontWeight: '600', color: '#0ea5e9', marginTop: 4 },
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
