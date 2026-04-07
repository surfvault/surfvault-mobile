import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Share,
  StyleSheet,
  useColorScheme,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../src/context/UserProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import ProfileHeader from '../../src/components/ProfileHeader';
import {
  useGetUserQuery,
  useGetUserSessionsQuery,
  useFollowUserMutation,
} from '../../src/store';
import SessionCard from '../../src/components/SessionCard';

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
    if (profile?.conversationId) {
      router.push(`/conversation/${profile.conversationId}` as any);
    }
    // If no existing conversation, the start conversation flow will be handled separately
  }, [requireAuth, profile, router]);

  const UserProfileHeader = () => (
    <ProfileHeader
      profile={profile}
      isDark={isDark}
      isSelf={isSelf}
      isFollowing={profile?.isFollowing}
      currentBreakName={profile?.surf_break_name}
      onFollow={handleFollow}
      onMessage={handleMessage}
      onShare={handleShare}
    />
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
              <SessionCard session={item} hidePhotographer />
            )}
            ListHeaderComponent={<UserProfileHeader />}
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
