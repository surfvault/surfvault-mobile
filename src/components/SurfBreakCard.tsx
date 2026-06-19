import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { useTrackedPush } from '../context/NavigationContext';
import { useUserPreferences, formatDistance as formatDistanceUnit } from '../helpers/preferences';

interface SurfBreakCardProps {
  surfBreak: {
    id?: string;
    name: string;
    region?: string;
    country?: string;
    country_code?: string;
    thumbnail?: string;
    distance?: number;
    surf_break_identifier?: string;
    coordinates?: { lat?: number | string; lon?: number | string } | null;
    lat?: number | string | null;
    lon?: number | string | null;
    // A photographer is currently active (shooting) at this break.
    has_active_photographer?: boolean;
  };
  compact?: boolean;
}

const parseCoord = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

export default function SurfBreakCard({ surfBreak, compact = false }: SurfBreakCardProps) {
  const trackedPush = useTrackedPush();
  const { units } = useUserPreferences();

  const handlePress = () => {
    const ident = surfBreak.surf_break_identifier;
    if (!ident) return;
    // Two shapes flow into this card:
    //   1. Composite slug "country/region/break" (used by some endpoints).
    //   2. Bare slug + sibling country_code/region fields (nearby endpoint).
    // trackedPush (not router.push) so depth increments — otherwise smart-back
    // from a screen pushed over the break page (e.g. a session) lands on the
    // tab instead of returning here.
    const parts = ident.split('/');
    if (parts.length === 3) {
      trackedPush(`/break/${parts[0]}/${parts[1]}/${parts[2]}`);
      return;
    }
    const country = surfBreak.country_code ?? surfBreak.country;
    const region = surfBreak.region && surfBreak.region !== '' ? surfBreak.region : '0';
    if (country) {
      trackedPush(`/break/${country}/${region}/${ident}`);
    }
  };

  // Backend returns distance in km (haversine `6371 * acos(...)`); render in
  // the user's chosen unit.
  const formatDistance = (km?: number) => {
    if (km == null) return '';
    return `${formatDistanceUnit(km, units)} away`;
  };

  const lat = parseCoord(surfBreak.lat ?? surfBreak.coordinates?.lat);
  const lon = parseCoord(surfBreak.lon ?? surfBreak.coordinates?.lon);
  const hasCoords = lat != null && lon != null;
  const isActive = !!surfBreak.has_active_photographer;

  // "Active" pill — a photographer is shooting at this break right now. Solid
  // green with a soft glow so it reads as live. Reused in both card variants.
  const ActiveBadge = () => (
    <View
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#22c55e',
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 2,
        shadowColor: '#22c55e',
        shadowOpacity: 0.6,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 }}>ACTIVE</Text>
    </View>
  );

  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        className="mr-3 w-40"
      >
        <View className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
          {surfBreak.thumbnail ? (
            <Image
              source={{ uri: surfBreak.thumbnail }}
              className="w-full"
              style={{ aspectRatio: 4 / 3 }}
              contentFit="cover"
              transition={200}
            />
          ) : hasCoords ? (
            <View className="w-full" style={{ aspectRatio: 4 / 3 }}>
              <MapView
                provider={PROVIDER_DEFAULT}
                style={{ flex: 1 }}
                region={{
                  latitude: lat as number,
                  longitude: lon as number,
                  latitudeDelta: 0.08,
                  longitudeDelta: 0.08,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
                showsUserLocation={false}
                showsMyLocationButton={false}
                showsCompass={false}
                showsScale={false}
                showsTraffic={false}
                showsIndoors={false}
                pointerEvents="none"
              />
              {/* Centered marker — drawn in pure RN over the map. Since
                  `region` is locked to the break's coords, the visual
                  center of the MapView is always the break, so a centered
                  dot is correct. Avoids react-native-maps' flaky custom
                  Marker rendering on iOS. */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: '#0ea5e9',
                    borderWidth: 1.5,
                    borderColor: '#fff',
                    shadowColor: '#000',
                    shadowOpacity: 0.35,
                    shadowRadius: 2,
                    shadowOffset: { width: 0, height: 1 },
                  }}
                />
              </View>
              {/* Tap-through overlay forwards the tap to the card's
                  navigation handler — MapView's native gesture recognizers
                  swallow it otherwise. */}
              <Pressable
                onPress={handlePress}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
            </View>
          ) : (
            <View
              className="w-full items-center justify-center"
              style={{ aspectRatio: 4 / 3, backgroundColor: '#0c4a6e' }}
            >
              <Ionicons name="location" size={28} color="#38bdf8" />
            </View>
          )}
          {isActive && <ActiveBadge />}
        </View>
        <Text className="text-sm font-semibold text-gray-900 dark:text-white mt-1.5" numberOfLines={1}>
          {surfBreak.name}
        </Text>
        {surfBreak.region && (
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
            {surfBreak.region.replaceAll('_', ' ')}{surfBreak.country_code ? `, ${surfBreak.country_code}` : ''}
          </Text>
        )}
        {/* Hide distance when this break IS the user's anchor — "0m away"
            on your own home break is just noise. */}
        {surfBreak.distance != null && surfBreak.distance >= 0.05 && (
          <Text className="text-xs text-sky-500 mt-0.5">
            {formatDistance(surfBreak.distance)}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center py-3 border-b border-gray-100 dark:border-gray-800"
    >
      <View className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
        {surfBreak.thumbnail ? (
          <Image
            source={{ uri: surfBreak.thumbnail }}
            style={{ width: 64, height: 64 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            className="bg-gray-200 dark:bg-gray-700 items-center justify-center"
            style={{ width: 64, height: 64 }}
          >
            <Text className="text-gray-400 text-xl">🏄</Text>
          </View>
        )}
        {isActive && (
          <View
            style={{
              position: 'absolute',
              top: 5,
              right: 5,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: '#22c55e',
              borderWidth: 2,
              borderColor: '#fff',
            }}
          />
        )}
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-base font-semibold text-gray-900 dark:text-white" numberOfLines={1}>
          {surfBreak.name}
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
          {surfBreak.region?.replaceAll('_', ' ')}{surfBreak.country ? `, ${surfBreak.country}` : ''}
        </Text>
        {surfBreak.distance != null && (
          <Text className="text-xs text-sky-500 mt-0.5">
            {formatDistance(surfBreak.distance)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
