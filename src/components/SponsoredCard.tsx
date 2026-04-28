import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  useColorScheme,
  FlatList,
  Dimensions,
  type ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRecordAdImpressionMutation } from '../store';
import { buildAdClickUrl, currentDevice } from '../helpers/adTracking';
import { useTrackedPush } from '../context/NavigationContext';

interface Ad {
  id: string;
  ad_partner_id?: string;
  company_name?: string;
  /** Partner logo (square avatar) — joined from ad_partners.logo_url by GET /ads.
   * Used as the post-card avatar; falls back to media_url then a placeholder. */
  partner_logo_url?: string | null;
  headline?: string;
  body?: string;
  media_url?: string;
  hero_media_url?: string | null;
  click_url?: string;
  cta_label?: string;
  cta_type?: 'url' | 'tel';
  /** Server-computed flag: partner is within their target_radius_km of the
   * reference point (surf break on break pages; user coords otherwise). */
  is_local?: boolean;
  /** Partner-level flag (joined from ad_partners.is_shaper). Shapers render a
   * "Shaper" tag instead of "Sponsored" and tap into the in-app gallery
   * (/shaper/{partner_id}) instead of opening the partner's website. */
  is_shaper?: boolean;
}

interface SponsoredCardProps {
  /** Single ad (back-compat — used by user profile + empty-state local-love lists). */
  ad?: Ad;
  /** Partner-grouped ads. When length > 1, renders a paging FlatList carousel. */
  ads?: Ad[];
  placement?: 'content' | 'sidebar';
  surfBreakId?: string;
  /** True when the card is currently visible in the parent feed. */
  isViewable?: boolean;
}

/**
 * Post-styled sponsored card. Visually mirrors SessionCard. When given a
 * partner group via `ads`, renders a horizontal paging FlatList so the user
 * can swipe through every creative from the same partner in one slot — no
 * more "three ads in a row" for a single advertiser. Each slide fires its
 * own impression when it becomes the active page.
 */
