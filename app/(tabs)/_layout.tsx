import { useEffect, useMemo, useCallback } from 'react';
import { Tabs } from 'expo-router';
import { useColorScheme, View, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useUser } from '../../src/context/UserProvider';
import * as Notifications from 'expo-notifications';
import { useGetUnreadMessageCountQuery, useGetNotificationsQuery } from '../../src/store';
import { useAuth } from '../../src/context/AuthProvider';
import { TabBarProvider, useTabBar } from '../../src/context/TabBarContext';
import { useActiveTab } from '../../src/context/NavigationContext';
import UploadProgressPill from '../../src/components/UploadProgressPill';

function TabsInner() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { tabBarVisible } = useTabBar();

  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const { setActiveTab } = useActiveTab();

  const tabMap = useMemo<Record<string, string>>(() => ({
    index: '/(tabs)',
    map: '/(tabs)/map',
    upload: '/(tabs)/upload',
    messages: '/(tabs)/messages',
    profile: '/(tabs)/profile',
  }), []);

  const screenListeners = useMemo(() => ({
    state: (e: any) => {
      const state = e.data?.state;
      if (state) {
        const route = state.routes[state.index];
        const mapped = tabMap[route?.name] ?? '/(tabs)';
        setActiveTab(mapped);
      }
    },
  }), [tabMap, setActiveTab]);

  const { data: unreadData, refetch: refetchUnread } = useGetUnreadMessageCountQuery(
    undefined,
    { skip: !isAuthenticated }
  );
  const unreadCount = isAuthenticated
    ? Number(unreadData?.results?.unreadCount ?? unreadData?.results?.totalUnreadMessages ?? 0) || 0
    : 0;

  const { data: notifData, refetch: refetchNotifs } = useGetNotificationsQuery(
    { read: false, filter: '', limit: 0, continuationToken: '' },
    { skip: !isAuthenticated }
  );
  const unreadNotifCount = isAuthenticated
    ? (notifData?.results?.notifications?.length ?? 0)
    : 0;

  // Refetch counts when app returns to foreground. RTK Query's refetchOnFocus
  // depends on setupListeners having a React Native AppState bridge, which we
  // don't have, so we wire it here manually for the badge-driving queries.
  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refetchUnread();
        refetchNotifs();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, refetchUnread, refetchNotifs]);

  // Update app icon badge count. Always reflects unreadMessages + unreadNotifications.
  // Clears to 0 on logout (both values become 0 when queries are skipped).
  useEffect(() => {
    const total = unreadCount + unreadNotifCount;
    Notifications.setBadgeCountAsync(total).catch(() => {});
  }, [unreadCount, unreadNotifCount]);

  return (
    <Tabs
      screenListeners={screenListeners}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0ea5e9',
        tabBarInactiveTintColor: isDark ? '#6b7280' : '#9ca3af',
        tabBarStyle: tabBarVisible
          ? {
              backgroundColor: isDark ? '#000000' : '#ffffff',
              borderTopColor: isDark ? '#1f2937' : '#e5e7eb',
            }
          : { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Session',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: isAuthenticated && user?.picture ? '' : 'Profile',
          tabBarIcon: ({ color, size, focused }) => {
            if (isAuthenticated && user?.picture) {
              const avatarSize = size + 6;
              return (
                <View style={{
                  width: avatarSize + 4,
                  height: avatarSize + 4,
                  borderRadius: (avatarSize + 4) / 2,
                  borderWidth: 2,
                  borderColor: focused ? '#0ea5e9' : 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginTop: 6,
                }}>
                  <Image
                    source={{ uri: user.picture as string }}
                    style={{
                      width: avatarSize,
                      height: avatarSize,
                      borderRadius: avatarSize / 2,
                    }}
                    contentFit="cover"
                  />
                  {user?.active && (
                    <View style={{
                      position: 'absolute',
                      bottom: -1,
                      right: -1,
                      width: 13,
                      height: 13,
                      borderRadius: 7,
                      backgroundColor: '#10b981',
                      borderWidth: 1.5,
                      borderColor: isDark ? '#000000' : '#ffffff',
                    }} />
                  )}
                </View>
              );
            }
            return <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />;
          },
          tabBarBadge: unreadNotifCount > 0 ? unreadNotifCount : undefined,
        }}
      />
      {/* Hide nested stack routes from tab bar */}
      <Tabs.Screen name="home" options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <TabBarProvider>
      <TabsInner />
    </TabBarProvider>
  );
}
