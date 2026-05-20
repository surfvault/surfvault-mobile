import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  Alert,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// expo-image-manipulator is loaded dynamically (same defensive pattern the
// avatar uploader uses) so a missing native module on older dev clients
// doesn't crash the screen at import time. The require returns null and we
// fall back to the raw asset uri.
let ImageManipulator: any = null;
try { ImageManipulator = require('expo-image-manipulator'); } catch {}
import { useEffect } from 'react';
import {
  useCreateMyAdMediaPresignedUrlsMutation,
  useCreateMyAdMutation,
  useUpdateMyAdMutation,
  useGetSurfBreaksQuery,
} from '../store';
import { generateUUID } from '../helpers/uuid';

type Placement = 'content' | 'sidebar';
type CtaType = 'url' | 'tel';
type SurfBreak = { id: string; name: string };

// A creative slide can be a freshly-picked local image OR one already on
// S3 (when editing an existing campaign). Remote slides are kept verbatim
// on save; local slides get uploaded first.
type Creative = {
  uuid: string;
  uri: string;        // local file uri (new) OR remote https url (existing)
  type: string;       // jpg | png | webp
  remote?: boolean;   // true = already on S3, skip re-upload
};

/**
 * Advertiser variant of the Session tab + the campaign edit screen. Mobile
 * mirror of surfvault-web/src/pages/upload/CampaignUpload.jsx.
 *
 * Two modes:
 *   • Create (default): collects metadata, uploads creatives, POSTs /ads.
 *   • Edit (when `editingAd` is passed): prefills from the existing ad,
 *     shows "Save changes", PATCHes /ads/{id}. Changing any creative/copy
 *     field re-queues the ad to 'pending' server-side.
 *
 * `readOnly` reuses the exact layout for the admin review screen (opened from
 * a newCampaignSubmission notification): inputs are non-editable, the creative
 * grid loses its add/remove/set-thumbnail controls, and the submit button is
 * gone. Approve/Reject lives on the notification, not here.
 */
