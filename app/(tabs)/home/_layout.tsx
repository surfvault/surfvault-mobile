import { useEffect } from 'react';
import { Stack, usePathname } from 'expo-router';
import { useTabBar } from '../../../src/context/TabBarContext';

export default function HomeStackLayout() {
  const pathname = usePathname();
  const { setTabBarVisible } = useTabBar();

  // Hide tab bar when inside a detail screen
  useEffect(() => {
    const isDetail = pathname !== '/' && pathname.startsWith('/home/') && !pathname.startsWith('/home/session/');
    setTabBarVisible(!isDetail);
    return () => setTabBarVisible(true);
  }, [pathname, setTabBarVisible]);

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
