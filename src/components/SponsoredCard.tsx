import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
  Share,
  useColorScheme,
  FlatList,
  Dimensions,
  type ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRecordAdImpressionMutation } from '../store';
import { buildAdClickUrl, currentDevice } from '../helpers/adTracking';
import { useRequireAuth } from '../hooks/useRequireAuth';
import ActionSheet from './ActionSheet';
import type { ActionSheetOption } from './ActionSheet';
import ReportAdSheet from './ReportAdSheet';

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
  /** Phase B: per-ad carousel slides. Backend returns sort_order ASC. */
  media?: Array<{
    id: string | null;
    type: 'photo' | 'video';
    s3_key: string;
    landscape_s3_key?: string | null;
    sort_order?: number;
  }>;
  thumbnail_ad_media_id?: string | null;
}

interface SponsoredCardProps {
  /** Single ad. Its `media[]` drives the carousel. Partner grouping was
   * dropped in Phase B — each ad is its own promo slot. */
  ad?: Ad;
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
  placement = 'content',
  surfBreakId,
  isViewable = true,
}: SponsoredCardProps) {
  const isDark = useColorScheme() === 'dark';
  const [recordImpression] = useRecordAdImpressionMutation();
  const requireAuth = useRequireAuth();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  // Carousel slides come from ad.media[] (Phase B). Thumbnail slide is
  // floated to the front so the first visible slide matches the sidebar /
  // profile-card representation. Legacy fallback: synthesize a 1-element
  // array from media_url for ads predating the backfill.
  type Slide = { id: string | null; s3_key: string; landscape_s3_key?: string | null };
  const slides = useMemo<Slide[]>(() => {
    if (!ad) return [];
    const media = Array.isArray(ad.media) ? [...ad.media] : [];
    media.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (ad.thumbnail_ad_media_id) {
      const idx = media.findIndex((m) => m.id === ad.thumbnail_ad_media_id);
      if (idx > 0) {
        const [picked] = media.splice(idx, 1);
        media.unshift(picked);
      }
    }
    if (media.length) {
      return media.map((m) => ({ id: m.id, s3_key: m.s3_key, landscape_s3_key: m.landscape_s3_key ?? null }));
    }
    if (ad.media_url) {
      return [{ id: null, s3_key: ad.media_url, landscape_s3_key: ad.hero_media_url ?? null }];
    }
    return [];
  }, [ad]);

  const [activeIdx, setActiveIdx] = useState(0);
  const impressionFiredRef = useRef(false);
  const [width, setWidth] = useState(Dimensions.get('window').width);
  const isCarousel = slides.length > 1;

  // Reset impression tracking when the ad identity changes.
  useEffect(() => {
    impressionFiredRef.current = false;
    setActiveIdx(0);
  }, [ad?.id]);

  // Fire ONE impression per ad when the card enters the viewport. Daily
  // cap is keyed (user, ad, day), so multi-slide views don't multi-count.
  useEffect(() => {
    if (!isViewable || !ad?.id || impressionFiredRef.current) return;
    impressionFiredRef.current = true;
    recordImpression({
      adId: ad.id,
      surfBreakId,
      placement,
      device: currentDevice(),
    }).catch(() => { /* fire-and-forget */ });
  }, [isViewable, ad?.id, surfBreakId, placement, recordImpression]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!viewableItems.length) return;
    const first = viewableItems[0];
    if (typeof first.index === 'number') setActiveIdx(first.index);
  }).current;

  const openClick = useCallback(() => {
    if (!ad) return;
    const url = buildAdClickUrl(ad.id, { placement, surfBreakId, device: currentDevice() });
    Linking.openURL(url).catch(() => { /* noop */ });
  }, [ad, placement, surfBreakId]);

  if (!ad || !slides.length) return null;

  // Avatar: partner logo from ad_partners.logo_url, falling back to the
  // first slide so ads without a logo still render something.
  const avatarSource = ad.partner_logo_url || slides[0]?.s3_key;
  // Hero for the single-slide path. Prefer landscape variant when present.
  const singleHero = slides[0]?.landscape_s3_key || slides[0]?.s3_key;

  return (
    <View style={styles.card} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Header — partner identity stays static; body text below mirrors active slide */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarShadow}>
            <View style={[styles.avatar, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
              {avatarSource ? (
                <Image source={{ uri: avatarSource }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Ionicons name="business-outline" size={18} color="#9ca3af" />
              )}
            </View>
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={[styles.companyName, { color: isDark ? '#ffffff' : '#111827' }]} numberOfLines={1}>
                {ad.company_name || 'Local business'}
              </Text>
              <View style={styles.sponsoredPill}>
                <Text style={styles.sponsoredText}>Sponsored</Text>
              </View>
              {ad.is_local ? (
                <View style={styles.localPill}>
                  <Ionicons name="location-sharp" size={9} color="#047857" />
                  <Text style={styles.localText}>Local</Text>
                </View>
              ) : null}
            </View>
            {ad.headline ? (
              <Text style={styles.subtitle} numberOfLines={1}>{ad.headline}</Text>
            ) : null}
          </View>
        </View>
        <Pressable onPress={() => setSheetVisible(true)} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
        </Pressable>
      </View>

      {/* Hero — carousel when multi-slide, single Pressable otherwise. The
          entire carousel routes to ad.click_url (slide tap is the same as
          card tap); no per-slide click_url. */}
      {isCarousel ? (
        <View>
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={slides}
            keyExtractor={(s, i) => s.id ?? `slide-${i}`}
            renderItem={({ item }) => {
              const img = item.landscape_s3_key || item.s3_key;
              return (
                <Pressable onPress={openClick} style={{ width }}>
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
                  key={s.id ?? `dot-${i}`}
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
        <Pressable onPress={openClick}>
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
      {ad.body ? (
        <Pressable onPress={openClick} style={styles.footer}>
          <Text style={[styles.body, { color: isDark ? '#d1d5db' : '#374151' }]} numberOfLines={2}>
            {ad.body}
          </Text>
        </Pressable>
      ) : null}

      <ActionSheet
        visible={sheetVisible}
        sections={[
          {
            options: [{
              label: 'Share',
              icon: 'share-outline',
              onPress: () => {
                const url = buildAdClickUrl(ad.id, { placement, surfBreakId, device: currentDevice() });
                Share.share(Platform.OS === 'ios' ? { url } : { message: url });
              },
            }],
          },
          {
            options: [{
              label: 'Report',
              icon: 'flag-outline',
              destructive: true,
              onPress: () => {
                // Auth required — keeps moderation reports accountable.
                if (!requireAuth()) return;
                setReportVisible(true);
              },
            } as ActionSheetOption],
          },
        ]}
        header={{
          title: ad.company_name || 'Sponsored',
          subtitle: ad.headline || undefined,
          imageUri: ad.partner_logo_url || avatarSource || undefined,
        }}
        onClose={() => setSheetVisible(false)}
      />

      <ReportAdSheet
        visible={reportVisible}
        adId={ad.id}
        onClose={() => setReportVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 32,
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
  avatarShadow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 16,
    fontWeight: '700',
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
