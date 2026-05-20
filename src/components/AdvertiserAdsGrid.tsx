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
import { Ionicons } from '@expo/vector-icons';
import { useTrackedPush } from '../context/NavigationContext';
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
  click_url?: string | null;
  media_url?: string | null;
  hero_media_url?: string | null;
  thumbnail_ad_media_id?: string | null;
  media?: AdMedia[];
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GUTTER = 2;
const COLS = 3;
const TILE_SIZE = (SCREEN_WIDTH - GUTTER * (COLS - 1)) / COLS;

function pickThumbnailKey(ad: AdRow): string | null {
  const media = ad.media ?? [];
  if (ad.thumbnail_ad_media_id) {
    const t = media.find((m) => m.id === ad.thumbnail_ad_media_id);
    if (t?.s3_key) return t.s3_key;
  }
  if (media.length) {
    const sorted = [...media].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return sorted[0]?.s3_key ?? null;
  }
  return ad.media_url ?? null;
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
    const status = (ad.status ?? 'approved') as NonNullable<AdRow['status']>;
    // An approved ad past its end date isn't serving — surface it as "Expired"
    // instead of "Active" so the advertiser knows it needs a new window.
    const isExpired = status === 'approved' && !!ad.ends_at && new Date(ad.ends_at).getTime() < Date.now();
    const pillStatus: NonNullable<AdRow['status']> | 'expired' = isExpired ? 'expired' : status;
    const isLive = status === 'approved' && ad.is_active !== false && !isExpired;
    const onPress = () => {
      // Self view → open the action sheet for management. Public viewers
      // tap-through to click_url on approved tiles only.
      if (isSelf) { setSheetTarget(ad); return; }
      if (!isLive) return;
      if (ad.click_url) Linking.openURL(ad.click_url).catch(() => { /* noop */ });
    };
    return { thumb, status, pillStatus, isLive, onPress };
  };

  return (
    <>
      {mode === 'list' ? (
        // Full-width card layout matching the app's other list views
        // (SessionCard / shaper BoardListCard): header on top, edge-to-edge
        // thumbnail below.
        <View>
          {ads.map((ad) => {
            const { thumb, pillStatus, isLive, onPress } = adMeta(ad);
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
                  {isSelf && (
                    <Pressable onPress={() => setSheetTarget(ad)} hitSlop={8}>
                      <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
                    </Pressable>
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
                  {/* Status pill only on self-view (public viewers only see
                      approved ads; the profile is already marked SPONSORED). */}
                  {isSelf && (
                    <View style={s.tileTopLeft}>
                      <StatusPill status={pillStatus} />
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
      <View style={s.grid}>
      {ads.map((ad) => {
        const { thumb, pillStatus, isLive, onPress } = adMeta(ad);
        return (
          <Pressable
            key={ad.id}
            onPress={onPress}
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

            {/* Status pill only on the self-view. Public visitors only see
                approved ads and the profile is already marked SPONSORED, so a
                per-tile "Sponsored" chip is redundant. */}
            {isSelf && (
              <View style={s.tileTopLeft}>
                <StatusPill status={pillStatus} />
              </View>
            )}

            {ad.headline ? (
              <View style={s.tileBottom} pointerEvents="none">
                <Text style={s.tileHeadline} numberOfLines={2}>
                  {ad.headline}
                </Text>
              </View>
            ) : null}
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

/**
 * Status chrome for the advertiser self-view (these pills only render for the
 * owner). Approved+live shows a green "Active" pill — on your own profile
 * "Sponsored" is redundant since every ad here is sponsored.
 */
function StatusPill({ status }: { status: NonNullable<AdRow['status']> | 'expired' }) {
  const map = {
    approved: { label: 'Active',   bg: 'rgba(16,185,129,0.92)' },  // emerald
    expired:  { label: 'Expired',  bg: 'rgba(71,85,105,0.9)' },    // slate
    pending:  { label: 'Pending',  bg: 'rgba(245,158,11,0.92)' },  // amber
    rejected: { label: 'Rejected', bg: 'rgba(220,38,38,0.92)' },   // red
    paused:   { label: 'Paused',   bg: 'rgba(71,85,105,0.9)' },    // slate
    draft:    { label: 'Draft',    bg: 'rgba(71,85,105,0.9)' },    // slate
  } as const;
  const entry = map[status] ?? map.draft;
  return (
    <View style={[s.pill, { backgroundColor: entry.bg }]}>
      <Text style={[s.pillText, { color: '#fff' }]}>{entry.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GUTTER,
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
    aspectRatio: 4 / 3,
    position: 'relative',
  },
  listCardImage: { width: '100%', height: '100%' },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    overflow: 'hidden',
    position: 'relative',
  },
  tileImage: { width: '100%', height: '100%' },
  tilePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTopLeft: {
    position: 'absolute',
    top: 6,
    left: 6,
  },
  tileBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  tileHeadline: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillSponsored: {
    backgroundColor: 'rgba(0,0,0,0.55)',
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