export default function SponsoredCard({
  ad,
  ads,
  placement = 'content',
  surfBreakId,
  isViewable = true,
}: SponsoredCardProps) {
  const isDark = useColorScheme() === 'dark';
  const [recordImpression] = useRecordAdImpressionMutation();
  const trackedPush = useTrackedPush();

  const slides = useMemo<Ad[]>(() => {
    if (ads && ads.length) return ads.filter(Boolean);
    if (ad) return [ad];
    return [];
  }, [ad, ads]);

  const [activeIdx, setActiveIdx] = useState(0);
  const firedRef = useRef<Set<string>>(new Set());
  const [width, setWidth] = useState(Dimensions.get('window').width);
  const isCarousel = slides.length > 1;

  // Reset impression tracking when the slide set changes (different partner).
  useEffect(() => {
    firedRef.current = new Set();
    setActiveIdx(0);
  }, [slides]);

  // Fire impression for single-ad usage when the card enters the viewport.
  useEffect(() => {
    if (isCarousel) return;
    const target = slides[0];
    if (!isViewable || !target?.id || firedRef.current.has(target.id)) return;
    firedRef.current.add(target.id);
    recordImpression({
      adId: target.id,
      surfBreakId,
      placement,
      device: currentDevice(),
    }).catch(() => { /* fire-and-forget */ });
  }, [isViewable, isCarousel, slides, surfBreakId, placement, recordImpression]);

  // Fire impression for the active carousel slide once the card is visible.
  useEffect(() => {
    if (!isCarousel || !isViewable) return;
    const target = slides[activeIdx];
    if (!target?.id || firedRef.current.has(target.id)) return;
    firedRef.current.add(target.id);
    recordImpression({
      adId: target.id,
      surfBreakId,
      placement,
      device: currentDevice(),
    }).catch(() => { /* fire-and-forget */ });
  }, [isCarousel, isViewable, activeIdx, slides, surfBreakId, placement, recordImpression]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!viewableItems.length) return;
    const first = viewableItems[0];
    if (typeof first.index === 'number') setActiveIdx(first.index);
  }).current;

  const openClick = useCallback((slide: Ad) => {
    // Shapers route to the in-app gallery instead of the partner's external
    // URL — the gallery is a richer destination (full board lineup + contact
    // options) than dropping the user into Instagram.
    if (slide.is_shaper && slide.ad_partner_id) {
      trackedPush(`/shaper/${slide.ad_partner_id}` as any);
      return;
    }
    const url = buildAdClickUrl(slide.id, { placement, surfBreakId, device: currentDevice() });
    Linking.openURL(url).catch(() => { /* noop */ });
  }, [placement, surfBreakId, trackedPush]);

  if (!slides.length) return null;

  const partner = slides[0];
  const active = slides[activeIdx] || partner;
  // Prefer the partner's logo (set on AdPartnerProfile). Falls back to the
  // first ad's media so old ads without a logo still render an avatar.
  const avatarSource = partner.partner_logo_url || partner.media_url;
  const singleHero = active.hero_media_url || active.media_url;

  return (
    <View style={styles.card} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Header — partner identity stays static; body text below mirrors active slide */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.avatar, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            {avatarSource ? (
              <Image source={{ uri: avatarSource }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Ionicons name="business-outline" size={18} color="#9ca3af" />
            )}
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={[styles.companyName, { color: isDark ? '#ffffff' : '#111827' }]} numberOfLines={1}>
                {partner.company_name || 'Local business'}
              </Text>
              {partner.is_shaper ? (
                <View style={styles.shaperPill}>
                  <Text style={styles.shaperText}>Shaper</Text>
                </View>
              ) : (
                <View style={styles.sponsoredPill}>
                  <Text style={styles.sponsoredText}>Sponsored</Text>
                </View>
              )}
              {active.is_local ? (
                <View style={styles.localPill}>
                  <Ionicons name="location-sharp" size={9} color="#047857" />
                  <Text style={styles.localText}>Local</Text>
                </View>
              ) : null}
            </View>
            {active.headline ? (
              <Text style={styles.subtitle} numberOfLines={1}>{active.headline}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Hero — carousel when multi-slide, single Pressable otherwise */}
      {isCarousel ? (
        <View>
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={slides}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => {
              const img = item.hero_media_url || item.media_url;
              return (
                <Pressable onPress={() => openClick(item)} style={{ width }}>
                  <View style={[styles.thumb, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                    <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
                  </View>
                  {img ? (
                    <Image
                      source={{ uri: img }}
                      style={[styles.thumb, { position: 'absolute', top: 0, left: 0, width }]}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : null}
                </Pressable>
              );
            }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
          {/* Dot pager — tapered, no floor (dots fade out past distance 7). */}
          <View style={styles.dotsRow}>
            {slides.map((s, i) => {
              const dist = Math.abs(i - activeIdx);
              const size = 8 - dist;
              if (size < 1) return null;
              const isActive = i === activeIdx;
              return (
                <View
                  key={s.id}
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
      ) : (
        <Pressable onPress={() => openClick(active)}>
          <View style={[styles.thumb, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            <Ionicons name="image-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
          </View>
          {singleHero ? (
            <Image
              source={{ uri: singleHero }}
              style={[styles.thumb, { position: 'absolute', top: 0, left: 0 }]}
              contentFit="cover"
              transition={200}
            />
          ) : null}
        </Pressable>
      )}

      {/* Body only — tap anywhere on the card (header/hero/body) opens the ad */}
      {active.body ? (
        <Pressable onPress={() => openClick(active)} style={styles.footer}>
          <Text style={[styles.body, { color: isDark ? '#d1d5db' : '#374151' }]} numberOfLines={2}>
            {active.body}
          </Text>
        </Pressable>
      ) : null}
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
  shaperPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  shaperText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#b45309',
  },
  localPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  localText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#047857',
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
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 19,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 8,
    paddingBottom: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
