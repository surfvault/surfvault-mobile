import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { safeShare } from '../../src/helpers/share';
import { getViewerHash } from '../../src/helpers/viewerHash';
import {
  useGetFilmQuery,
  useUpdateFilmMutation,
  useDeleteFilmMutation,
  useConfirmFilmParticipantMutation,
  useConfirmFilmSessionMutation,
  useClaimFilmCreatorMutation,
  useVerifyFilmCheckMutation,
  useVerifyFilmApplyMutation,
  useCreateFilmViewReportMutation,
  useReportFilmMutation,
} from '../../src/store';
import { useUser } from '../../src/context/UserProvider';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import ScreenHeader from '../../src/components/ScreenHeader';
import UserAvatar from '../../src/components/UserAvatar';
import { formatSessionDate } from '../../src/helpers/dateTime';
import ActionSheet, { type ActionSheetSection } from '../../src/components/ActionSheet';
import FilmTagSheet from '../../src/components/FilmTagSheet';

// In-memory dedup so a same-launch revisit doesn't double-count (mirrors boards).
const viewedFilmIds = new Set<string>();

// US → state/region, elsewhere → country; underscores → spaces, title-ish.
const regionLabel = (r: any): string => {
  const raw = r?.country_code === 'US' ? r?.region : (r?.country || r?.region);
  // Lowercase first so DB UPPER-case regions (e.g. "FLORIDA") title-case to
  // "Florida" rather than staying all-caps — matches web's filmPlaceLabel.
  return String(raw || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

const REPORT_REASONS: { key: string; label: string }[] = [
  { key: 'inappropriate', label: 'Inappropriate or offensive' },
  { key: 'misattribution', label: 'Wrong creator / mis-credited' },
  { key: 'blown_spot', label: 'Exposes a hidden surf spot' },
  { key: 'copyright', label: 'Copyright / IP' },
  { key: 'spam', label: 'Spam or misleading' },
  { key: 'other', label: 'Other' },
];

export default function FilmDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const filmId = String(id);
  const isDark = useColorScheme() === 'dark';
  const { width } = useWindowDimensions();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const { user } = useUser();
  const requireAuth = useRequireAuth();

  const { data, isLoading, isError } = useGetFilmQuery({ filmId }, { skip: !filmId });
  const film = data?.results?.film;
  const participants = useMemo(() => data?.results?.participants ?? [], [data]);
  const boards = data?.results?.boards ?? [];
  const sessions = data?.results?.sessions ?? [];
  const suggestedBreaks = data?.results?.suggestedBreaks ?? [];
  const canEdit = !!data?.results?.viewerCanEdit;
  const viewerCanVerify = !!data?.results?.viewerCanVerify;
  const viewerCanReveal = !!data?.results?.viewerCanReveal;

  const [deleteFilm] = useDeleteFilmMutation();
  const [updateFilm] = useUpdateFilmMutation();
  const [confirmParticipant] = useConfirmFilmParticipantMutation();
  const [confirmSession] = useConfirmFilmSessionMutation();
  const [reportFilm] = useReportFilmMutation();
  const [reportFilmView] = useCreateFilmViewReportMutation();
  const [claimFilm] = useClaimFilmCreatorMutation();
  const [verifyCheck] = useVerifyFilmCheckMutation();
  const [verifyApply] = useVerifyFilmApplyMutation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  // ---- Inline title / description editing (editors only) ----
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const startTitleEdit = () => { if (!canEdit) return; setTitleDraft(film?.title || ''); setEditingTitle(true); };
  const saveTitle = async () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (!next || next === film?.title) return;
    try { await updateFilm({ filmId, payload: { title: next } }).unwrap(); } catch { Alert.alert('Failed to save title'); }
  };
  const startDescEdit = () => { if (!canEdit) return; setDescDraft(film?.description || ''); setEditingDesc(true); };
  const saveDesc = async () => {
    setEditingDesc(false);
    const next = descDraft.trim();
    if (next === (film?.description || '')) return;
    try { await updateFilm({ filmId, payload: { description: next } }).unwrap(); } catch { Alert.alert('Failed to save description'); }
  };

  // ---- Creator verification (description-code) ----
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  // idle | claiming | checking | applying | notfound | error
  const [verifyState, setVerifyState] = useState<'idle' | 'claiming' | 'checking' | 'applying' | 'notfound' | 'error'>('idle');

  // Record a film view (3s dwell, deduped). Skip editors so self-views don't inflate.
  useEffect(() => {
    if (!film?.id || canEdit) return;
    if (viewedFilmIds.has(film.id)) return;
    const t = setTimeout(async () => {
      if (viewedFilmIds.has(film.id)) return;
      viewedFilmIds.add(film.id);
      try {
        const hash = await getViewerHash((user as any)?.id);
        reportFilmView({ filmId: film.id, viewerHash: hash }).unwrap().catch(() => {});
      } catch {}
    }, 3000);
    return () => clearTimeout(t);
  }, [film?.id, canEdit, user, reportFilmView]);

  const ensureClaim = async (): Promise<string | undefined> => {
    const res = await claimFilm({ filmId }).unwrap();
    setVerifyCode(res?.results?.code ?? null);
    setVerifyToken(res?.results?.token ?? null);
    return res?.results?.token;
  };
  const openVerify = async () => {
    setVerifyOpen(true);
    if (verifyToken || verifyCode) return;
    try { setVerifyState('claiming'); await ensureClaim(); setVerifyState('idle'); }
    catch { setVerifyState('error'); }
  };
  const runVerify = async () => {
    try {
      setVerifyState('checking');
      const token = verifyToken || (await ensureClaim());
      if (!token) { setVerifyState('error'); return; }
      const check = await verifyCheck({ filmId, token }).unwrap();
      const resultToken = check?.results?.resultToken;
      if (!resultToken) { setVerifyState('notfound'); return; }
      setVerifyState('applying');
      await verifyApply({ filmId, resultToken }).unwrap();
      setVerifyState('idle');
      setVerifyOpen(false);
      Alert.alert("You're verified 🎉", "You can remove the code from your video's description now — your verification sticks.");
    } catch (e: any) {
      if (e?.status === 422) setVerifyState('notfound');
      else { setVerifyState('error'); }
    }
  };
  const copyCode = async () => {
    if (!verifyCode) return;
    try { await Clipboard.setStringAsync(verifyCode); Alert.alert('Copied', 'Paste it into your video description.'); } catch {}
  };
  const onConfirmSession = async (sessionId: string, action: 'confirm' | 'reject') => {
    try { await confirmSession({ filmId, sessionId, action }).unwrap(); }
    catch (e: any) { Alert.alert('Something went wrong', e?.data?.message || 'Please try again.'); }
  };

  const myPendingTag = useMemo(
    () => participants.find((p) => p.id === user?.id && !p.confirmed),
    [participants, user]
  );
  const confirmedParticipants = participants.filter((p) => p.confirmed);
  // Brands = advertiser/shaper participants — surfaced in their own section
  // (with boards), matching web. Everyone else lands in "In this film".
  const isBrand = (p: any) => p.user_type === 'advertiser' || p.user_type === 'shaper';
  const confirmedPeople = confirmedParticipants.filter((p) => !isBrand(p));
  const confirmedBrands = confirmedParticipants.filter(isBrand);

  const textColor = isDark ? '#fff' : '#0f172a';
  const subColor = isDark ? '#9ca3af' : '#64748b';
  const embedHeight = Math.round(((width) * 9) / 16);

  // YouTube embeds loaded as a top-level WebView navigation get a null/file://
  // origin, which the player rejects with "Error 153 — Video player
  // configuration error". Wrapping the iframe in an HTML doc and setting
  // baseUrl to a real youtube.com origin gives the embed a valid referer.
  const embedHtml = useMemo(
    () =>
      `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{background:#000;height:100%;overflow:hidden;}.wrap{position:relative;width:100%;height:100%;}iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}</style></head><body><div class="wrap"><iframe src="https://www.youtube.com/embed/${film?.youtube_video_id ?? ''}?playsinline=1&rel=0&modestbranding=1" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div></body></html>`,
    [film?.youtube_video_id]
  );

  const onConfirm = async (action: 'confirm' | 'reject') => {
    try {
      await confirmParticipant({ filmId, action }).unwrap();
    } catch (e: any) {
      Alert.alert('Something went wrong', e?.data?.message || 'Please try again.');
    }
  };

  const onDelete = () => {
    Alert.alert('Delete this film record?', 'This removes the catalog entry (the YouTube video is unaffected).', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFilm({ filmId }).unwrap();
            smartBack();
          } catch (e: any) {
            Alert.alert('Failed to delete', e?.data?.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const onReport = async (reason: string) => {
    setReportOpen(false);
    try {
      await reportFilm({ filmId, reason }).unwrap();
      Alert.alert('Report submitted', 'Thank you — our team will review it.');
    } catch (e: any) {
      Alert.alert('Failed to submit report', e?.data?.message || 'Please try again.');
    }
  };

  const shareFilm = () => safeShare({ message: `https://app.surf-vault.com/films/${filmId}` });
  const menuSections: ActionSheetSection[] = canEdit
    ? [{ options: [
        { label: 'Tag people, breaks & brands', icon: 'pricetag-outline', onPress: () => setTagOpen(true) },
        { label: 'Share', icon: 'share-outline', onPress: shareFilm },
        { label: 'Delete film', icon: 'trash-outline', destructive: true, onPress: onDelete },
      ] }]
    : [{ options: [
        { label: 'Share', icon: 'share-outline', onPress: shareFilm },
        { label: 'Report film', icon: 'flag-outline', destructive: true, onPress: () => setReportOpen(true) },
      ] }];

  const creatorLabel = film?.creator_display_name || (film?.creator_handle ? `@${film.creator_handle}` : film?.creator_name);

  return (
    <SafeAreaView edges={[]} style={[styles.flex, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        left={
          <Pressable onPress={smartBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={textColor} />
          </Pressable>
        }
        right={
          film ? (
            <Pressable onPress={() => setMenuOpen(true)} hitSlop={10}>
              <Ionicons name="ellipsis-horizontal" size={22} color={textColor} />
            </Pressable>
          ) : null
        }
      />

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator /></View>
      ) : isError || !film ? (
        <View style={styles.centered}><Text style={{ color: subColor }}>Couldn't load this film.</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {/* Embed */}
          <View style={{ width, height: embedHeight, backgroundColor: '#000' }}>
            <WebView
              source={{ html: embedHtml, baseUrl: 'https://app.surf-vault.com' }}
              originWhitelist={['*']}
              style={{ flex: 1, backgroundColor: '#000' }}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              allowsFullscreenVideo
            />
          </View>

          <Pressable
            style={styles.body}
            // Tap anywhere outside the title/description inputs commits the edit
            // (the inputs capture their own taps, so this only fires "click out").
            onPress={() => { if (editingTitle) saveTitle(); if (editingDesc) saveDesc(); }}
          >
            {/* Eyebrow row — blue FILM label (left), verification status (right). */}
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowLeft}>
                <Ionicons name="film" size={12} color="#0ea5e9" />
                <Text style={styles.eyebrowText}>FILM</Text>
                {/* Private view count — only the verified creator/admin sees it. */}
                {viewerCanReveal && film.views != null ? (
                  <View style={styles.eyebrowViews}>
                    <Ionicons name="eye-outline" size={12} color={subColor} />
                    <Text style={[styles.eyebrowViewsText, { color: subColor }]}>{film.views.toLocaleString()}</Text>
                  </View>
                ) : null}
              </View>
              {film.creator_verified && film.creator_handle ? (
                <Pressable onPress={() => trackedPush(`/user/${film.creator_handle}` as any)} hitSlop={6}>
                  <Text style={styles.statusVerified}>✓ Verified by @{film.creator_handle}</Text>
                </Pressable>
              ) : film.creator_handle ? (
                <Pressable onPress={() => trackedPush(`/user/${film.creator_handle}` as any)} hitSlop={6}>
                  <Text style={[styles.statusUnverified, { color: subColor }]}>Created by @{film.creator_handle} (Unverified)</Text>
                </Pressable>
              ) : (
                <Text style={[styles.statusUnverified, { color: subColor }]}>Unverified</Text>
              )}
            </View>

            {/* Title — tap to edit (editors only). */}
            {editingTitle ? (
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                autoFocus
                onBlur={saveTitle}
                onSubmitEditing={saveTitle}
                returnKeyType="done"
                maxLength={200}
                style={[styles.title, styles.titleInput, { color: textColor }]}
              />
            ) : (
              <Pressable onPress={startTitleEdit} disabled={!canEdit}>
                <Text style={[styles.title, { color: textColor }]}>{film.title}</Text>
              </Pressable>
            )}

            {film.film_date ? (
              <Text style={[styles.published, { color: subColor }]}>Published {formatSessionDate(film.film_date)}</Text>
            ) : null}

            {creatorLabel ? (
              <Pressable
                disabled={!film.creator_handle}
                onPress={() => film.creator_handle && trackedPush(`/user/${film.creator_handle}` as any)}
                style={styles.creatorRow}
              >
                <UserAvatar uri={film.creator_picture} name={creatorLabel} size={34} verified={!!film.creator_verified} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.creatorName, { color: textColor }]} numberOfLines={1}>{creatorLabel}</Text>
                  <Text style={[styles.creatorRole, { color: subColor }]}>Filmmaker{film.creator_verified ? ' · verified' : ''}</Text>
                </View>
              </Pressable>
            ) : null}

            {/* Description — inline-editable (editors); "Add description" when empty. */}
            {editingDesc ? (
              <TextInput
                value={descDraft}
                onChangeText={setDescDraft}
                autoFocus
                multiline
                onBlur={saveDesc}
                placeholder="Add a description…"
                placeholderTextColor={subColor}
                maxLength={5000}
                style={[styles.descInput, { color: textColor, borderColor: isDark ? '#1f2937' : '#e5e7eb' }]}
              />
            ) : film.description ? (
              <Pressable onPress={startDescEdit} disabled={!canEdit}>
                <Text style={[styles.desc, { color: subColor }]}>{film.description}</Text>
              </Pressable>
            ) : canEdit ? (
              <Pressable onPress={startDescEdit} style={styles.addDescBtn} hitSlop={6}>
                <Ionicons name="add" size={15} color={subColor} />
                <Text style={[styles.addDescText, { color: subColor }]}>Add description</Text>
              </Pressable>
            ) : null}

            {/* Creator verification (description-code) — any signed-in viewer of an
                unverified film. The real channel owner usually arrives unlinked. */}
            {viewerCanVerify && (
              <View style={[styles.verifyCard, { backgroundColor: isDark ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.08)' }]}>
                {!verifyOpen ? (
                  <>
                    <Text style={[styles.verifyTitle, { color: textColor }]}>Are you the filmmaker?</Text>
                    <Text style={[styles.verifySub, { color: subColor }]}>Verify you own this YouTube channel to get creator credit and reveal spot details.</Text>
                    <Pressable onPress={openVerify} style={styles.verifyBtn}><Text style={styles.verifyBtnText}>Verify you're the creator</Text></Pressable>
                  </>
                ) : (
                  <>
                    <Text style={[styles.verifyTitle, { color: textColor }]}>Verify channel ownership</Text>
                    <Text style={[styles.verifySub, { color: subColor }]}>1. Copy the code.  2. Paste it in your YouTube video's description and save.  3. Tap Verify (YouTube can take a minute).</Text>
                    <View style={styles.codeRow}>
                      <Text style={[styles.codeText, { color: textColor, backgroundColor: isDark ? '#0f172a' : '#fff' }]} numberOfLines={1}>
                        {verifyState === 'claiming' ? 'Generating…' : (verifyCode || '—')}
                      </Text>
                      <Pressable onPress={copyCode} disabled={!verifyCode} style={[styles.copyBtn, { borderColor: isDark ? '#374151' : '#cbd5e1' }]}>
                        <Text style={[styles.copyBtnText, { color: textColor }]}>Copy</Text>
                      </Pressable>
                    </View>
                    {verifyState === 'notfound' && <Text style={styles.verifyWarn}>Couldn't find the code in your description yet — make sure it's saved, give YouTube a minute, then retry.</Text>}
                    {verifyState === 'error' && <Text style={styles.verifyErr}>Something went wrong — please try again.</Text>}
                    <View style={styles.verifyActions}>
                      <Pressable onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${film.youtube_video_id}`).catch(() => {})} hitSlop={6}>
                        <Text style={[styles.openYt, { color: subColor }]}>Open on YouTube</Text>
                      </Pressable>
                      <View style={{ flex: 1 }} />
                      <Pressable onPress={() => { setVerifyOpen(false); setVerifyState('idle'); }} style={styles.cancelVerify}>
                        <Text style={{ color: subColor, fontWeight: '600' }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={runVerify}
                        disabled={verifyState === 'checking' || verifyState === 'applying' || verifyState === 'claiming'}
                        style={[styles.verifyBtn, (verifyState === 'checking' || verifyState === 'applying') && { opacity: 0.7 }]}
                      >
                        {(verifyState === 'checking' || verifyState === 'applying') ? <ActivityIndicator color="#fff" /> : <Text style={styles.verifyBtnText}>Verify</Text>}
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Logged-out filmmaker CTA — claim path needs auth first, then the
                signed-in card above takes over (and doubles as a signup driver). */}
            {!viewerCanVerify && !film.creator_verified && !user?.id ? (
              <View style={[styles.verifyCard, { backgroundColor: isDark ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.08)' }]}>
                <Text style={[styles.verifyTitle, { color: textColor }]}>Are you the filmmaker?</Text>
                <Text style={[styles.verifySub, { color: subColor }]}>Sign in to claim this film, get creator credit, and reveal spot details.</Text>
                <Pressable onPress={() => requireAuth()} style={styles.verifyBtn}><Text style={styles.verifyBtnText}>Sign in to claim</Text></Pressable>
              </View>
            ) : null}

            {canEdit && (
              <Pressable onPress={() => setTagOpen(true)} style={[styles.tagBtn, { borderColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
                <Ionicons name="pricetag-outline" size={16} color={textColor} />
                <Text style={[styles.tagBtnText, { color: textColor }]}>Tag people, breaks & brands</Text>
              </Pressable>
            )}

            {/* Pending-tag confirm bar */}
            {myPendingTag && (
              <View style={styles.confirmBar}>
                <Text style={{ color: textColor, flex: 1 }}>You were tagged in this film.</Text>
                <Pressable onPress={() => onConfirm('confirm')} style={[styles.confirmBtn, { backgroundColor: '#0ea5e9' }]}>
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                </Pressable>
                <Pressable onPress={() => onConfirm('reject')} style={[styles.confirmBtn, { backgroundColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
                  <Text style={[styles.confirmBtnText, { color: textColor }]}>Remove</Text>
                </Pressable>
              </View>
            )}

            {/* Where — front-facing display only: revealed spots by name + a
                region chip for hidden ones. Reveal/hide management lives in the
                Tag sheet (never leaks a hidden spot name here). */}
            {(film.breaks?.length > 0 || (film.hidden_regions?.length ?? 0) > 0) && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>Where</Text>
                <View style={styles.chipWrap}>
                  {film.breaks.map((b) => (
                    <Pressable
                      key={b.id}
                      onPress={() => trackedPush(`/break/${b.country_code}/${b.region || '0'}/${b.surf_break_identifier}` as any)}
                      style={[styles.locChip, { backgroundColor: isDark ? '#0f2030' : '#e0f2fe' }]}
                    >
                      <Ionicons name="location" size={12} color="#0ea5e9" />
                      <Text style={[styles.locChipText, { color: textColor }]}>{b.name?.replace(/_/g, ' ')}</Text>
                    </Pressable>
                  ))}
                  {[...new Set((film.hidden_regions ?? []).map(regionLabel).filter(Boolean))].map((label) => (
                    <View key={`rg-${label}`} style={[styles.locChip, { backgroundColor: isDark ? '#1f2937' : '#f1f5f9' }]}>
                      <Ionicons name="location-outline" size={12} color={subColor} />
                      <Text style={[styles.locChipText, { color: subColor }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Participants (surfers + photographers; brands have their own section) */}
            {confirmedPeople.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>In this film</Text>
                <View style={styles.chipWrap}>
                  {confirmedPeople.map((p) => (
                    <Pressable key={p.id} onPress={() => trackedPush(`/user/${p.handle}` as any)} style={styles.personRow}>
                      <UserAvatar uri={p.picture} name={p.name ?? p.handle} size={30} />
                      <Text style={[styles.personHandle, { color: textColor }]}>@{p.handle}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Linked sessions */}
            {sessions.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>Sessions</Text>
                {sessions.map((s) => {
                  const pending = s.confirmed === false;
                  const isOwner = !!user?.handle && s.owner_handle === user.handle;
                  return (
                    <View key={s.id}>
                      <Pressable
                        onPress={() => trackedPush(`/session/${s.id}` as any)}
                        style={[styles.sessionRow, pending && { opacity: 0.8 }]}
                      >
                        {s.thumbnail ? (
                          <Image source={{ uri: s.thumbnail }} style={styles.sessionThumb} contentFit="cover" />
                        ) : (
                          <View style={[styles.sessionThumb, { backgroundColor: isDark ? '#1f2937' : '#e5e7eb', alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name="images-outline" size={16} color={subColor} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: textColor, fontWeight: '600' }} numberOfLines={1}>
                            {s.session_name || s.surf_break_name?.replace(/_/g, ' ') || 'Session'}
                          </Text>
                          <Text style={{ color: subColor, fontSize: 12 }} numberOfLines={1}>
                            {[
                              s.surf_break_name?.replace(/_/g, ' ') || (s.region ? String(s.region).replace(/_/g, ' ') : null),
                              s.session_date ? formatSessionDate(s.session_date) : null,
                            ].filter(Boolean).join('  ·  ') || `@${s.owner_handle}`}{pending ? '  ·  Pending' : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={subColor} />
                      </Pressable>
                      {pending && isOwner && (
                        <View style={styles.sessionApproveRow}>
                          <Text style={{ color: subColor, flex: 1, fontSize: 12 }}>Approve this link to your session?</Text>
                          <Pressable onPress={() => onConfirmSession(s.id, 'confirm')} style={[styles.confirmBtn, { backgroundColor: '#0ea5e9' }]}>
                            <Text style={styles.confirmBtnText}>Approve</Text>
                          </Pressable>
                          <Pressable onPress={() => onConfirmSession(s.id, 'reject')} style={[styles.confirmBtn, { backgroundColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
                            <Text style={[styles.confirmBtnText, { color: textColor }]}>Reject</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Brands (advertisers + shapers) + the boards they make */}
            {(confirmedBrands.length > 0 || boards.length > 0) && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>Brands</Text>
                {confirmedBrands.length > 0 && (
                  <View style={styles.chipWrap}>
                    {confirmedBrands.map((p) => (
                      <Pressable key={p.id} onPress={() => trackedPush(`/user/${p.handle}` as any)} style={styles.personRow}>
                        <UserAvatar uri={p.picture} name={p.name ?? p.handle} size={30} />
                        <Text style={[styles.personHandle, { color: textColor }]}>@{p.handle}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {boards.length > 0 && (
                  <View style={[styles.chipWrap, confirmedBrands.length > 0 && { marginTop: 8 }]}>
                    {boards.map((b) => (
                      <Pressable key={b.id} onPress={() => trackedPush(`/board/${b.id}` as any)} style={[styles.locChip, { backgroundColor: isDark ? '#3a2a08' : '#fef3c7' }]}>
                        <Text style={[styles.locChipText, { color: isDark ? '#fbbf24' : '#92400e' }]}>{b.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}
          </Pressable>
        </ScrollView>
      )}

      <ActionSheet visible={menuOpen} onClose={() => setMenuOpen(false)} sections={menuSections} />
      <ActionSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report film"
        sections={[{ options: REPORT_REASONS.map((r) => ({ label: r.label, onPress: () => onReport(r.key) })) }]}
      />
      <FilmTagSheet
        visible={tagOpen}
        onClose={() => setTagOpen(false)}
        filmId={filmId}
        selfHandle={user?.handle}
        participants={participants}
        suggestedBreaks={suggestedBreaks}
        linkedSessions={sessions}
        viewerCanReveal={viewerCanReveal}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 16 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  eyebrowLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrowText: { color: '#0ea5e9', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  eyebrowViews: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 3 },
  eyebrowViewsText: { fontSize: 11, fontWeight: '600' },
  statusVerified: { color: '#10b981', fontSize: 11, fontWeight: '700' },
  statusUnverified: { fontSize: 11, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  titleInput: { paddingVertical: 0, borderBottomWidth: 2, borderBottomColor: '#0ea5e9' },
  published: { fontSize: 13, fontWeight: '500', marginTop: 6 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  creatorName: { fontSize: 14, fontWeight: '600' },
  creatorRole: { fontSize: 12, marginTop: 1 },
  creator: { fontSize: 14, marginTop: 4 },
  tagBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12,
  },
  tagBtnText: { fontSize: 14, fontWeight: '600' },
  confirmBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: 'rgba(14,165,233,0.12)',
  },
  confirmBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  desc: { fontSize: 14, marginTop: 14, lineHeight: 20 },
  descInput: { fontSize: 14, marginTop: 14, lineHeight: 20, minHeight: 90, borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: 'top' },
  addDescBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14 },
  addDescText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  locChipText: { fontSize: 13, fontWeight: '600' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  personHandle: { fontSize: 13, fontWeight: '600' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  sessionThumb: { width: 64, height: 40, borderRadius: 6 },
  sessionApproveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, paddingLeft: 74 },
  // Verification card
  verifyCard: { marginTop: 14, borderRadius: 14, padding: 14 },
  verifyTitle: { fontSize: 15, fontWeight: '700' },
  verifySub: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  verifyBtn: { backgroundColor: '#10b981', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, marginTop: 12, minWidth: 92 },
  verifyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  codeText: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, fontWeight: '600' },
  copyBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  copyBtnText: { fontSize: 14, fontWeight: '700' },
  verifyWarn: { color: '#d97706', fontSize: 12.5, marginTop: 8, lineHeight: 17 },
  verifyErr: { color: '#ef4444', fontSize: 12.5, marginTop: 8 },
  verifyActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  openYt: { fontSize: 13, fontWeight: '600' },
  cancelVerify: { paddingHorizontal: 6, paddingVertical: 10 },
  revealTag: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4, marginLeft: 2 },
});
