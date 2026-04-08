import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../src/context/UserProvider';
import { useAuth } from '../../src/context/AuthProvider';
import { useGetConversationsQuery } from '../../src/store';
import UserAvatar from '../../src/components/UserAvatar';
import SearchBar from '../../src/components/SearchBar';

const formatTime = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function MessagesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useUser();
  const { isAuthenticated, login } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useGetConversationsQuery(undefined, {
    skip: !isAuthenticated,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const conversations = data?.results?.conversations ?? [];

  // Filter by search
  const filtered = searchTerm
    ? conversations.filter((c: any) => {
        const other = user?.id === c.participant_one?.id ? c.participant_two : c.participant_one;
        const handle = other?.handle ?? '';
        const name = other?.name ?? '';
        const lastMsg = c.last_message?.body ?? '';
        const term = searchTerm.toLowerCase();
        return handle.toLowerCase().includes(term) || name.toLowerCase().includes(term) || lastMsg.toLowerCase().includes(term);
      })
    : conversations;

  // Not logged in
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111827' }]}>Messages</Text>
        </View>
        <View style={styles.emptyWrap}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={isDark ? '#374151' : '#d1d5db'} />
          <Text style={[styles.emptyTitle, { color: isDark ? '#fff' : '#111827' }]}>
            Connect with photographers and surfers
          </Text>
          <Text style={[styles.emptySubtitle, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            Request photos, coordinate sessions, and chat directly
          </Text>
          <Pressable onPress={login} style={styles.signInBtn}>
            <Text style={styles.signInText}>Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const renderConversation = ({ item }: { item: any }) => {
    const other = user?.id === item.participant_one?.id ? item.participant_two : item.participant_one;
    const unreadCount = user?.id === item.participant_one?.id
      ? item.participant_one_unread_count
      : item.participant_two_unread_count;
    const hasUnread = unreadCount > 0;
    const lastMessage = item.last_message?.body ?? '';

    return (
      <Pressable
        onPress={() => router.push(`/conversation/${item.id}` as any)}
        style={[styles.conversationRow, { borderBottomColor: isDark ? '#1f2937' : '#f3f4f6' }]}
      >
        <UserAvatar
          uri={other?.picture}
          name={other?.name ?? other?.handle}
          size={48}
          verified={other?.verified}
          active={other?.active}
        />
        <View style={styles.conversationInfo}>
          <View style={styles.conversationTop}>
            <Text
              style={[styles.conversationHandle, hasUnread && styles.conversationHandleBold, { color: isDark ? '#fff' : '#111827' }]}
              numberOfLines={1}
            >
              {other?.handle}
            </Text>
            <Text style={[styles.conversationTime, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
              {formatTime(item.updated_at)}
            </Text>
          </View>
          <View style={styles.conversationBottom}>
            <Text
              style={[
                styles.conversationPreview,
                hasUnread && styles.conversationPreviewBold,
                { color: hasUnread ? (isDark ? '#fff' : '#111827') : (isDark ? '#6b7280' : '#9ca3af') },
              ]}
              numberOfLines={2}
            >
              {lastMessage}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : '#111827' }]}>Messages</Text>
      </View>

      {conversations.length > 3 && (
        <View style={styles.searchWrap}>
          <SearchBar placeholder="Search messages..." onSearch={setSearchTerm} debounceMs={250} />
        </View>
      )}

      {isLoading ? (
        <View style={styles.emptyWrap}><ActivityIndicator size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubbles-outline" size={56} color={isDark ? '#374151' : '#d1d5db'} />
              <Text style={[styles.emptyTitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                {searchTerm ? 'No conversations found' : 'No messages yet'}
              </Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
  signInBtn: { marginTop: 16, backgroundColor: '#0ea5e9', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
  signInText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  conversationRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  conversationInfo: { flex: 1, marginLeft: 12 },
  conversationTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  conversationHandle: { fontSize: 15, flex: 1, marginRight: 12 },
  conversationHandleBold: { fontWeight: '700' },
  conversationTime: { fontSize: 12 },
  conversationBottom: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  conversationPreview: { fontSize: 14, flex: 1, marginRight: 12, lineHeight: 19 },
  conversationPreviewBold: { fontWeight: '600' },
  unreadBadge: {
    backgroundColor: '#0ea5e9', borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
