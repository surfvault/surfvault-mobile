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
import {
  useCreateMyAdMediaPresignedUrlsMutation,
  useCreateMyAdMutation,
  useGetSurfBreaksQuery,
} from '../store';
import { generateUUID } from '../helpers/uuid';

type Placement = 'content' | 'sidebar';
type CtaType = 'url' | 'tel';
type SurfBreak = { id: string; name: string };

/**
 * Advertiser variant of the Session tab. Mobile mirror of
 * surfvault-web/src/pages/upload/CampaignUpload.jsx — collects campaign
 * metadata, mints a presigned URL, uploads the creative, then POSTs /ads
 * (status forced to 'pending' by the backend so admin moderates).
 */
export default function CampaignUpload() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

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

  // Creative
  const [creative, setCreative] = useState<{ uri: string; uuid: string; type: string } | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);

  const [createMyAdMediaPresignedUrls] = useCreateMyAdMediaPresignedUrlsMutation();
  const [createMyAd] = useCreateMyAdMutation();

  const { data: surfBreaksData } = useGetSurfBreaksQuery(
    { search: surfBreakSearch, limit: 10, continuationToken: 0 },
    { skip: surfBreakSearch.length < 2 },
  );
  const surfBreakResults: any[] = (surfBreaksData as any)?.results?.surfBreaks ?? [];

  const pickCreative = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    // ImagePicker doesn't always return the original file extension, so we
    // infer from the mime type or fall back to jpg. Backend accepts these
    // verbatim into the S3 key (e.g. `${uuid}.jpg`).
    const mime = asset.mimeType || 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    setCreative({ uri: asset.uri, uuid: generateUUID(), type: ext });
  }, []);

  const addBreak = (b: SurfBreak) => {
    if (!b?.id || targetedBreaks.find((x) => x.id === b.id)) return;
    setTargetedBreaks((prev) => [...prev, b]);
    setSurfBreakSearch('');
  };
  const removeBreak = (id: string) => setTargetedBreaks((prev) => prev.filter((b) => b.id !== id));

  const canSubmit = headline.trim().length > 0 && !!creative && !submitting;

  const submit = useCallback(async () => {
    if (!canSubmit || !creative) return;
    setSubmitting(true);
    try {
      const presigned = await createMyAdMediaPresignedUrls({
        files: [{ file_uuid: creative.uuid, file_type: creative.type }],
      }).unwrap();
      const mapping = presigned?.results?.idMappedPresignedUrls?.[0];
      if (!mapping?.url || !mapping?.media_url) {
        throw new Error('Failed to provision upload URL');
      }

      // Direct PUT to S3. fetch + blob works on iOS + Android; matches the
      // existing pattern used in edit-profile/index.tsx for avatar upload.
      const blobResp = await fetch(creative.uri);
      const blob = await blobResp.blob();
      const putResp = await fetch(mapping.url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': `image/${creative.type === 'jpg' ? 'jpeg' : creative.type}` },
      });
      if (!putResp.ok) {
        throw new Error(`S3 upload failed: ${putResp.status}`);
      }

      await createMyAd({
        placement_key: placement,
        media_type: 'image',
        media_url: mapping.media_url,
        click_url: clickUrl.trim() || null,
        headline: headline.trim(),
        body: body.trim() || null,
        cta_label: ctaLabel.trim() || null,
        cta_type: ctaType,
        daily_impression_cap_per_user: Number(dailyCap) || 3,
        show_on_discover: showOnDiscover,
        surf_break_ids: targetedBreaks.map((b) => b.id),
      }).unwrap();

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
    canSubmit, creative, placement, clickUrl, headline, body, ctaLabel, ctaType,
    dailyCap, showOnDiscover, targetedBreaks, createMyAdMediaPresignedUrls, createMyAd, router,
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
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: text }]}>New Campaign</Text>
            <Text style={[s.subtitle, { color: muted }]}>
              Approved campaigns surface in the SurfVault feed.
            </Text>
          </View>
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={[s.submitBtn, { backgroundColor: canSubmit ? '#0ea5e9' : (isDark ? '#1f2937' : '#e5e7eb') }]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[s.submitBtnText, { color: canSubmit ? '#fff' : muted }]}>Submit</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Headline */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>Headline *</Text>
            <TextInput
              value={headline}
              onChangeText={setHeadline}
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
              <Chip active={placement === 'content'} onPress={() => setPlacement('content')} text="In-feed" isDark={isDark} />
              <Chip active={placement === 'sidebar'} onPress={() => setPlacement('sidebar')} text="Sidebar" isDark={isDark} />
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
            <Text style={[s.label, { color: text }]}>Call to action</Text>
            <View style={s.chipRow}>
              <Chip active={ctaType === 'url'} onPress={() => setCtaType('url')} text="Link" isDark={isDark} />
              <Chip active={ctaType === 'tel'} onPress={() => setCtaType('tel')} text="Phone" isDark={isDark} />
            </View>
            <TextInput
              value={clickUrl}
              onChangeText={setClickUrl}
              keyboardType={ctaType === 'tel' ? 'phone-pad' : 'url'}
              autoCapitalize="none"
              placeholder={ctaType === 'tel' ? '+1 555 555 5555' : 'https://example.com'}
              placeholderTextColor={muted}
              style={[s.input, { backgroundColor: inputBg, color: text, marginTop: 8 }]}
            />
            <TextInput
              value={ctaLabel}
              onChangeText={setCtaLabel}
              maxLength={32}
              placeholder="Button text — e.g. Shop now"
              placeholderTextColor={muted}
              style={[s.input, { backgroundColor: inputBg, color: text, marginTop: 8 }]}
            />
          </View>

          {/* Surf break targeting */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>Target surf breaks (optional)</Text>
            <TextInput
              value={surfBreakSearch}
              onChangeText={setSurfBreakSearch}
              placeholder="Search a break to target…"
              placeholderTextColor={muted}
              autoCapitalize="none"
              style={[s.input, { backgroundColor: inputBg, color: text }]}
            />
            {surfBreakSearch.length >= 2 && surfBreakResults.length > 0 && (
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
            {targetedBreaks.length > 0 && (
              <View style={s.targetChipRow}>
                {targetedBreaks.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => removeBreak(b.id)}
                    style={[s.targetChip, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}
                  >
                    <Text style={{ color: isDark ? '#7dd3fc' : '#0369a1', fontSize: 12 }}>
                      {b.name} ×
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={[s.hint, { color: muted }]}>
              Leave blank to fall back to your service area (set in Edit Profile).
            </Text>
          </View>

          {/* Daily cap */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>Daily impression cap per user</Text>
            <TextInput
              value={dailyCap}
              onChangeText={setDailyCap}
              keyboardType="number-pad"
              placeholder="3"
              placeholderTextColor={muted}
              style={[s.input, { backgroundColor: inputBg, color: text }]}
            />
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
              trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#0ea5e9' }}
            />
          </View>

          {/* Creative — last, matching the session/board create pattern (all
              config first, media at the bottom). */}
          <View style={s.field}>
            <Text style={[s.label, { color: text }]}>Creative *</Text>
            <Pressable
              onPress={pickCreative}
              style={[
                s.creativePicker,
                { backgroundColor: inputBg, borderColor: border },
              ]}
            >
              {creative ? (
                <Image source={{ uri: creative.uri }} style={s.creativePreview} contentFit="cover" />
              ) : (
                <View style={s.creativePlaceholder}>
                  <Ionicons name="image-outline" size={32} color={muted} />
                  <Text style={[s.creativePlaceholderText, { color: muted }]}>
                    Tap to select image
                  </Text>
                  <Text style={[s.creativeHint, { color: muted }]}>
                    JPG, PNG, or WEBP
                  </Text>
                </View>
              )}
            </Pressable>
            {creative && (
              <Pressable onPress={() => setCreative(null)} style={s.removeCreative}>
                <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>Remove</Text>
              </Pressable>
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
}: {
  active: boolean;
  onPress: () => void;
  text: string;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
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
