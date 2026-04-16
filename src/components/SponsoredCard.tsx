import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRecordAdImpressionMutation } from '../store';
import { buildAdClickUrl, currentDevice } from '../helpers/adTracking';

interface Ad {
  id: string;
  company_name?: string;
  headline?: string;
  body?: string;
  media_url?: string;
  /**
   * Optional feed-optimized creative (landscape / 5:4). When provided, the
   * card's hero image uses this instead of media_url so portrait sidebar
   * creatives don't center-crop awkwardly in the feed.
   */
  hero_media_url?: string | null;
  click_url?: string;
  cta_label?: string;
  cta_type?: 'url' | 'tel';
}

interface SponsoredCardProps {
  ad: Ad;
  placement?: 'content' | 'sidebar';
  surfBreakId?: string;
  /** True when this card is currently visible in the feed. Triggers the impression beacon. */
  isViewable?: boolean;
}

/**
 * Post-styled sponsored card. Visually mirrors SessionCard — same header row,
 * same thumbnail dimensions, same muted header palette. The only visual
 * differentiator is the small "Sponsored" pill + CTA button, per App Store
 * policy.
 */
export default function SponsoredCard({
  ad,
  placement = 'content',
  surfBreakId,
  isViewable = true,
}: SponsoredCardProps) {
  const isDark = useColorScheme() === 'dark';
  const [recordImpression] = useRecordAdImpressionMutation();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!isViewable || !ad?.id || firedRef.current) return;
    firedRef.current = true;
    recordImpression({
      adId: ad.id,
      surfBreakId,
      placement,
      device: currentDevice(),
    }).catch(() => { /* fire-and-forget */ });
  }, [isViewable, ad?.id, surfBreakId, placement, recordImpression]);

  const openClick = () => {
    const url = buildAdClickUrl(ad.id, { placement, surfBreakId, device: currentDevice() });
    Linking.openURL(url).catch(() => { /* noop */ });
  };

  const ctaLabel = ad.cta_label || (ad.cta_type === 'tel' ? 'Call now' : 'Learn more');
  // Hero prefers feed-optimized creative; falls back to main media_url.
  const heroImage = ad.hero_media_url || ad.media_url;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.avatar, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            {ad.media_url ? (
              <Image source={{ uri: ad.media_url }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Ionicons name="business-outline" size={18} color="#9ca3af" />
            )}
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={[styles.companyName, { color: isDark ? '#ffffff' : '#111827' }]} numberOfLines={1}>
                {ad.company_name || 'Local business'}
              </Text>
              <View style={styles.sponsoredPill}>
                <Text style={styles.sponsoredText}>Sponsored</Text>
              </View>
            </View>
            {ad.headline ? (
              <Text style={styles.subtitle} numberOfLines={1}>{ad.headline}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Hero */}
      <Pressable onPress={openClick}>
        <View>
          <View style={[styles.thumb, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
          </View>
          {heroImage ? (
            <Image
              source={{ uri: heroImage }}
              style={[styles.thumb, { position: 'absolute', top: 0, left: 0 }]}
              contentFit="cover"
              transition={200}
            />
          ) : null}
        </View>
      </Pressable>

      {/* Body + CTA */}
      <View style={styles.footer}>
        <View style={{ flex: 1, marginRight: 12 }}>
          {ad.body ? (
            <Text style={[styles.body, { color: isDark ? '#d1d5db' : '#374151' }]} numberOfLines={2}>
              {ad.body}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={openClick}
          style={[styles.cta, { backgroundColor: isDark ? '#ffffff' : '#111827' }]}
          hitSlop={6}
        >
          <Text style={[styles.ctaText, { color: isDark ? '#111827' : '#ffffff' }]}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  companyName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  sponsoredPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(156, 163, 175, 0.18)',
  },
  sponsoredText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#6b7280',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 1,
  },
  thumb: {
    width: '100%',
    aspectRatio: 5 / 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 19,
  },
  cta: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
