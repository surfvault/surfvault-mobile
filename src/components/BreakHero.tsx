import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Dimensions } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

const HERO_BODY = 285;
const SCRIM_HEIGHT = 160;
const SCREEN_WIDTH = Dimensions.get('window').width;

// Minimal dark style — only applies to Google Maps (Android). Apple Maps
// (iOS PROVIDER_DEFAULT) follows the system appearance on its own.
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#0e1626' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#023e58' }] },
];

interface BreakHeroProps {
  breakName: string;
  regionDisplay: string;
  countryDisplay: string;
  lat: number | null;
  lon: number | null;
  isDark: boolean;
  topInset: number;
  selectedDate: Date | null;
  dateLabel: string;
  onDatePress: () => void;
  onClearDate: () => void;
}

function BreakHero({
  breakName,
  regionDisplay,
  countryDisplay,
  lat,
  lon,
  isDark,
  topInset,
  selectedDate,
  dateLabel,
  onDatePress,
  onClearDate,
}: BreakHeroProps) {
  const hasCoords = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  const heroHeight = topInset + HERO_BODY;

  const initialRegion: Region | undefined = hasCoords
    ? { latitude: lat as number, longitude: lon as number, latitudeDelta: 0.06, longitudeDelta: 0.06 }
    : undefined;

  const subtitle = `${regionDisplay}${regionDisplay && countryDisplay ? ' · ' : ''}${countryDisplay}`;

  return (
    <View style={[styles.hero, { height: heroHeight }]}>
      {/* Map background — pointerEvents none so the list scrolls over it (and
          pull-to-refresh fires when the gesture starts on the hero). The flag
          is set on the MapView itself, not just the wrapper: iOS native map
          views keep their own gesture recognizers and otherwise swallow the
          downward drag even when the RN parent is pointerEvents="none". */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {hasCoords ? (
          <MapView
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
            customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
            initialRegion={initialRegion}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
          >
            <Marker
              coordinate={{ latitude: lat as number, longitude: lon as number }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <View style={styles.pin}>
                <Ionicons name="location" size={40} color="#0ea5e9" />
              </View>
            </Marker>
          </MapView>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#0b2540' : '#0e3a5f' }]} />
        )}
      </View>

      {/* Bottom scrim for text legibility */}
      <View pointerEvents="none" style={styles.scrimWrap}>
        <Svg width={SCREEN_WIDTH} height={SCRIM_HEIGHT}>
          <Defs>
            <LinearGradient id="breakHeroScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.78} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={SCREEN_WIDTH} height={SCRIM_HEIGHT} fill="url(#breakHeroScrim)" />
        </Svg>
      </View>

      {/* Bottom overlay: title (left) + date pill (right) on one row */}
      <View pointerEvents="box-none" style={styles.bottomBar}>
        <View pointerEvents="none" style={styles.titleBlock}>
          <Text style={styles.breakName} numberOfLines={2}>
            {breakName}
          </Text>
          {!!subtitle && (
            <View style={styles.subRow}>
              <Ionicons name="location-outline" size={15} color="rgba(255,255,255,0.9)" />
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.dateWrap}>
          {selectedDate && (
            <Pressable onPress={onClearDate} hitSlop={8} style={styles.clearBtn}>
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          )}
          <Pressable
            onPress={onDatePress}
            style={({ pressed }) => [styles.dateBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.dateInner}>
              <Ionicons name="calendar-outline" size={15} color="#fff" />
              <Text style={styles.dateBtnText}>{selectedDate ? dateLabel : 'Any date'}</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden', backgroundColor: '#0e3a5f' },
  pin: {
    textShadowColor: 'rgba(0,0,0,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  scrimWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: SCRIM_HEIGHT },
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 12,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: { flex: 1 },
  breakName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clearBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBtn: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dateInner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dateBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});

export default React.memo(BreakHero);
