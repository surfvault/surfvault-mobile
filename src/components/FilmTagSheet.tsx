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
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import ActionSheet, { type ActionSheetOption } from './ActionSheet';
import UserAvatar from './UserAvatar';
import { useUser } from '../context/UserProvider';
import {
  useGetMapSearchContentQuery,
  useGetSurfBreaksQuery,
  useGetFilmCandidateSessionsQuery,
  useTagFilmParticipantMutation,
  useTagFilmSurfBreakMutation,
  useTagFilmSessionMutation,
  type FilmParticipant,
  type FilmSessionTag,
} from '../store';

interface SuggestedBreak {
  id: string;
  name: string;
  region: string;
  is_public: boolean;
}

/**
 * Tag people + surf breaks on a film. People tags fire a "tagged in a film"
 * notification (pending until the user confirms). Break tags are saved as
 * PRIVATE suggestions (hidden until a verified creator reveals — Phase 2).
 * Relies on RTK cache invalidation to refresh the parent's getFilm.
 */
export default function FilmTagSheet({
  visible,
  onClose,
  filmId,
  selfHandle,
  participants = [],
  suggestedBreaks = [],
  linkedSessions = [],
  viewerCanReveal = false,
}: {
  visible: boolean;
  onClose: () => void;
  filmId: string;
  selfHandle?: string | null;
  participants?: FilmParticipant[];
  suggestedBreaks?: SuggestedBreak[];
  linkedSessions?: FilmSessionTag[];
  // Verified creator / admin → may flip a break's visibility (reveal/hide).
  viewerCanReveal?: boolean;
}) {
  const isDark = useColorScheme() === 'dark';
  const { user } = useUser();
  const [userSearch, setUserSearch] = useState('');
  const [breakSearch, setBreakSearch] = useState('');
  // Which tagged break's manage sheet (reveal/hide · remove) is open.
  const [breakSheet, setBreakSheet] = useState<any | null>(null);

  const [tagParticipant] = useTagFilmParticipantMutation();
  const [tagBreak] = useTagFilmSurfBreakMutation();
  const [tagSession] = useTagFilmSessionMutation();

  const taggedBreakIds = new Set(suggestedBreaks.map((b) => b.id));
  const hasBreaks = suggestedBreaks.length > 0;
  const hasParticipants = participants.length > 0;

  // Session picker pulls from a backend candidate list: sessions AT the film's
  // tagged breaks owned by the film's CONFIRMED participants — not a blind
  // self-list. So a session only appears once both its break and its
  // photographer/surfer are tagged and that person has accepted.
  const { data: sessionsData, isFetching: sessionsLoading } = useGetFilmCandidateSessionsQuery(
    { filmId },
    { skip: !visible || !hasBreaks || !hasParticipants }
  );
  const candidateSessions: any[] = sessionsData?.results?.sessions ?? [];
  const linkedSessionIds = new Set(linkedSessions.map((s) => s.id));

  const { data: userData, isFetching: usersLoading } = useGetMapSearchContentQuery(
    { search: userSearch, type: 'user', viewerId: user?.id },
    { skip: !visible || userSearch.trim().length < 2 }
  );
  const userResults: any[] = (userData?.results?.searchContent ?? []).filter((u: any) => u?.handle);

  const { data: breakData, isFetching: breaksLoading } = useGetSurfBreaksQuery(
    { search: breakSearch, limit: 10, continuationToken: '' },
    { skip: !visible || breakSearch.trim().length < 2 }
  );
  const breakResults: any[] = breakData?.results?.breaks ?? [];

  const taggedUserIds = new Set(participants.map((p) => p.id));

  const bg = isDark ? '#000' : '#fff';
  const text = isDark ? '#fff' : '#0f172a';
  const sub = isDark ? '#9ca3af' : '#64748b';
  const inputBg = isDark ? '#0f172a' : '#f1f5f9';

  const run = async (fn: () => Promise<any>, errMsg: string) => {
    try { await fn(); } catch (e: any) { Alert.alert('Something went wrong', e?.data?.message || errMsg); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: bg }}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: text }]}>Tag this film</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {/* Breaks — first: sessions are pulled from the film's tagged breaks. */}
          <Text style={[styles.sectionTitle, { color: text }]}>Surf breaks</Text>
          <Text style={[styles.hint, { color: sub }]}>
            Breaks you add stay private until the film's verified creator reveals them — this protects hidden spots.
          </Text>
          {suggestedBreaks.length > 0 && (
            <View style={styles.tagWrap}>
              {suggestedBreaks.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => setBreakSheet(b)}
                  style={[styles.tag, { backgroundColor: inputBg }]}
                >
                  <Text style={[styles.tagText, { color: text }]}>{b.name?.replace(/_/g, ' ')}</Text>
                  <Ionicons
                    name={b.is_public ? 'eye-outline' : 'eye-off-outline'}
                    size={16}
                    color={b.is_public ? '#10b981' : '#f59e0b'}
                  />
                </Pressable>
              ))}
            </View>
          )}
          <TextInput
            value={breakSearch}
            onChangeText={setBreakSearch}
            placeholder="Search surf breaks…"
            placeholderTextColor={sub}
            style={[styles.input, { backgroundColor: inputBg, color: text }]}
          />
          {breakSearch.trim().length >= 2 && (
            <View style={styles.results}>
              {breaksLoading ? (
                <ActivityIndicator style={{ margin: 12 }} />
              ) : breakResults.length === 0 ? (
                <Text style={[styles.noResults, { color: sub }]}>No breaks found.</Text>
              ) : breakResults.map((b) => (
                <Pressable
                  key={b.id}
                  disabled={taggedBreakIds.has(b.id)}
                  onPress={() => run(() => tagBreak({ filmId, surfBreakId: b.id, action: 'add' }).unwrap(), 'Failed to add break')}
                  style={[styles.resultRow, taggedBreakIds.has(b.id) && { opacity: 0.4 }]}
                >
                  <Ionicons name="location-outline" size={16} color={sub} />
                  <Text style={[styles.resultText, { color: text }]}>
                    {b.name?.replace(/_/g, ' ')}
                    {b.region ? <Text style={{ color: sub }}>  ·  {String(b.region).replace(/_/g, ' ')}</Text> : null}
                  </Text>
                  {!taggedBreakIds.has(b.id) && <Ionicons name="add" size={18} color="#0ea5e9" />}
                </Pressable>
              ))}
            </View>
          )}

          {/* People & brands — search returns every user type (surfer,
              photographer, advertiser, shaper). */}
          <Text style={[styles.sectionTitle, { color: text, marginTop: 24 }]}>Surfers, filmers & brands</Text>
          {participants.length > 0 && (
            <View style={styles.tagWrap}>
              {participants.map((p) => (
                <View key={p.id} style={[styles.tag, { backgroundColor: inputBg }]}>
                  <UserAvatar uri={p.picture} name={p.name ?? p.handle} size={20} />
                  <Text style={[styles.tagText, { color: text }]}>@{p.handle}</Text>
                  {!p.confirmed && <Text style={styles.pending}>pending</Text>}
                  <Pressable onPress={() => run(() => tagParticipant({ filmId, userId: p.id, action: 'remove' }).unwrap(), 'Failed to remove')} hitSlop={6}>
                    <Ionicons name="close-circle" size={16} color={sub} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <TextInput
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="Search surfers, filmers & brands…"
            placeholderTextColor={sub}
            style={[styles.input, { backgroundColor: inputBg, color: text }]}
          />
          {userSearch.trim().length >= 2 && (
            <View style={styles.results}>
              {usersLoading ? (
                <ActivityIndicator style={{ margin: 12 }} />
              ) : userResults.length === 0 ? (
                <Text style={[styles.noResults, { color: sub }]}>No people found.</Text>
              ) : userResults.map((u) => (
                <Pressable
                  key={u.id}
                  disabled={taggedUserIds.has(u.id)}
                  onPress={() => run(() => tagParticipant({ filmId, userId: u.id, action: 'add' }).unwrap(), 'Failed to tag')}
                  style={[styles.resultRow, taggedUserIds.has(u.id) && { opacity: 0.4 }]}
                >
                  <UserAvatar uri={u.picture} name={u.name ?? u.handle} size={26} />
                  <Text style={[styles.resultText, { color: text }]}>@{u.handle}</Text>
                  {!taggedUserIds.has(u.id) && <Ionicons name="add" size={18} color="#0ea5e9" />}
                </Pressable>
              ))}
            </View>
          )}

          {/* Sessions — candidate sessions at the tagged breaks, owned by the
              film's confirmed participants (backend-filtered). */}
          <Text style={[styles.sectionTitle, { color: text, marginTop: 24 }]}>Sessions</Text>
          <Text style={[styles.hint, { color: sub }]}>
            Only sessions shot at the tagged breaks by the tagged surfers/photographers (once they accept) can be linked.
          </Text>
          {linkedSessions.length > 0 && (
            <View style={styles.tagWrap}>
              {linkedSessions.map((s) => (
                <View key={s.id} style={[styles.tag, { backgroundColor: inputBg }]}>
                  <Text style={[styles.tagText, { color: text }]} numberOfLines={1}>
                    {s.session_name || s.surf_break_name?.replace(/_/g, ' ') || 'Session'}
                  </Text>
                  <Pressable onPress={() => run(() => tagSession({ filmId, sessionId: s.id, action: 'remove' }).unwrap(), 'Failed to unlink')} hitSlop={6}>
                    <Ionicons name="close-circle" size={16} color={sub} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <View style={styles.results}>
            {!hasBreaks ? (
              <Text style={[styles.noResults, { color: sub }]}>Tag a surf break above first.</Text>
            ) : !hasParticipants ? (
              <Text style={[styles.noResults, { color: sub }]}>Tag surfers or photographers — their sessions at these breaks appear once they accept.</Text>
            ) : sessionsLoading ? (
              <ActivityIndicator style={{ margin: 12 }} />
            ) : candidateSessions.length === 0 ? (
              <Text style={[styles.noResults, { color: sub }]}>No sessions available to link yet.</Text>
            ) : candidateSessions.map((s) => {
              const meta = [
                s.owner_handle ? `@${s.owner_handle}` : null,
                s.surf_break_name ? s.surf_break_name.replace(/_/g, ' ') : null,
              ].filter(Boolean).join('  ·  ');
              return (
                <Pressable
                  key={s.id}
                  disabled={linkedSessionIds.has(s.id)}
                  onPress={() => run(() => tagSession({ filmId, sessionId: s.id, action: 'add' }).unwrap(), 'Failed to link session')}
                  style={[styles.resultRow, linkedSessionIds.has(s.id) && { opacity: 0.4 }]}
                >
                  {s.thumbnail ? (
                    <Image source={{ uri: s.thumbnail }} style={styles.sessionThumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.sessionThumb, { backgroundColor: inputBg, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="images-outline" size={14} color={sub} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultText, { color: text }]} numberOfLines={1}>
                      {s.session_name || s.surf_break_name?.replace(/_/g, ' ') || 'Session'}
                    </Text>
                    {meta ? <Text style={{ color: sub, fontSize: 11 }} numberOfLines={1}>{meta}</Text> : null}
                  </View>
                  {!linkedSessionIds.has(s.id) && <Ionicons name="add" size={18} color="#0ea5e9" />}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Manage a tagged break — reveal/hide (verified creator/admin) + remove. */}
        <ActionSheet
          visible={!!breakSheet}
          onClose={() => setBreakSheet(null)}
          title={breakSheet?.name?.replace(/_/g, ' ')}
          sections={[{
            options: [
              ...(viewerCanReveal
                ? [{
                    label: breakSheet?.is_public ? 'Hide spot (show region only)' : 'Reveal exact spot',
                    icon: (breakSheet?.is_public ? 'eye-off-outline' : 'eye-outline') as ActionSheetOption['icon'],
                    onPress: () => {
                      const b = breakSheet;
                      setBreakSheet(null);
                      run(() => tagBreak({ filmId, surfBreakId: b.id, action: b.is_public ? 'hide' : 'reveal' }).unwrap(), 'Failed to update visibility');
                    },
                  }]
                : []),
              {
                label: 'Remove break',
                icon: 'trash-outline' as ActionSheetOption['icon'],
                destructive: true,
                onPress: () => {
                  const b = breakSheet;
                  setBreakSheet(null);
                  run(() => tagBreak({ filmId, surfBreakId: b.id, action: 'remove' }).unwrap(), 'Failed to remove');
                },
              },
            ],
          }]}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 16 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  results: { marginTop: 8, borderRadius: 10, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4 },
  resultText: { flex: 1, fontSize: 14 },
  sessionThumb: { width: 44, height: 30, borderRadius: 5 },
  noResults: { fontSize: 13, padding: 12 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingLeft: 6, paddingRight: 10, paddingVertical: 5 },
  tagText: { fontSize: 13, fontWeight: '600' },
  pending: { fontSize: 10, color: '#f59e0b', fontWeight: '700' },
});
