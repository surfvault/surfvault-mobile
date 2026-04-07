import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useGetUnreadMessageCountQuery, useGetNotificationsQuery } from '../../src/store';
import { useAuth } from '../../src/context/AuthProvider';
import { TabBarProvider, useTabBar } from '../../src/context/TabBarContext';

function TabsInner() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { tabBarVisible } = useTabBar();

  const { isAuthenticated } = useAuth();

  const { data: unreadData } = useGetUnreadMessageCountQuery(undefined, { skip: !isAuthenticated });
  const unreadCount = unreadData?.results?.unreadCount ?? unreadData?.results?.totalUnreadMessages ?? 0;

  const { data: notifData } = useGetNotificationsQuery(
    { read: false, filter: '', limit: 0, continuationToken: '' },
    { skip: !isAuthenticated }
  );
  const unreadNotifCount = notifData?.results?.notifications?.length ?? 0;

  // Update app badge count
  useEffect(() => {
    const total = unreadCount + unreadNotifCount;
    Notifications.setBadgeCountAsync(total).catch(() => {});
  }, [unreadCount, unreadNotifCount]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0ea5e9',
        tabBarInactiveTintColor: isDark ? '#6b7280' : '#9ca3af',
        tabBarStyle: tabBarVisible
          ? {
              backgroundColor: isDark ? '#030712' : '#ffffff',
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
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
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
