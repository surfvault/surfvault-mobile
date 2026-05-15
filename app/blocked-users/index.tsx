import { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSmartBack } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import UserAvatar from '../../src/components/UserAvatar';
import {
  useGetUserBlocksQuery,
  useUnblockUserMutation,
} from '../../src/store';
import { useAuth } from '../../src/context/AuthProvider';

export default function BlockedUsersScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const goBack = useSmartBack();
  const { isAuthenticated } = useAuth();

  const { data, isLoading, refetch } = useGetUserBlocksQuery(undefined, { skip: !isAuthenticated });
  const [unblockUser, { isLoading: isUnblocking }] = useUnblockUserMutation();

  const blocked = data?.results?.blockedUsers ?? [];

  const confirmUnblock = useCallback((userId: string, handle: string) => {
    Alert.alert(
      `Unblock @${handle}?`,
      "They'll be able to message you and you'll see their content again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await unblockUser({ userId }).unwrap();
              refetch();
            } catch (e: any) {
              Alert.alert('Could not unblock', e?.data?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  }, [unblockUser, refetch]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        left={
          <Pressable onPress={goBack} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="chevron-back" size={28} color={isDark ? '#fff' : '#000'} />
            <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#fff' : '#111827' }}>
              Blocked Users
            </Text>
          </Pressable>
        }
      />
      <SafeAreaView style={[styles.flex, { backgroundColor: isDark ? '#000' : '#fff' }]} edges={[]}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={isDark ? '#fff' : '#111827'} />
          </View>
        ) : blocked.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="shield-checkmark-outline" size={42} color={isDark ? '#374151' : '#d1d5db'} />
            <Text style={[styles.emptyTitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
              No blocked users
            </Text>
            <Text style={[styles.emptyBody, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
              When you block someone, they'll appear here so you can unblock them later.
            </Text>
          </View>
        ) : (
          <FlatList
            data={blocked}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }) => (
              <View style={[styles.row, { borderBottomColor: isDark ? '#1f2937' : '#f1f5f9' }]}>
                <UserAvatar
                  uri={item.picture}
                  name={item.name ?? item.handle}
                  size={44}
                  active={false}
                />
                <View style={styles.rowText}>
                  <Text style={[styles.handle, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                    @{item.handle}
                  </Text>
                  {item.name ? (
                    <Text style={[styles.name, { color: isDark ? '#9ca3af' : '#6b7280' }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => confirmUnblock(item.id, item.handle)}
                  disabled={isUnblocking}
                  style={[styles.unblockBtn, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}
                >
                  <Text style={[styles.unblockText, { color: isDark ? '#fff' : '#111827' }]}>
                    Unblock
                  </Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyBody: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, marginLeft: 12, minWidth: 0 },
  handle: { fontSize: 15, fontWeight: '600' },
  name: { fontSize: 13, marginTop: 1 },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  unblockText: { fontSize: 13, fontWeight: '600' },
});
