import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGetUnreadMessageCountQuery } from '../../src/store';
import { TabBarProvider, useTabBar } from '../../src/context/TabBarContext';

function TabsInner() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { tabBarVisible } = useTabBar();

  const { data: unreadData } = useGetUnreadMessageCountQuery(undefined);
  const unreadCount = unreadData?.results?.unreadCount ?? 0;

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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Session',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
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
