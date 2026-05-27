// Compact tile rendered in the map's bottom sheet — used in BOTH:
//   - half-snap carousel (single mode, type-locked: only breaks OR only ads)
//   - full-snap horizontal section row (multiple modes, one per section)
//
// Same visual treatment in either context so the bar reads as one component.
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type MapNearbyItem =
  | {
      kind: 'break';
      id: string;
      name: string;
      subtitle: string; // region + country, or empty
      distanceLabel: string | null; // pre-formatted with the user's unit pref
      lat: number;
      lon: number;
      thumbnailUrl?: string | null;
    }
  | {
      kind: 'ad';
      id: string;
      company: string;
      title: string;
      placeName?: string | null;
      venueCount?: number; // "+ N more here" when > 1
      ctaLabel: string;
      thumbnailUrl?: string | null;
      lat: number;
      lon: number;
    };

interface Props {
  item: MapNearbyItem;
  isDark: boolean;
  onPress: () => void;
  /** Width when rendered in the carousel; section cards size themselves. */
  width?: number;
}

export default function MapNearbyCard({ item, isDark, onPress, width }: Props) {
  const isAd = item.kind === 'ad';
  const bg = isDark ? '#1f2937' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const subColor = isDark ? '#9ca3af' : '#6b7280';
  const primaryColor = isDark ? '#fff' : '#111827';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: bg, borderColor: border, width }]}
    >
      {/* Thumbnail / icon */}
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: isAd ? '#fef3c7' : isDark ? '#0f172a' : '#e0f2fe',
          },
        ]}
      >
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbImg} />
        ) : (
          <Ionicons
            name={isAd ? 'megaphone' : 'water'}
            size={24}
            color={isAd ? '#b45309' : '#0ea5e9'}
          />
        )}
      </View>

      {/* Body */}
      <View style={{ flex: 1, minWidth: 0 }}>
        {isAd ? (
          <>
            <View style={styles.adBadgeRow}>
              <View style={styles.sponsoredPill}>
                <Text style={styles.sponsoredText}>SPONSORED</Text>
              </View>
              <Text style={[styles.adCompany, { color: subColor }]} numberOfLines={1}>
                {item.company}
              </Text>
            </View>
            <Text style={[styles.title, { color: primaryColor }]} numberOfLines={1}>
              {item.title}
            </Text>
            {!!item.placeName && (
              <Text style={[styles.sub, { color: subColor }]} numberOfLines={1}>
                {item.placeName}
                {(item.venueCount ?? 0) > 1 ? ` · +${(item.venueCount ?? 1) - 1} more` : ''}
              </Text>
            )}
            <Text style={styles.adCta} numberOfLines={1}>
              {item.ctaLabel} →
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: primaryColor }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.sub, { color: subColor }]} numberOfLines={1}>
              {item.distanceLabel ? `${item.distanceLabel} · ` : ''}
              {item.subtitle}
            </Text>
            <Text style={styles.breakCta} numberOfLines={1}>
              View Sessions →
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  adBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  sponsoredPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#fde68a',
  },
  sponsoredText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.4, color: '#b45309' },
  adCompany: { fontSize: 11, fontWeight: '500', flex: 1 },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  breakCta: { fontSize: 12, fontWeight: '700', color: '#0ea5e9', marginTop: 4 },
  adCta: { fontSize: 12, fontWeight: '700', color: '#f59e0b', marginTop: 4 },
});
