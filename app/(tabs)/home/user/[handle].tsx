import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Linking,
  Share,
  StyleSheet,
  useColorScheme,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../../../src/context/UserProvider';
import { useRequireAuth } from '../../../../src/hooks/useRequireAuth';
import {
  useGetUserQuery,
  useGetUserSessionsQuery,
  useFollowUserMutation,
} from '../../../../src/store';
import UserAvatar from '../../../../src/components/UserAvatar';
import SessionCard from '../../../../src/components/SessionCard';

const isNoteActive = (setAt?: string): boolean => {
  if (!setAt) return false;
  return Date.now() - new Date(setAt).getTime() < 7 * 24 * 60 * 60 * 1000;
};

export default function UserProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const { user: currentUser } = useUser();
  const requireAuth = useRequireAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [sessions, setSessions] = useState<any[]>([]);
  const [continuationToken, setContinuationToken] = useState('');
  const seenIdsRef = useRef(new Set<string>());

  const isSelf = currentUser?.handle === handle;

  // Profile data
  const { data: userData, isLoading } = useGetUserQuery({
    handle: handle ?? '',
    viewerId: currentUser?.id,
  });
  const profile = userData?.results?.photographer ?? userData?.results;

  // Sessions
  const { data: sessionsData, isFetching: sessionsFetching } = useGetUserSessionsQuery(
    { handle: handle ?? '', selfFlag: isSelf, limit: 10, continuationToken: '' },
    { skip: !profile }
  );

  useEffect(() => {
    const sessionsList = sessionsData?.results?.sessions ?? [];
    if (sessionsList.length > 0) {
      seenIdsRef.current = new Set();
      const unique = sessionsList.filter((s: any) => {
        const key = s.session_id ?? s.id;
        if (seenIdsRef.current.has(key)) return false;
        seenIdsRef.current.add(key);
        return true;
      });
      setSessions(unique);
    }
  }, [sessionsData]);

  // Follow
  const [followUser] = useFollowUserMutation();
  const handleFollow = useCallback(() => {
    if (!requireAuth()) return;
    if (!profile?.id) return;
    const action = profile.isFollowing ? 'unfollow' : 'follow';
    followUser({ userId: profile.id, action });
  }, [profile, requireAuth, followUser]);

  // Share profile
  const handleShare = useCallback(async () => {
    const shareUrl = `https://app.surf-vault.com/${handle}`;
    await Share.share(
      Platform.OS === 'ios' ? { url: shareUrl } : { message: shareUrl }
    );
  }, [handle]);

  // Message
  const handleMessage = useCallback(() => {
    if (!requireAuth()) return;
    // TODO: Navigate to conversation with this user
  }, [requireAuth]);

  const hasActiveNote = !!profile?.status_note && isNoteActive(profile?.status_note_set_at);
  const isPrivate = profile?.access === 'private' && !isSelf;
  const userType = profile?.user_type;

  const ProfileHeader = () => (
    <View style={styles.profileWrap}>
      {/* Row 1: Avatar + (Name + Stats) */}
      <View style={styles.topRow}>
        <UserAvatar
          uri={profile?.picture}
          name={profile?.name ?? profile?.handle}
          size={80}
          active={profile?.active}
          verified={profile?.verified}
          hasStatusNote={hasActiveNote}
        />
        <View style={styles.rightColumn}>
          {/* Name + active dot + social icons */}
          <View style={styles.nameRowOuter}>
            <View style={styles.nameAndDot}>
              <Text style={[styles.nameText, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                {profile?.name ?? profile?.handle ?? handle}
              </Text>
              <View style={[
                styles.activeDot,
                { backgroundColor: profile?.active ? '#10b981' : 'transparent', borderWidth: profile?.active ? 0 : 1, borderColor: '#9ca3af' },
              ]} />
            </View>
            {(profile?.instagram || profile?.youtube || profile?.website) && (
              <View style={styles.socialIcons}>
                {profile?.instagram && (
                  <Pressable onPress={() => Linking.openURL(`https://instagram.com/${profile.instagram.replace(/^@/, '')}`)} hitSlop={6}>
                    <Ionicons name="logo-instagram" size={16} color="#ec4899" />
                  </Pressable>
                )}
                {profile?.youtube && (
                  <Pressable onPress={() => Linking.openURL(`https://youtube.com/@${profile.youtube}`)} hitSlop={6}>
                    <Ionicons name="logo-youtube" size={16} color="#ef4444" />
                  </Pressable>
                )}
                {profile?.website && (
                  <Pressable onPress={() => Linking.openURL(profile.website?.startsWith('http') ? profile.website : `https://${profile.website}`)} hitSlop={6}>
                    <Ionicons name="link-outline" size={16} color="#3b82f6" />
                  </Pressable>
                )}
              </View>
            )}
          </View>
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: isDark ? '#fff' : '#111827' }]}>
                {profile?.surfBreaksCount ?? 0}
              </Text>
              <Text style={styles.statLabel}>spots</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: isDark ? '#fff' : '#111827' }]}>
                {profile?.followersCount ?? 0}
              </Text>
              <Text style={styles.statLabel}>followers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: isDark ? '#fff' : '#111827' }]}>
                {profile?.followingCount ?? 0}
              </Text>
              <Text style={styles.statLabel}>following</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Private badge */}
      {isPrivate && (
        <View style={[styles.rolePill, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2', alignSelf: 'flex-start', marginBottom: 4 }]}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: isDark ? '#fca5a5' : '#dc2626' }}>Private</Text>
        </View>
      )}

      {/* Bio */}
      {profile?.bio && (
        <Text style={[styles.bioText, { color: isDark ? '#d1d5db' : '#374151' }]}>
          {profile.bio}
        </Text>
      )}

      {/* Role pill + Tags */}
      {(userType || (profile?.tags?.length ?? 0) > 0) && (
        <View style={styles.tagsRow}>
          {userType && (
            <View style={[styles.tagPill, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
            }]}>
              <Text style={{ fontSize: 11, fontWeight: '500', color: isDark ? '#d1d5db' : '#475569' }}>
                {userType === 'photographer' ? '📸 Photographer' : '🏄‍♂️ Surfer'}
              </Text>
            </View>
          )}
          {profile?.tags?.map((tag: string) => (
            <View key={tag} style={[styles.tagPill, {
              backgroundColor: isDark ? 'rgba(99,102,241,0.1)' : '#eef2ff',
            }]}>
              <Text style={{ fontSize: 11, fontWeight: '500', color: isDark ? '#a5b4fc' : '#4338ca' }}>
                {tag}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Status note */}
      {hasActiveNote && (
        <View style={[styles.statusNote, {
          backgroundColor: isDark ? 'rgba(14,165,233,0.08)' : '#f0f9ff',
          borderColor: isDark ? 'rgba(14,165,233,0.2)' : '#bae6fd',
        }]}>
          <Ionicons name="chatbubble-outline" size={13} color="#0ea5e9" style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 13, color: isDark ? '#7dd3fc' : '#0369a1', flex: 1 }}>
            {profile.status_note}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      {!isSelf && profile && (
        <View style={styles.actionRow}>
          <Pressable onPress={handleFollow} style={[styles.actionBtn, {
            backgroundColor: profile.isFollowing ? (isDark ? '#1f2937' : '#f3f4f6') : '#0ea5e9',
          }]}>
            <Text style={[styles.actionBtnText, {
              color: profile.isFollowing ? (isDark ? '#fff' : '#111827') : '#fff',
            }]}>
              {profile.isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
          <Pressable onPress={handleMessage} style={[styles.actionBtn, {
            backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
          }]}>
            <Text style={[styles.actionBtnText, { color: isDark ? '#fff' : '#111827' }]}>Message</Text>
          </Pressable>
          <Pressable onPress={handleShare} style={[styles.iconBtn, {
            backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
          }]}>
            <Ionicons name="share-outline" size={18} color={isDark ? '#fff' : '#374151'} />
          </Pressable>
        </View>
      )}

      {/* Divider before sessions */}
      <View style={[styles.divider, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]} />
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: '',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="chevron-back" size={28} color="#007AFF" />
              <Text style={{ fontSize: 17, color: '#007AFF' }}>{profile?.handle ?? handle}</Text>
            </Pressable>
          ),
        }}
      />
      <SafeAreaView style={[styles.flex, { backgroundColor: isDark ? '#030712' : '#ffffff' }]} edges={[]}>
        {isLoading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" /></View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.session_id ?? item.id}
            renderItem={({ item }) => (
              <View style={{ paddingHorizontal: 16 }}>
                <SessionCard session={item} hidePhotographer />
              </View>
            )}
            ListHeaderComponent={<ProfileHeader />}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ color: '#9ca3af' }}>No sessions yet</Text>
              </View>
            }
            ListFooterComponent={
              sessionsFetching ? <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View> : null
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },

  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rightColumn: { flex: 1, marginLeft: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingRight: 16 },
  statItem: { alignItems: 'flex-start' },
  statNumber: { fontSize: 15, fontWeight: '600' },
  statLabel: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  nameRowOuter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameAndDot: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  nameText: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  rolePill: { borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  rolePillText: { fontSize: 12 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  socialIcons: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 2 },

  bioText: { fontSize: 14, lineHeight: 19, marginBottom: 8 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  tagPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },

  statusNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
  },

  actionRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  iconBtn: { width: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  divider: { height: 1, marginBottom: 8 },


});
