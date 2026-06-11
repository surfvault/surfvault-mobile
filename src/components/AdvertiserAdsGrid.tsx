import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Linking,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useTrackedPush } from '../context/NavigationContext';
import { dailyCreditCost } from '../helpers/adTiers';
import ActionSheet, { type ActionSheetOption } from './ActionSheet';
import {
  useGetAdvertiserAdsQuery,
  useGetMyCampaignsQuery,
  useDeleteMyAdMutation,
  usePauseMyAdMutation,
  useResumeMyAdMutation,
} from '../store';

/**
 * Mobile parallel to web AdvertiserAdsGallery. Renders the advertiser's
 * campaign tiles as a 3-col grid:
 *   • Approved tiles → tap opens click_url; no status pill (just the
 *     "Sponsored" chip in the corner to match the in-feed card chrome).
 *   • Pending / Rejected / Paused tiles → status pill, no tap-through
 *     (the ad isn't live, so opening click_url would be misleading).
 *
 * Backend gates the response shape by JWT — self sees every status,
 * public viewers see only approved + currently-active. The same
 * `useGetAdvertiserAdsQuery` works for both cases.
 */

type AdMedia = {
  id: string | null;
  type?: 'photo' | 'video';
  s3_key: string;
  poster_s3_key?: string | null;
  landscape_s3_key?: string | null;
  sort_order?: number;
};