export default function CampaignUpload({
  editingAd,
  readOnly = false,
}: { editingAd?: any; readOnly?: boolean } = {}) {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const isEdit = !!editingAd && !readOnly;

  // Form state
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [clickUrl, setClickUrl] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaType, setCtaType] = useState<CtaType>('url');
  const [placement, setPlacement] = useState<Placement>('content');
  const [dailyCap, setDailyCap] = useState('3');
  const [showOnDiscover, setShowOnDiscover] = useState(true);
  const [surfBreakSearch, setSurfBreakSearch] = useState('');
  const [targetedBreaks, setTargetedBreaks] = useState<SurfBreak[]>([]);

  // Creatives — up to MAX_MEDIA slides. Order in this array becomes the
  // carousel sort order. `thumbnailIndex` marks the slide used wherever we
  // need one representative image (sidebar, profile gallery, in-feed
  // carousel's first visible slide).
  const MAX_MEDIA = 10;
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);

  // Submit
  const [submitting, setSubmitting] = useState(false);

  const [createMyAdMediaPresignedUrls] = useCreateMyAdMediaPresignedUrlsMutation();
  const [createMyAd] = useCreateMyAdMutation();
  const [updateMyAd] = useUpdateMyAdMutation();

  // Prefill from the existing ad when editing. Runs once on mount (the
  // edit screen passes a stable ad object). Existing media become remote
  // creatives keyed by their s3_key.
  useEffect(() => {
    if (!editingAd) return;
    setHeadline(editingAd.headline ?? '');
    setBody(editingAd.body ?? '');
    setClickUrl(editingAd.click_url ?? '');
    setCtaLabel(editingAd.cta_label ?? '');
    setCtaType(editingAd.cta_type === 'tel' ? 'tel' : 'url');
    setPlacement(editingAd.placement_key === 'sidebar' ? 'sidebar' : 'content');
    setDailyCap(String(editingAd.daily_impression_cap_per_user ?? 3));
    setShowOnDiscover(editingAd.show_on_discover !== false);
    // Targeted breaks: editingAd.surf_break_targets is [{id,name}] when the
    // backend includes it; fall back to empty (advertiser re-selects).
    if (Array.isArray(editingAd.surf_break_targets)) {
      setTargetedBreaks(editingAd.surf_break_targets);
    }
    const media = Array.isArray(editingAd.media) ? [...editingAd.media] : [];
    media.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const remoteCreatives: Creative[] = media.map((m: any) => ({
      uuid: m.id ?? generateUUID(),
      uri: m.s3_key,
      type: 'jpg',
      remote: true,
    }));
    setCreatives(remoteCreatives);
    // Thumbnail index = position of thumbnail_ad_media_id in the sorted list.
    if (editingAd.thumbnail_ad_media_id) {
      const idx = media.findIndex((m: any) => m.id === editingAd.thumbnail_ad_media_id);
      if (idx >= 0) setThumbnailIndex(idx);
    }
  }, [editingAd]);

  const { data: surfBreaksData } = useGetSurfBreaksQuery(
    { search: surfBreakSearch, limit: 10, continuationToken: 0 },
    { skip: surfBreakSearch.length < 2 },
  );
  const surfBreakResults: any[] = (surfBreaksData as any)?.results?.surfBreaks ?? [];

  const pickCreatives = useCallback(async () => {
    const remaining = MAX_MEDIA - creatives.length;
    if (remaining <= 0) {
      Alert.alert('Slide limit reached', `A campaign can have at most ${MAX_MEDIA} slides.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;

    // Transcode every picked image to JPEG. iOS picker returns HEIC by
    // default, and browser <img> tags can't render HEIC even though
    // expo-image (mobile) can — campaigns are viewed on both surfaces, so
    // mobile-only rendering is a bug. Same pattern the avatar uploader
    // uses (app/edit-profile/index.tsx). 0.85 quality keeps file sizes
    // sane while staying well above noticeable-loss territory.
    const newOnes = await Promise.all(
      result.assets.map(async (asset) => {
        let outputUri = asset.uri;
        if (ImageManipulator?.manipulateAsync) {
          try {
            const manipulated = await ImageManipulator.manipulateAsync(
              asset.uri,
              [],
              {
                compress: 0.85,
                format: ImageManipulator.SaveFormat?.JPEG ?? 'jpeg',
              },
            );
            outputUri = manipulated.uri;
          } catch (err) {
            // Best-effort: if manipulation fails (e.g. unsupported
            // format), fall through to the raw uri. The browser may
            // still fail to render the result, but at least submission
            // doesn't break entirely.
            console.warn('Image transcode failed, uploading original:', err);
          }
        }
        return { uri: outputUri, uuid: generateUUID(), type: 'jpg', remote: false };
      }),
    );
    setCreatives((prev) => [...prev, ...newOnes].slice(0, MAX_MEDIA));
  }, [creatives.length]);

  const removeCreativeAt = (idx: number) => {
    setCreatives((prev) => prev.filter((_, i) => i !== idx));
    setThumbnailIndex((prevIdx) => {
      if (idx === prevIdx) return 0;
      if (idx < prevIdx) return Math.max(0, prevIdx - 1);
      return prevIdx;
    });
  };

  const setAsThumbnail = (idx: number) => setThumbnailIndex(idx);

  const addBreak = (b: SurfBreak) => {
    if (!b?.id || targetedBreaks.find((x) => x.id === b.id)) return;
    setTargetedBreaks((prev) => [...prev, b]);
    setSurfBreakSearch('');
  };
  const removeBreak = (id: string) => setTargetedBreaks((prev) => prev.filter((b) => b.id !== id));

  // At least one targeting surface — without it `getAds` will never select
  // this ad, so we block submit instead of shipping a dead row.
  const hasReach = targetedBreaks.length > 0 || showOnDiscover;

  // Submit gates: headline + CTA destination + at least one creative + at
  // least one targeting surface (breaks OR Discover).
  const canSubmit =
    headline.trim().length > 0 &&
    clickUrl.trim().length > 0 &&
    creatives.length > 0 &&
    hasReach &&
    !submitting;

  const submit = useCallback(async () => {
    if (!canSubmit || creatives.length === 0) return;
    setSubmitting(true);
    try {
      // Only NEW (local) creatives need a presigned URL + upload. Remote
      // creatives (already on S3 from a prior submission) keep their URL.
      const newCreatives = creatives.filter((c) => !c.remote);
      const urlByUuid = new Map<string, string>();
      for (const c of creatives) {
        if (c.remote) urlByUuid.set(c.uuid, c.uri); // existing S3 url
      }

      if (newCreatives.length) {
        const presigned = await createMyAdMediaPresignedUrls({
          files: newCreatives.map((c) => ({ file_uuid: c.uuid, file_type: c.type })),
        }).unwrap();
        const mappings = presigned?.results?.idMappedPresignedUrls ?? [];
        const byUuid = new Map(mappings.map((m) => [m.file_uuid, m]));

        await Promise.all(newCreatives.map(async (c) => {
          const m = byUuid.get(c.uuid);
          if (!m?.url) throw new Error(`Failed to provision upload URL for slide ${c.uuid}`);
          const blobResp = await fetch(c.uri);
          const blob = await blobResp.blob();
          const putResp = await fetch(m.url, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': `image/${c.type === 'jpg' ? 'jpeg' : c.type}` },
          });
          if (!putResp.ok) throw new Error(`S3 upload failed: ${putResp.status}`);
          urlByUuid.set(c.uuid, m.media_url);
        }));
      }

      // media_urls preserves display order across both remote + new slides.
      const mediaUrls = creatives.map((c) => urlByUuid.get(c.uuid)!).filter(Boolean);

      const payload = {
        placement_key: placement,
        media_type: 'image' as const,
        media_urls: mediaUrls,
        thumbnail_index: thumbnailIndex,
        click_url: clickUrl.trim() || null,
        headline: headline.trim(),
        body: body.trim() || null,
        cta_label: ctaLabel.trim() || null,
        cta_type: ctaType,
        daily_impression_cap_per_user: Number(dailyCap) || 3,
        show_on_discover: showOnDiscover,
        surf_break_ids: targetedBreaks.map((b) => b.id),
      };

      if (isEdit) {
        await updateMyAd({ adId: editingAd.id, payload }).unwrap();
        Alert.alert(
          'Changes saved',
          'Edits to creative or copy send the campaign back for review.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
        return;
      }

      await createMyAd(payload as any).unwrap();

      // Reset the form so the Campaign tab is clean if the advertiser
      // swipes back to it later (tab navigator keeps the screen mounted).
      setHeadline('');
      setBody('');
      setClickUrl('');
      setCtaLabel('');
      setCtaType('url');
      setPlacement('content');
      setDailyCap('3');
      setShowOnDiscover(true);
      setTargetedBreaks([]);
      setSurfBreakSearch('');
      setCreatives([]);
      setThumbnailIndex(0);

      Alert.alert(
        'Submitted for review',
        'Your campaign is in the admin queue. You\'ll be notified when it\'s approved.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/profile') }],
      );
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Failed to submit campaign.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit, creatives, thumbnailIndex, placement, clickUrl, headline, body, ctaLabel, ctaType,
    dailyCap, showOnDiscover, targetedBreaks, isEdit, editingAd, createMyAdMediaPresignedUrls,
    createMyAd, updateMyAd, router,
  ]);

  const bg = isDark ? '#000' : '#fff';
  const text = isDark ? '#fff' : '#111827';
  const muted = isDark ? '#9ca3af' : '#6b7280';
  const inputBg = isDark ? '#1f2937' : '#f3f4f6';
  const border = isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: bg }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.headerRow}>
          {(isEdit || readOnly) && (
            <Pressable onPress={() => router.back()} hitSlop={8} style={{ marginRight: 12 }}>
              <Ionicons name="chevron-back" size={26} color={text} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: text }]}>
              {readOnly ? 'Review Campaign' : isEdit ? 'Edit Campaign' : 'New Campaign'}
            </Text>
            <Text style={[s.subtitle, { color: muted }]}>
              {readOnly
                ? 'Read-only. Approve or reject from the notification.'
                : isEdit
                ? 'Changing creative or copy sends it back for review.'
                : 'Approved campaigns surface in the SurfVault feed.'}
            </Text>
            {readOnly && (editingAd?.advertiser_handle || editingAd?.partner_company_name) && (
              <Text style={[s.subtitle, { color: muted, marginTop: 2 }]}>
                {editingAd.partner_company_name || 'Advertiser'}
                {editingAd.advertiser_handle ? ` · @${editingAd.advertiser_handle}` : ''}
              </Text>
            )}
          </View>
          {readOnly ? (
            editingAd?.status ? <StatusPill status={editingAd.status} /> : null
          ) : (
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={[s.submitBtn, { backgroundColor: canSubmit ? '#0ea5e9' : (isDark ? '#1f2937' : '#e5e7eb') }]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[s.submitBtnText, { color: canSubmit ? '#fff' : muted }]}>{isEdit ? 'Save' : 'Submit'}</Text>
              )}
            </Pressable>
          )}
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          // Swiping down dismisses the keyboard mid-drag (iOS) or releases it
          // on touch release (Android) — same affordance Mail / Instagram use.
          // "interactive" gives the iOS pull-to-dismiss feel; falls back to
          // "on-drag" on Android.
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          {(isEdit || readOnly) && editingAd?.status === 'rejected' && editingAd?.rejection_reason ? (
            <View style={[s.rejectBanner, { backgroundColor: isDark ? 'rgba(220,38,38,0.12)' : '#fef2f2', borderColor: isDark ? 'rgba(220,38,38,0.3)' : '#fecaca' }]}>
              <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
              <Text style={[s.rejectBannerText, { color: isDark ? '#fca5a5' : '#991b1b' }]}>
                Rejected: {editingAd.rejection_reason}
              </Text>
            </View>
          ) : null}

          {/* Headline */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>Headline *</Text>
            <TextInput
              value={headline}
              onChangeText={setHeadline}
              editable={!readOnly}
              maxLength={80}
              placeholder="e.g. New 7'2&quot; midlength in stock"
              placeholderTextColor={muted}
              style={[s.input, { backgroundColor: inputBg, color: text }]}
            />
          </View>

          {/* Body */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>Description</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              editable={!readOnly}
              maxLength={240}
              multiline
              placeholder="One or two sentences. Shown under the headline."
              placeholderTextColor={muted}
              style={[s.input, s.multiline, { backgroundColor: inputBg, color: text }]}
            />
          </View>

          {/* Placement */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>Placement</Text>
            <View style={s.chipRow}>
              <Chip active={placement === 'content'} disabled={readOnly} onPress={() => setPlacement('content')} text="In-feed" isDark={isDark} />
              <Chip active={placement === 'sidebar'} disabled={readOnly} onPress={() => setPlacement('sidebar')} text="Sidebar" isDark={isDark} />
            </View>
            {placement === 'sidebar' && (
              <View
                style={[
                  s.placementNote,
                  {
                    backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb',
                    borderColor: isDark ? 'rgba(245,158,11,0.25)' : '#fde68a',
                  },
                ]}
              >
                <Ionicons name="information-circle-outline" size={14} color="#f59e0b" />
                <Text style={[s.placementNoteText, { color: isDark ? '#fcd34d' : '#92400e' }]}>
                  Sidebar campaigns only display on the web app — mobile has no sidebar surface.
                </Text>
              </View>
            )}
          </View>

          {/* CTA */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>Call to action *</Text>
            <View style={s.chipRow}>
              <Chip active={ctaType === 'url'} disabled={readOnly} onPress={() => setCtaType('url')} text="Link" isDark={isDark} />
              <Chip active={ctaType === 'tel'} disabled={readOnly} onPress={() => setCtaType('tel')} text="Phone" isDark={isDark} />
            </View>
            <TextInput
              value={clickUrl}
              onChangeText={setClickUrl}
              editable={!readOnly}
              keyboardType={ctaType === 'tel' ? 'phone-pad' : 'url'}
              autoCapitalize="none"
              placeholder={ctaType === 'tel' ? '+1 555 555 5555' : 'https://example.com'}
              placeholderTextColor={muted}
              style={[s.input, { backgroundColor: inputBg, color: text, marginTop: 8 }]}
            />
            <TextInput
              value={ctaLabel}
              onChangeText={setCtaLabel}
              editable={!readOnly}
              maxLength={32}
              placeholder="Button text — e.g. Shop now"
              placeholderTextColor={muted}
              style={[s.input, { backgroundColor: inputBg, color: text, marginTop: 8 }]}
            />
          </View>

          {/* Surf break targeting */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>
              {readOnly ? 'Targeted surf breaks' : 'Target surf breaks (optional)'}
            </Text>
            {!readOnly && (
              <TextInput
                value={surfBreakSearch}
                onChangeText={setSurfBreakSearch}
                placeholder="Search a break to target…"
                placeholderTextColor={muted}
                autoCapitalize="none"
                style={[s.input, { backgroundColor: inputBg, color: text }]}
              />
            )}
            {!readOnly && surfBreakSearch.length >= 2 && surfBreakResults.length > 0 && (
              <View style={[s.searchResults, { backgroundColor: inputBg, borderColor: border }]}>
                {surfBreakResults.map((b: any) => (
                  <Pressable
                    key={b.id}
                    onPress={() => addBreak({ id: b.id, name: b.name })}
                    style={s.searchResultRow}
                  >
                    <Text style={{ color: text, fontSize: 14 }}>{b.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {targetedBreaks.length > 0 ? (
              <View style={s.targetChipRow}>
                {targetedBreaks.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={readOnly ? undefined : () => removeBreak(b.id)}
                    disabled={readOnly}
                    style={[s.targetChip, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}
                  >
                    <Text style={{ color: isDark ? '#7dd3fc' : '#0369a1', fontSize: 12 }}>
                      {b.name}{readOnly ? '' : ' ×'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : readOnly ? (
              <Text style={[s.hint, { color: muted, marginTop: 0 }]}>
                No specific breaks — relies on Discover / service area.
              </Text>
            ) : null}
            {!readOnly && (
              <Text style={[s.hint, { color: muted }]}>
                Leave blank to fall back to your service area (set in Edit Profile).
              </Text>
            )}
          </View>

          {/* Daily cap — bounded chip selection mirrors the Placement / CTA
              chip rows. Caps user-side at 10; admin can set higher for
              premium partnerships. Backend clamp is still 1-100. */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>Daily impression cap per user</Text>
            <View style={s.chipRow}>
              {(['1', '3', '5', '10'] as const).map((n) => (
                <Chip
                  key={n}
                  active={dailyCap === n}
                  disabled={readOnly}
                  onPress={() => setDailyCap(n)}
                  text={n === '1' ? '1 · once/day' : n === '3' ? '3 · default' : n === '10' ? '10 · max' : n}
                  isDark={isDark}
                />
              ))}
            </View>
          </View>

          {/* Show on discover */}
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: text, marginBottom: 0 }]}>Show on Discover</Text>
              <Text style={{ color: muted, fontSize: 12, marginTop: 2 }}>
                Surface this campaign on the home feed in addition to break-specific contexts.
              </Text>
            </View>
            <Switch
              value={showOnDiscover}
              onValueChange={setShowOnDiscover}
              disabled={readOnly}
              trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#0ea5e9' }}
            />
          </View>
          {!readOnly && !hasReach && (
            <View
              style={[
                s.placementNote,
                {
                  backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb',
                  borderColor: isDark ? 'rgba(245,158,11,0.25)' : '#fde68a',
                  marginBottom: 12,
                },
              ]}
            >
              <Ionicons name="information-circle-outline" size={14} color="#f59e0b" />
              <Text style={[s.placementNoteText, { color: isDark ? '#fcd34d' : '#92400e' }]}>
                Pick at least one surf break to target, or turn on Show on Discover — otherwise this campaign won't appear anywhere.
              </Text>
            </View>
          )}

          {/* Creative — last, matching the session/board create pattern (all
              config first, media at the bottom). Up to MAX_MEDIA slides;
              tap a tile to set it as the thumbnail. */}
          <View style={s.field}>
            <View style={s.creativeHeader}>
              <Text style={[s.label, { color: text, marginBottom: 0 }]}>
                {readOnly ? 'Creative' : 'Creative *'} {creatives.length > 0 && (
                  <Text style={{ color: muted, fontWeight: '400' }}>
                    {readOnly ? `(${creatives.length})` : `(${creatives.length} / ${MAX_MEDIA})`}
                  </Text>
                )}
              </Text>
              {!readOnly && creatives.length > 0 && creatives.length < MAX_MEDIA && (
                <Pressable onPress={pickCreatives} hitSlop={8}>
                  <Text style={{ color: '#0ea5e9', fontSize: 13, fontWeight: '600' }}>+ Add more</Text>
                </Pressable>
              )}
            </View>

            {creatives.length === 0 ? (
              <Pressable
                onPress={readOnly ? undefined : pickCreatives}
                disabled={readOnly}
                style={[
                  s.creativePicker,
                  { backgroundColor: inputBg, borderColor: border },
                ]}
              >
                <View style={s.creativePlaceholder}>
                  <Ionicons name="image-outline" size={32} color={muted} />
                  <Text style={[s.creativePlaceholderText, { color: muted }]}>
                    {readOnly ? 'No creatives' : 'Tap to select images'}
                  </Text>
                  {!readOnly && (
                    <Text style={[s.creativeHint, { color: muted }]}>
                      Up to {MAX_MEDIA} slides · JPG, PNG, or WEBP
                    </Text>
                  )}
                </View>
              </Pressable>
            ) : (
              <>
                <Text style={[s.hint, { color: muted, marginBottom: 8 }]}>
                  {readOnly
                    ? 'The slide marked Thumbnail is shown in the sidebar, profile gallery card, and as the first slide in the in-feed carousel.'
                    : 'Tap a slide to set it as the thumbnail — that\'s the image shown in the sidebar, profile gallery card, and as the first slide in the in-feed carousel.'}
                </Text>
                <View style={s.slideGrid}>
                  {creatives.map((c, idx) => {
                    const isThumb = idx === thumbnailIndex;
                    return (
                      <Pressable
                        key={c.uuid}
                        onPress={readOnly ? undefined : () => setAsThumbnail(idx)}
                        disabled={readOnly}
                        style={[
                          s.slideTile,
                          {
                            borderColor: isThumb ? '#0ea5e9' : border,
                            borderWidth: isThumb ? 2 : StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <Image source={{ uri: c.uri }} style={s.slideTileImage} contentFit="cover" />
                        {isThumb && (
                          <View style={s.thumbnailBadge}>
                            <Text style={s.thumbnailBadgeText}>Thumbnail</Text>
                          </View>
                        )}
                        <View style={s.slideIndexBadge}>
                          <Text style={s.slideIndexText}>{idx + 1}</Text>
                        </View>
                        {!readOnly && (
                          <Pressable
                            onPress={() => removeCreativeAt(idx)}
                            hitSlop={6}
                            style={s.slideRemoveBtn}
                          >
                            <Ionicons name="close" size={14} color="#fff" />
                          </Pressable>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Chip({
  active,
  onPress,
  text,
  isDark,
  disabled = false,
}: {
  active: boolean;
  onPress: () => void;
  text: string;
  isDark: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        s.chip,
        {
          backgroundColor: active ? '#0ea5e9' : (isDark ? '#1f2937' : '#f3f4f6'),
        },
      ]}
    >
      <Text style={[s.chipText, { color: active ? '#fff' : (isDark ? '#d1d5db' : '#374151') }]}>
        {text}
      </Text>
    </Pressable>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    pending: { bg: 'rgba(245,158,11,0.18)', fg: '#b45309' },
    approved: { bg: 'rgba(16,185,129,0.18)', fg: '#047857' },
    rejected: { bg: 'rgba(239,68,68,0.18)', fg: '#b91c1c' },
    paused: { bg: 'rgba(148,163,184,0.22)', fg: '#475569' },
    draft: { bg: 'rgba(148,163,184,0.22)', fg: '#475569' },
  };
  const c = map[status] || map.draft;
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {status}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  submitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 76,
    alignItems: 'center',
  },
  submitBtnText: { fontSize: 14, fontWeight: '700' },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: 13, fontWeight: '600' },
  placementNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  placementNoteText: { flex: 1, fontSize: 11, lineHeight: 15 },
  hint: { fontSize: 11, marginTop: 6 },
  creativePicker: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    aspectRatio: 16 / 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creativePreview: { width: '100%', height: '100%' },
  creativePlaceholder: { alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  creativePlaceholderText: { fontSize: 14, fontWeight: '600' },
  creativeHint: { fontSize: 11 },
  removeCreative: { marginTop: 6, alignSelf: 'flex-start' },
  creativeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  slideGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slideTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  slideTileImage: { width: '100%', height: '100%' },
  thumbnailBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#0ea5e9',
  },
  thumbnailBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  slideIndexBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  slideIndexText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  slideRemoveBtn: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  rejectBannerText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  searchResults: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 200,
  },
  searchResultRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  targetChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  targetChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
});
