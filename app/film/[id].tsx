import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { safeShare } from '../../src/helpers/share';
import {
  useGetFilmQuery,
  useDeleteFilmMutation,
  useConfirmFilmParticipantMutation,
  useReportFilmMutation,
} from '../../src/store';
import { useUser } from '../../src/context/UserProvider';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import UserAvatar from '../../src/components/UserAvatar';
import ActionSheet, { type ActionSheetSection } from '../../src/components/ActionSheet';
import FilmTagSheet from '../../src/components/FilmTagSheet';

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

  const { data, isLoading, isError } = useGetFilmQuery({ filmId }, { skip: !filmId });
  const film = data?.results?.film;
  const participants = useMemo(() => data?.results?.participants ?? [], [data]);
  const boards = data?.results?.boards ?? [];
  const sessions = data?.results?.sessions ?? [];
  const suggestedBreaks = data?.results?.suggestedBreaks ?? [];
  const canEdit = !!data?.results?.viewerCanEdit;

  const [deleteFilm] = useDeleteFilmMutation();
  const [confirmParticipant] = useConfirmFilmParticipantMutation();
  const [reportFilm] = useReportFilmMutation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  const myPendingTag = useMemo(
    () => participants.find((p) => p.id === user?.id && !p.confirmed),
    [participants, user]
  );
  const confirmedParticipants = participants.filter((p) => p.confirmed);

  const textColor = isDark ? '#fff' : '#0f172a';
  const subColor = isDark ? '#9ca3af' : '#64748b';
  const embedHeight = Math.round(((width) * 9) / 16);

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
        { label: 'Tag people & breaks', icon: 'pricetag-outline', onPress: () => setTagOpen(true) },
        { label: 'Share', icon: 'share-outline', onPress: shareFilm },
        { label: 'Delete film', icon: 'trash-outline', destructive: true, onPress: onDelete },
      ] }]
    : [{ options: [
        { label: 'Share', icon: 'share-outline', onPress: shareFilm },
        { label: 'Report film', icon: 'flag-outline', destructive: true, onPress: () => setReportOpen(true) },
      ] }];

  const creatorLabel = film?.creator_display_name || (film?.creator_handle ? `@${film.creator_handle}` : film?.creator_name);

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Film"
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
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Embed */}
          <View style={{ width, height: embedHeight, backgroundColor: '#000' }}>
            <WebView
              source={{ uri: `https://www.youtube.com/embed/${film.youtube_video_id}?playsinline=1&rel=0` }}
              style={{ flex: 1, backgroundColor: '#000' }}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
            />
          </View>

          <View style={styles.body}>
            <Text style={[styles.title, { color: textColor }]}>{film.title}</Text>
            {creatorLabel ? (
              <Pressable
                disabled={!film.creator_handle}
                onPress={() => film.creator_handle && trackedPush(`/user/${film.creator_handle}` as any)}
              >
                <Text style={[styles.creator, { color: subColor }]}>
                  {creatorLabel}{film.creator_verified ? '  · verified' : ''}
                </Text>
              </Pressable>
            ) : null}

            {canEdit && (
              <Pressable onPress={() => setTagOpen(true)} style={[styles.tagBtn, { borderColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
                <Ionicons name="pricetag-outline" size={16} color={textColor} />
                <Text style={[styles.tagBtnText, { color: textColor }]}>Tag people & breaks</Text>
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

            {!!film.description && (
              <Text style={[styles.desc, { color: subColor }]}>{film.description}</Text>
            )}

            {/* Locations */}
            {(film.breaks?.length > 0 || film.regions?.length > 0) && (
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
                  {(film.breaks.length ? [] : film.regions).map((r, i) => (
                    <View key={`rg-${i}`} style={[styles.locChip, { backgroundColor: isDark ? '#1f2937' : '#f1f5f9' }]}>
                      <Ionicons name="location-outline" size={12} color={subColor} />
                      <Text style={[styles.locChipText, { color: subColor }]}>{(r.region || r.country || '').replace(/_/g, ' ')}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Participants */}
            {confirmedParticipants.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>In this film</Text>
                <View style={styles.chipWrap}>
                  {confirmedParticipants.map((p) => (
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
                {sessions.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => trackedPush(`/session/${s.id}` as any)}
                    style={styles.sessionRow}
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
                        @{s.owner_handle}{s.session_date ? `  ·  ${String(s.session_date)}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={subColor} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Boards */}
            {boards.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>Boards ridden</Text>
                <View style={styles.chipWrap}>
                  {boards.map((b) => (
                    <Pressable key={b.id} onPress={() => trackedPush(`/board/${b.id}` as any)} style={[styles.locChip, { backgroundColor: isDark ? '#3a2a08' : '#fef3c7' }]}>
                      <Text style={[styles.locChipText, { color: isDark ? '#fbbf24' : '#92400e' }]}>{b.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
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
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
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
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  locChipText: { fontSize: 13, fontWeight: '600' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  personHandle: { fontSize: 13, fontWeight: '600' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  sessionThumb: { width: 64, height: 40, borderRadius: 6 },
});
