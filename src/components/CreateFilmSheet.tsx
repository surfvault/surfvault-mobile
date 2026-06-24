import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useCreateFilmMutation, useTagFilmSurfBreakMutation } from '../store';
import { useTrackedPush } from '../context/NavigationContext';

/**
 * Best-effort YouTube snippet (publish date + description) via the Data API v3.
 * oEmbed doesn't expose either. Needs extra.youtubeApiKey (YouTube Data API
 * enabled). Returns { filmDate: 'YYYY-MM-DD'|null, description } or null — never throws.
 */
async function fetchYoutubeSnippet(videoId: string): Promise<{ filmDate: string | null; description: string } | null> {
  const apiKey = Constants.expoConfig?.extra?.youtubeApiKey as string | undefined;
  if (!apiKey || !videoId) return null;
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`);
    if (!r.ok) return null;
    const d = await r.json();
    const snip = d?.items?.[0]?.snippet;
    if (!snip) return null;
    const pub = snip.publishedAt;
    return {
      filmDate: typeof pub === 'string' && pub.length >= 10 ? pub.slice(0, 10) : null,
      description: typeof snip.description === 'string' ? snip.description.trim().slice(0, 5000) : '',
    };
  } catch {
    return null;
  }
}

/** Parse a bare 11-char id or any common YouTube URL into the video id. */
export function parseYoutubeId(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1, 12);
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/**
 * Add-a-film sheet. Paste a YouTube link → resolve the id + fetch title/poster
 * client-side via oEmbed (the create handler is VPC-bound, no egress). On a
 * duplicate the API returns 409 + existingFilmId and we open the canonical
 * record. On success we navigate to the new film detail page.
 */
export default function CreateFilmSheet({
  visible,
  onClose,
  defaultSurfBreakId,
  defaultBreakName,
}: {
  visible: boolean;
  onClose: () => void;
  // When opened from a surf-break page, the new film is auto-tagged to this
  // break (private suggestion — the exact spot stays hidden until verified).
  defaultSurfBreakId?: string;
  defaultBreakName?: string;
}) {
  const isDark = useColorScheme() === 'dark';
  const trackedPush = useTrackedPush();
  const [createFilm, { isLoading }] = useCreateFilmMutation();
  const [tagBreak] = useTagFilmSurfBreakMutation();

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [filmDate, setFilmDate] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const bg = isDark ? '#000' : '#fff';
  const text = isDark ? '#fff' : '#0f172a';
  const sub = isDark ? '#9ca3af' : '#64748b';
  const inputBg = isDark ? '#0f172a' : '#f1f5f9';
  // Location note gets a sky tint to set it apart from the input fields.
  const noteBg = isDark ? 'rgba(14,165,233,0.10)' : '#eff6ff';
  const noteBorder = isDark ? 'rgba(14,165,233,0.28)' : '#bae6fd';
  const headerBorder = isDark ? '#1f2937' : '#e5e7eb';

  const reset = () => { setUrl(''); setTitle(''); setDescription(''); setPosterUrl(null); setVideoId(null); setFilmDate(null); };
  const close = () => { reset(); onClose(); };

  const resolve = async () => {
    const id = parseYoutubeId(url);
    if (!id) { Alert.alert('Invalid link', 'Enter a valid YouTube link.'); return; }
    setVideoId(id);
    setResolving(true);
    try {
      const resp = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data?.title && !title) setTitle(data.title);
        setPosterUrl(data?.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
      } else {
        setPosterUrl(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
      }
      // Publish date + description via the Data API (best-effort). Description
      // only fills if the user hasn't typed one (mirrors the title autofill).
      const snip = await fetchYoutubeSnippet(id);
      setFilmDate(snip?.filmDate ?? null);
      if (snip?.description) setDescription((prev) => prev || snip.description);
    } catch {
      setPosterUrl(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    } finally {
      setResolving(false);
    }
  };

  const submit = async () => {
    const id = videoId || parseYoutubeId(url);
    if (!id) { Alert.alert('Invalid link', 'Enter a valid YouTube link.'); return; }
    if (!title.trim()) { Alert.alert('Add a title', 'Give the film a title.'); return; }
    try {
      const res = await createFilm({
        youtube_video_id: id,
        title: title.trim(),
        description: description.trim(),
        poster_url: posterUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        film_date: filmDate || undefined,
      }).unwrap();
      const filmId = res?.results?.filmId;
      // Auto-tag the originating break (best-effort — never blocks navigation).
      if (filmId && defaultSurfBreakId) {
        try {
          await tagBreak({ filmId, surfBreakId: defaultSurfBreakId, action: 'add' }).unwrap();
        } catch {}
      }
      close();
      if (filmId) trackedPush(`/film/${filmId}` as any);
    } catch (e: any) {
      const existingFilmId = e?.data?.existingFilmId;
      if (e?.status === 409 && existingFilmId) {
        close();
        trackedPush(`/film/${existingFilmId}` as any);
        return;
      }
      Alert.alert('Failed to add film', e?.data?.message || 'Please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: bg }}>
        <View style={[styles.header, { borderBottomColor: headerBorder }]}>
          <View style={styles.headerIcon}>
            <Ionicons name="play" size={15} color="#fff" style={{ marginLeft: 1 }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: text }]}>Add a surf film</Text>
            <Text style={[styles.headerSub, { color: sub }]}>Catalogue a YouTube edit — help others discover it.</Text>
          </View>
          <Pressable onPress={close} hitSlop={10} style={[styles.closeBtn, { backgroundColor: inputBg }]}>
            <Ionicons name="close" size={20} color={text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {defaultBreakName ? (
            <View style={[styles.breakNote, { backgroundColor: noteBg, borderColor: noteBorder }]}>
              <Ionicons name="location" size={16} color="#0ea5e9" style={{ marginTop: 1 }} />
              <Text style={[styles.breakNoteText, { color: sub }]}>
                We'll tag <Text style={{ color: text, fontWeight: '700' }}>{defaultBreakName.replaceAll('_', ' ')}</Text> as the location — change or remove it on the next screen. The exact break stays private until verified.
              </Text>
            </View>
          ) : null}
          <Text style={[styles.label, { color: text }]}>YouTube link</Text>
          <View style={styles.row}>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://youtube.com/watch?v=…"
              placeholderTextColor={sub}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { backgroundColor: inputBg, color: text, flex: 1 }]}
            />
            <Pressable onPress={resolve} style={styles.fetchBtn}>
              {resolving ? <ActivityIndicator color="#fff" /> : <Text style={styles.fetchBtnText}>Fetch</Text>}
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: sub }]}>We embed the video from YouTube — we never host it.</Text>

          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
          ) : null}

          <Text style={[styles.label, { color: text, marginTop: 16 }]}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Film title"
            placeholderTextColor={sub}
            maxLength={200}
            style={[styles.input, { backgroundColor: inputBg, color: text }]}
          />

          <Text style={[styles.label, { color: text, marginTop: 16 }]}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What's this film about?"
            placeholderTextColor={sub}
            maxLength={5000}
            multiline
            style={[styles.input, { backgroundColor: inputBg, color: text, height: 90, textAlignVertical: 'top' }]}
          />

          <Pressable onPress={submit} disabled={isLoading} style={[styles.submitBtn, isLoading && { opacity: 0.6 }]}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Add film</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerIcon: { width: 40, height: 28, borderRadius: 8, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  breakNote: { flexDirection: 'row', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16, alignItems: 'flex-start' },
  breakNoteText: { flex: 1, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  fetchBtn: { backgroundColor: '#0ea5e9', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  fetchBtnText: { color: '#fff', fontWeight: '700' },
  hint: { fontSize: 12, marginTop: 6 },
  poster: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, marginTop: 14, backgroundColor: '#000' },
  submitBtn: { backgroundColor: '#0ea5e9', borderRadius: 12, alignItems: 'center', paddingVertical: 14, marginTop: 22 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