type AdRow = {
  id: string;
  status?: 'pending' | 'approved' | 'rejected' | 'paused' | 'draft';
  is_active?: boolean;
  ends_at?: string | null;
  headline?: string;
  cta_label?: string | null;
  cta_type?: 'url' | 'tel';
  click_url?: string | null;
  media_url?: string | null;
  hero_media_url?: string | null;
  thumbnail_ad_media_id?: string | null;
  media?: AdMedia[];
  impression_count?: number;
  click_count?: number;
  show_on_discover?: boolean;
  surf_break_targets?: Array<{ id: string; name: string }>;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Mirror the profile session grid: 3 portrait tiles, 1px gutter.
const GRID_GAP = 1;
const COLS = 3;
const TILE_W = (SCREEN_WIDTH - GRID_GAP * (COLS - 1)) / COLS;
const TILE_H = TILE_W * 1.3;

// Compact count formatter — matches SessionCard / profile grid so every
// card's stat chip reads the same.
const formatCount = (n: number): string => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(v >= 10000000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(v);
};

// The representative still for a media row. For a VIDEO row `s3_key` is the
// transcoded MP4 (not an image) — so the still is `poster_s3_key` (null while
// the clip is still transcoding). A photo's still is its `s3_key`.
function mediaStill(m?: AdMedia | null): string | null {
  if (!m) return null;
  return m.type === 'video' ? (m.poster_s3_key ?? null) : (m.s3_key ?? null);
}

// The media row used for the tile thumbnail: owner-chosen `thumbnail_ad_media_id`
// when set, else the lowest sort_order. (Backend pre-sorts, but sort defensively.)
function pickThumbnailMedia(ad: AdRow): AdMedia | null {
  const media = ad.media ?? [];
  if (ad.thumbnail_ad_media_id) {
    const t = media.find((m) => m.id === ad.thumbnail_ad_media_id);
    if (t) return t;
  }
  if (media.length) {
    return [...media].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ?? null;
  }
  return null;
}

function pickThumbnailKey(ad: AdRow): string | null {
  const picked = pickThumbnailMedia(ad);
  // Fall back to the legacy inline media_url when there's no media[] row.
  return picked ? mediaStill(picked) : (ad.media_url ?? null);
}

export default function AdvertiserAdsGrid({
  handle,
  isSelf,
  mode = 'grid',
}: {
  handle: string;
  isSelf?: boolean;
  mode?: 'grid' | 'list';
}) {
  const isDark = useColorScheme() === 'dark';
  const trackedPush = useTrackedPush();
  // Dispatch: self hits the authed /campaigns (all statuses); others hit
  // the public /advertisers/{handle}/ads (approved+active only).
  const publicQuery = useGetAdvertiserAdsQuery({ handle }, { skip: !!isSelf });
  const myQuery = useGetMyCampaignsQuery(undefined, { skip: !isSelf });
  const data = isSelf ? myQuery.data : publicQuery.data;
  const isLoading = isSelf ? myQuery.isLoading : publicQuery.isLoading;
  const isError = isSelf ? myQuery.isError : publicQuery.isError;
  const ads: AdRow[] = useMemo(() => data?.results?.ads ?? [], [data]);

  // Self-only management state. Tapping a tile on the advertiser's own
  // profile opens an action sheet with status-gated options (pause,
  // resume, delete). Edit is a placeholder until the full edit flow
  // lands — for now it shows a "coming soon" alert.
  const [sheetTarget, setSheetTarget] = useState<AdRow | null>(null);
  const [pauseAd, { isLoading: pausing }] = usePauseMyAdMutation();
  const [resumeAd, { isLoading: resuming }] = useResumeMyAdMutation();
  const [deleteAd, { isLoading: deleting }] = useDeleteMyAdMutation();
  const sheetBusy = pausing || resuming || deleting;

  const closeSheet = () => setSheetTarget(null);

  const onPause = async (ad: AdRow) => {
    closeSheet();
    try { await pauseAd({ adId: ad.id }).unwrap(); }
    catch (err: any) { Alert.alert('Error', err?.data?.message || 'Failed to pause'); }
  };
  const onResume = async (ad: AdRow) => {
    closeSheet();
    try { await resumeAd({ adId: ad.id }).unwrap(); }
    catch (err: any) { Alert.alert('Error', err?.data?.message || 'Failed to resume'); }
  };
  const onDelete = (ad: AdRow) => {
    closeSheet();
    Alert.alert(
      'Delete campaign?',
      `"${ad.headline ?? 'this campaign'}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try { await deleteAd({ adId: ad.id }).unwrap(); }
            catch (err: any) { Alert.alert('Error', err?.data?.message || 'Failed to delete'); }
          },
        },
      ],
    );
  };

  // Status determines which actions show. Edit is always available
  // (TODO: route to edit page); pause/resume/delete are status-gated.
  const sheetOptions = useMemo<ActionSheetOption[]>(() => {
    if (!sheetTarget) return [];
    const status = sheetTarget.status ?? 'approved';
    const options: ActionSheetOption[] = [];
    options.push({
      label: 'Edit campaign',
      icon: 'create-outline',
      onPress: () => {
        const id = sheetTarget.id;
        closeSheet();
        trackedPush(`/campaign/${id}/edit` as any);
      },
    });
    // Test the CTA destination so the owner can confirm the link / call works
    // and lands where expected. Opens the raw destination (no click logged).
    if (sheetTarget.click_url) {
      const isTel = sheetTarget.cta_type === 'tel';
      const raw = sheetTarget.click_url;
      const dest = isTel ? (raw.startsWith('tel:') ? raw : `tel:${raw}`) : raw;
      options.push({
        label: isTel ? 'Test call' : 'Test link',
        icon: isTel ? 'call-outline' : 'open-outline',
        onPress: () => {
          closeSheet();
          Linking.openURL(dest).catch(() => Alert.alert('Could not open', 'This link could not be opened on your device.'));
        },
      });
    }
    if (status === 'approved') {
      options.push({
        label: 'Pause campaign',
        icon: 'pause-circle-outline',
        onPress: () => onPause(sheetTarget),
      });
    }
    if (status === 'paused') {
      options.push({
        label: 'Resume campaign',
        icon: 'play-circle-outline',
        onPress: () => onResume(sheetTarget),
      });
    }
    if (status === 'pending' || status === 'rejected' || status === 'draft') {
      options.push({
        label: 'Delete campaign',
        icon: 'trash-outline',
        destructive: true,
        onPress: () => onDelete(sheetTarget),
      });
    }
    return options;
  }, [sheetTarget]);

  if (isLoading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="small" color={isDark ? '#6b7280' : '#9ca3af'} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={s.emptyWrap}>
        <Ionicons name="alert-circle-outline" size={40} color={isDark ? '#374151' : '#d1d5db'} />
        <Text style={[s.emptyText, { color: '#9ca3af' }]}>Couldn't load campaigns.</Text>
      </View>
    );
  }

  if (!ads.length) {
    return (
      <View style={s.emptyWrap}>
        <Ionicons name="megaphone-outline" size={40} color={isDark ? '#374151' : '#d1d5db'} />
        <Text style={[s.emptyText, { color: '#9ca3af' }]}>
          {isSelf ? 'No campaigns yet. Tap Campaign to submit one.' : 'No active campaigns.'}
        </Text>
      </View>
    );
  }

  // Shared per-ad derivation so grid + list stay in sync.
  const adMeta = (ad: AdRow) => {
    const thumb = pickThumbnailKey(ad);
    const isVideoThumb = pickThumbnailMedia(ad)?.type === 'video';
    const allMedia = Array.isArray(ad.media) ? ad.media : [];
    const videoCount = allMedia.filter((m) => m.type === 'video').length;
    const imageCount = allMedia.length - videoCount;
    const status = (ad.status ?? 'approved') as NonNullable<AdRow['status']>;
    // An approved ad past its end date isn't serving — surface it as "Expired"
    // instead of "Active" so the advertiser knows it needs a new window.
    const isExpired = status === 'approved' && !!ad.ends_at && new Date(ad.ends_at).getTime() < Date.now();
    const pillStatus: NonNullable<AdRow['status']> | 'expired' = isExpired ? 'expired' : status;
    const isLive = status === 'approved' && ad.is_active !== false && !isExpired;
    // Daily credit burn = 1 per targeted break + 1 if on Discover.
    const dailyCost = dailyCreditCost(
      Array.isArray(ad.surf_break_targets) ? ad.surf_break_targets.length : 0,
      ad.show_on_discover === true,
    );
    const onPress = () => {
      // Self view → tap-through to edit (the ellipsis hosts pause/resume/delete).
      // Public viewers tap-through to click_url on approved tiles only.
      if (isSelf) { trackedPush(`/campaign/${ad.id}/edit` as any); return; }
      if (!isLive) return;
      if (ad.click_url) Linking.openURL(ad.click_url).catch(() => { /* noop */ });
    };
    return { thumb, isVideoThumb, status, pillStatus, isLive, imageCount, videoCount, dailyCost, onPress };
  };

  return (
    <>
      {mode === 'list' ? (
        // Full-width card mirroring SessionCard: header (title + CTA + status +
        // ellipsis) on top, edge-to-edge thumbnail with a bottom-left stats chip.
        <View>
          {ads.map((ad) => {
            const { thumb, isVideoThumb, pillStatus, isLive, imageCount, videoCount, dailyCost, onPress } = adMeta(ad);
            return (
              <View key={ad.id} style={s.listCard}>
                <View style={s.listCardHeader}>
                  <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <Text style={[s.listCardTitle, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                      {ad.headline || 'Untitled campaign'}
                    </Text>
                    {ad.cta_label ? (
                      <Text style={[s.listCardSubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]} numberOfLines={1}>
                        {ad.cta_label}
                      </Text>
                    ) : null}
                  </View>
                  {/* Header "banner" (self-view): credit burn + status next to
                      each other (mirrors web), then the ellipsis. */}
                  {isSelf && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <CreditChip cost={dailyCost} />
                      <StatusPill status={pillStatus} />
                      <Pressable onPress={() => setSheetTarget(ad)} hitSlop={8}>
                        <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
                      </Pressable>
                    </View>
                  )}
                </View>
                <Pressable
                  onPress={onPress}
                  disabled={!isSelf && !isLive}
                  style={[s.listCardThumb, !isLive && { opacity: 0.85 }]}
                >
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={s.listCardImage} contentFit="cover" transition={150} />
                  ) : (
                    <View style={[s.listCardImage, s.tilePlaceholder, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                      <Ionicons name="megaphone-outline" size={32} color={isDark ? '#374151' : '#d1d5db'} />
                    </View>
                  )}
                  {isVideoThumb && thumb ? (
                    <View style={s.videoBadgeWrap} pointerEvents="none">
                      <View style={s.videoBadgeCircle}>
                        <Ionicons name="videocam" size={16} color="#fff" />
                      </View>
                    </View>
                  ) : null}
                  <View style={s.listStatsBL} pointerEvents="none">
                    <StatsChip imageCount={imageCount} videoCount={videoCount} impressions={ad.impression_count} clicks={ad.click_count} showAnalytics={!!isSelf} large />
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
      <View style={s.grid}>
      {ads.map((ad) => {
        const { thumb, isVideoThumb, pillStatus, isLive, imageCount, videoCount, dailyCost, onPress } = adMeta(ad);
        return (
          <Pressable
            key={ad.id}
            onPress={onPress}
            onLongPress={isSelf ? () => setSheetTarget(ad) : undefined}
            disabled={!isSelf && !isLive}
            style={[
              s.tile,
              { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' },
              !isLive && { opacity: 0.85 },
            ]}
          >
            {thumb ? (
              <Image source={{ uri: thumb }} style={s.tileImage} contentFit="cover" transition={150} />
            ) : (
              <View style={s.tilePlaceholder}>
                <Ionicons name="megaphone-outline" size={28} color={isDark ? '#4b5563' : '#9ca3af'} />
              </View>
            )}

            {isVideoThumb && thumb ? (
              <View style={s.videoBadgeWrap} pointerEvents="none">
                <View style={s.videoBadgeCircle}>
                  <Ionicons name="videocam" size={15} color="#fff" />
                </View>
              </View>
            ) : null}

            {/* TOP-LEFT chip — status dot (self) + name + CTA label (mirrors the
                session grid tile's chip; the dot replaces a full status pill so a
                long name has room on a tiny tile). */}
            {(ad.headline || ad.cta_label) && (
              <View style={s.gridTopLeft} pointerEvents="none">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {isSelf && (
                    <View style={[s.statusDot, { backgroundColor: STATUS_META[pillStatus]?.color ?? '#475569' }]} />
                  )}
                  {ad.headline ? (
                    <Text style={[s.gridTitleText, { flexShrink: 1 }]} numberOfLines={1}>{ad.headline}</Text>
                  ) : null}
                </View>
                {ad.cta_label ? (
                  <Text style={[s.gridSubText, { opacity: 0.8 }]} numberOfLines={1}>{ad.cta_label}</Text>
                ) : null}
              </View>
            )}

            {/* BOTTOM-LEFT — daily credit burn stacked above the view/click
                stats (self-view shows both). */}
            <View style={s.gridBottomLeft} pointerEvents="none">
              {isSelf && <CreditChip cost={dailyCost} />}
              <StatsChip imageCount={imageCount} videoCount={videoCount} impressions={ad.impression_count} clicks={ad.click_count} showAnalytics={!!isSelf} />
            </View>

            {/* BOTTOM-RIGHT — ellipsis actions (self-view only). */}
            {isSelf && (
              <Pressable
                onPress={(e) => { e.stopPropagation(); setSheetTarget(ad); }}
                hitSlop={6}
                style={s.gridEllipsisBtn}
              >
                <Ionicons name="ellipsis-horizontal" size={14} color="#fff" />
              </Pressable>
            )}
          </Pressable>
        );
      })}
      </View>
      )}

      <ActionSheet
        visible={!!sheetTarget && !sheetBusy}
        onClose={closeSheet}
        title={sheetTarget?.headline ?? 'Manage campaign'}
        options={sheetOptions}
      />
    </>
  );
}

// Shared status label + color. The full pill (list + grid would-be) and the
// compact grid dot both read from this so they never drift.
type AdStatus = NonNullable<AdRow['status']> | 'expired';
const STATUS_META: Record<AdStatus, { label: string; color: string }> = {
  approved: { label: 'Active',   color: '#10b981' },  // emerald
  expired:  { label: 'Expired',  color: '#475569' },  // slate
  pending:  { label: 'Pending',  color: '#f59e0b' },  // amber
  rejected: { label: 'Rejected', color: '#dc2626' },  // red
  paused:   { label: 'Paused',   color: '#475569' },  // slate
  draft:    { label: 'Draft',    color: '#475569' },  // slate
};

/**
 * Status chrome for the advertiser self-view. Full text pill (used in the list
 * header where there's room). The grid tile uses a compact colored dot instead
 * so a long name doesn't fight the pill on a tiny tile.
 */
function StatusPill({ status }: { status: AdStatus }) {
  const entry = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <View style={[s.pill, { backgroundColor: entry.color }]}>
      <Text style={[s.pillText, { color: '#fff' }]}>{entry.label}</Text>
    </View>
  );
}

/**
 * Bottom-left stats chip — media count always; impressions + clicks only on the
 * self-view (private analytics, like SessionCard's owner-only view count).
 * `large` matches SessionCard's thumbnail badge; default matches the grid tile.
 */
function StatsChip({ imageCount, videoCount, impressions, clicks, showAnalytics, large = false }: {
  imageCount: number;
  videoCount: number;
  impressions?: number;
  clicks?: number;
  showAnalytics: boolean;
  large?: boolean;
}) {
  const iconSize = large ? 11 : 10;
  // On the compact grid tile, views/clicks matter more than the slide count, so
  // drop media there. List view (room for all three) and public grid tiles
  // (analytics are private, so media is the only stat) keep it.
  const showMedia = !(showAnalytics && !large);
  const hasMedia = imageCount > 0 || videoCount > 0;
  return (
    <View style={large ? s.chipLg : s.chip} pointerEvents="none">
      {showMedia && imageCount > 0 && (
        <>
          <Ionicons name="images-outline" size={iconSize} color="#fff" />
          <Text style={s.statsChipText}>{formatCount(imageCount)}</Text>
        </>
      )}
      {showMedia && videoCount > 0 && (
        <>
          {imageCount > 0 && <Text style={[s.statsChipText, { opacity: 0.7 }]}> · </Text>}
          <Ionicons name="videocam-outline" size={iconSize} color="#fff" />
          <Text style={s.statsChipText}>{formatCount(videoCount)}</Text>
        </>
      )}
      {showAnalytics && (
        <>
          {showMedia && hasMedia && <Text style={[s.statsChipText, { opacity: 0.7 }]}> · </Text>}
          <Ionicons name="eye-outline" size={iconSize} color="#fff" />
          <Text style={s.statsChipText}>{formatCount(impressions ?? 0)}</Text>
          <Text style={[s.statsChipText, { opacity: 0.7 }]}> · </Text>
          <Ionicons name="open-outline" size={iconSize} color="#fff" />
          <Text style={s.statsChipText}>{formatCount(clicks ?? 0)}</Text>
        </>
      )}
    </View>
  );
}

/**
 * Daily credit-burn chip — lets the owner glance across cards and see which
 * campaigns spend the most per day. Self-view only. Positioned by the caller
 * (grid: stacked above the stats; list: in the header next to the status).
 */
function CreditChip({ cost, large = false }: { cost: number; large?: boolean }) {
  return (
    <View style={large ? s.chipLg : s.chip} pointerEvents="none">
      <FontAwesome5 name="coins" size={large ? 10 : 8} color="#fbbf24" />
      <Text style={s.creditChipText}>{cost}/day</Text>
    </View>
  );
}

const s = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  // Center clip indicator — videocam (matches the web ad gallery + the board /
  // session grids). Center is clear of the name (top-left), stats (bottom-left)
  // and ellipsis (bottom-right).
  videoBadgeWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadgeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCard: {
    marginBottom: 16,
  },
  listCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  listCardTitle: { fontSize: 14, fontWeight: '600' },
  listCardSubtitle: { fontSize: 13, marginTop: 1 },
  listCardThumb: {
    width: '100%',
    aspectRatio: 5 / 4,
    position: 'relative',
  },
  listCardImage: { width: '100%', height: '100%' },
  tile: {
    width: TILE_W,
    height: TILE_H,
    overflow: 'hidden',
    position: 'relative',
  },
  tileImage: { width: '100%', height: '100%' },
  tilePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Grid tile overlays — mirror the profile session grid chrome.
  gridTopLeft: {
    position: 'absolute', top: 4, left: 4, maxWidth: TILE_W - 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  gridTitleText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  gridSubText: { fontSize: 9, fontWeight: '600', color: '#fff' },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  gridEllipsisBtn: {
    position: 'absolute', bottom: 4, right: 4,
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Bottom-left overlay containers (caller positions; chips are visual-only).
  gridBottomLeft: {
    position: 'absolute', bottom: 4, left: 4,
    alignItems: 'flex-start', gap: 3,
  },
  listStatsBL: { position: 'absolute', bottom: 10, left: 10 },
  // Position-agnostic chip — small (grid) + large (list) variants.
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  chipLg: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  statsChipText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  creditChipText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  loadingWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 16 },
});
