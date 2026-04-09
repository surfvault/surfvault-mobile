import '../global.css';
import { useEffect, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Auth0Provider } from 'react-native-auth0';
import { Provider as ReduxProvider } from 'react-redux';
import Constants from 'expo-constants';
import { store, useGetSelfQuery, useUpdateUserPushTokenMutation } from '../src/store';
import { AuthProvider, useAuth } from '../src/context/AuthProvider';
import { UserProvider } from '../src/context/UserProvider';
import { usePusher } from '../src/hooks/usePusher';
import { NavigationProvider } from '../src/context/NavigationContext';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function requestNotificationPermissions() {
  if (!Device.isDevice) return; // Skip on simulator
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return;
  await Notifications.requestPermissionsAsync();
}

SplashScreen.preventAutoHideAsync();

function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Only fetch self if authenticated
  const { data: selfData, isLoading: selfLoading } = useGetSelfQuery(undefined, {
    skip: !isAuthenticated,
  });

  const user = isAuthenticated ? (selfData?.results?.user ?? selfData?.results ?? null) : null;
  const isOnboarded = user?.onboarded;

  // Set up Pusher when we have a user
  usePusher({ userId: user?.id });

  // Push token registration
  const [updatePushToken] = useUpdateUserPushTokenMutation();
  const pushTokenRegistered = useRef(false);

  useEffect(() => {
    if (!user?.id || !Device.isDevice || pushTokenRegistered.current) return;

    (async () => {
      try {
        await requestNotificationPermissions();
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return;

        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (token) {
          await updatePushToken({ expoPushToken: token });
          pushTokenRegistered.current = true;
        }
      } catch (e) {
        console.warn('Failed to register push token:', e);
      }
    })();
  }, [user?.id]);

  // Handle notification tap deep linking
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (!data?.screen) return;

      switch (data.screen) {
        case 'notifications':
          router.push('/notifications' as any);
          break;
        case 'messages':
          router.push('/(tabs)/messages' as any);
          break;
        case 'conversation':
          if (data.conversationId) router.push(`/conversation/${data.conversationId}` as any);
          break;
      }
    });

    return () => subscription.remove();
  }, [router]);

  // Request notification permissions on first launch (non-authenticated)
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && selfLoading) return;

    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';

    // If authenticated but not onboarded, send to onboarding
    if (isAuthenticated && !isOnboarded && inAuthGroup) {
      const secondSegment = (segments as string[])[1];
      if (secondSegment !== 'onboarding') {
        router.replace('/(auth)/onboarding');
      }
    }

    // If authenticated + onboarded and still on auth screens, go to tabs
    if (isAuthenticated && isOnboarded && inAuthGroup) {
      router.replace('/(tabs)');
    }

    // If not authenticated and not on tabs, go to home
    if (!isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, selfLoading, isOnboarded, segments]);

  return (
    <UserProvider user={user}>
      <Slot />
      <StatusBar style="auto" />
    </UserProvider>
  );
}

export default function RootLayout() {
  const auth0Domain = Constants.expoConfig?.extra?.auth0Domain ?? '';
  const auth0ClientId = Constants.expoConfig?.extra?.auth0ClientId ?? '';

  const [fontsLoaded] = useFonts({
    SurfVaultFont: require('../assets/fonts/SurfVaultFont.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationProvider>
        <Auth0Provider domain={auth0Domain} clientId={auth0ClientId}>
          <ReduxProvider store={store}>
            <AuthProvider>
              <AppShell />
            </AuthProvider>
          </ReduxProvider>
        </Auth0Provider>
      </NavigationProvider>
    </GestureHandlerRootView>
  );
}
