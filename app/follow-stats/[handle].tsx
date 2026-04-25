import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import UserAvatar from '../../src/components/UserAvatar';
import { useGetUserQuery, useGetUserFollowingQuery } from '../../src/store';
import { useUser } from '../../src/context/UserProvider';

type Tab = 'followers' | 'following';

export default function FollowStatsScreen() {
  const { handle, tab: tabParam } = useLocalSearchParams<{ handle: string; tab?: string }>();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user: currentUser } = useUser();

  const initialTab: Tab = tabParam === 'following' ? 'following' : 'followers';
  const [tab, setTab] = useState<Tab>(initialTab);

  const [typingTerm, setTypingTerm] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [continuationToken, setContinuationToken] = useState('');
  const [items, setItems] = useState<any[]>([]);

  const seenIdsRef = useRef(new Set<string>());
  const hasMoreRef = useRef(false);
  const isFetchingMoreRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch the profile so we can show follower / following counts on the tab pills
  const { data: userData } = useGetUserQuery(
    { handle: handle ?? '', viewerId: currentUser?.id },
    { skip: !handle }
  );
  const profile = userData?.results?.photographer ?? userData?.results;
  const followersCount = profile?.followersCount ?? 0;
  const followingCount = profile?.followingCount ?? 0;

  const { data, isFetching } = useGetUserFollowingQuery(
    {
      handle: handle ?? '',
      filter: tab,
      search: searchTerm,
      limit: 20,
      continuationToken,
    },
    { skip: !handle, refetchOnMountOrArgChange: true }
  );

  // Reset + accumulate on pagination
  useEffect(() => {
    if (!data?.results) return;
    const batch: any[] = data.results.followStats ?? [];
    const nextToken: string = data.results.continuationToken || '';
    hasMoreRef.current = Boolean(nextToken);

    if (!continuationToken) {
      seenIdsRef.current = new Set();
      const unique: any[] = [];
      for (const u of batch) {
        const key = u.id ?? u.handle;
        if (!key || seenIdsRef.current.has(key)) continue;
        seenIdsRef.current.add(key);
        unique.push(u);
      }
      setItems(unique);
    } else {
      setItems((prev) => {
        const add: any[] = [];
        for (const u of batch) {
          const key = u.id ?? u.handle;
          if (!key || seenIdsRef.current.has(key)) continue;
          seenIdsRef.current.add(key);
          add.push(u);
        }
        return add.length ? prev.concat(add) : prev;
      });
    }
    isFetchingMoreRef.current = false;
  }, [data, continuationToken]);

  const handleSearchChange = useCallback((text: string) => {
    setTypingTerm(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setContinuationToken('');
      setItems([]);
      seenIdsRef.current = new Set();
      setSearchTerm(text);
    }, 400);
  }, []);

  const switchTab = useCallback((next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setTypingTerm('');
    setSearchTerm('');
    setContinuationToken('');
    setItems([]);
    seenIdsRef.current = new Set();
  }, [tab]);

  const handleLoadMore = useCallback(() => {
    if (!hasMoreRef.current || isFetchingMoreRef.current || isFetching) return;
    const nextToken = data?.results?.continuationToken;
    if (!nextToken) return;
    isFetchingMoreRef.current = true;
    setContinuationToken(nextToken);
  }, [data, isFetching]);

  const handleSelect = useCallback((selectedHandle: string) => {
    Keyboard.dismiss();
    trackedPush(`/user/${selectedHandle}` as any);
  }, [trackedPush]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    const userType = item.user_type;
    return (
      <Pressable
        onPress={() => handleSelect(item.handle)}
        android_ripple={{ color: isDark ? '#111827' : '#f1f5f9' }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: isDark ? '#1f2937' : '#f1f5f9',
          width: '100%',
        }}
      >
        <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <UserAvatar
            uri={item.picture}
            name={item.name ?? item.handle}
            size={42}
            verified={item.verified}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 12, marginRight: 8 }}>
          <Text
            style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#fff' : '#111827' }}
            numberOfLines={1}
          >
            {item.name || item.handle}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Text
              style={{ fontSize: 13, color: isDark ? '#9ca3af' : '#6b7280', flexShrink: 1 }}
              numberOfLines={1}
            >
              {item.handle}
            </Text>
            {userType === 'photographer' && (
              <>
                <Text style={{ fontSize: 13, color: isDark ? '#6b7280' : '#9ca3af', marginHorizontal: 4 }}>·</Text>
                <Ionicons name="camera-outline" size={13} color={isDark ? '#9ca3af' : '#6b7280'} />
              </>
            )}
            {userType && userType !== 'photographer' && (
              <>
                <Text style={{ fontSize: 13, color: isDark ? '#6b7280' : '#9ca3af', marginHorizontal: 4 }}>·</Text>
                <MaterialCommunityIcons name="surfing" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
              </>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={isDark ? '#4b5563' : '#cbd5e1'} />
      </Pressable>
    );
  }, [handleSelect, isDark]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={handle ?? ''}
        left={
          <Pressable onPress={smartBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color="#007AFF" />
          </Pressable>
        }
      />
      <SafeAreaView style={[s.flex, { backgroundColor: isDark ? '#000000' : '#ffffff' }]} edges={[]}>
        {/* Tabs */}
        <View style={[s.tabs, { backgroundColor: isDark ? '#1f2937' : '#f1f5f9' }]}>
          <Pressable
            onPress={() => switchTab('followers')}
            style={[s.tab, tab === 'followers' && { backgroundColor: isDark ? '#374151' : '#ffffff' }]}
          >
            <Text style={[s.tabText, { color: tab === 'followers' ? (isDark ? '#fff' : '#111827') : (isDark ? '#9ca3af' : '#64748b') }]}>
              <Text style={s.tabCount}>{followersCount}</Text> Followers
            </Text>
          </Pressable>
          <Pressable
            onPress={() => switchTab('following')}
            style={[s.tab, tab === 'following' && { backgroundColor: isDark ? '#374151' : '#ffffff' }]}
          >
            <Text style={[s.tabText, { color: tab === 'following' ? (isDark ? '#fff' : '#111827') : (isDark ? '#9ca3af' : '#64748b') }]}>
              <Text style={s.tabCount}>{followingCount}</Text> Following
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={[s.searchWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
          <Ionicons name="search-outline" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
          <TextInput
            value={typingTerm}
            onChangeText={handleSearchChange}
            placeholder="Search..."
            placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            autoCapitalize="none"
            autoCorrect={false}
            style={[s.searchInput, { color: isDark ? '#fff' : '#111827' }]}
          />
          {typingTerm.length > 0 && (
            <Pressable onPress={() => handleSearchChange('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={isDark ? '#6b7280' : '#9ca3af'} />
            </Pressable>
          )}
        </View>

        {/* List */}
        <FlatList
          data={items}
          keyExtractor={(item) => item.id ?? item.handle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={renderItem}
          ListEmptyComponent={
            isFetching ? (
              <View style={s.centered}><ActivityIndicator /></View>
            ) : (
              <View style={s.centered}>
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>
                  {searchTerm ? 'No results found.' : `No ${tab} yet.`}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            isFetching && items.length > 0 ? (
              <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View>
            ) : null
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 10,
    padding: 3,
    gap: 4,
    marginBottom: 10,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabText: { fontSize: 13 },
  tabCount: { fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  centered: { paddingVertical: 48, alignItems: 'center' },
});
