import '../global.css';
import { useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useFonts } from 'expo-font';
import { Auth0Provider } from 'react-native-auth0';
import { Provider as ReduxProvider } from 'react-redux';
import Constants from 'expo-constants';
import { store, useGetSelfQuery } from '../src/store';
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

  // Request notification permissions on first launch
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
    <NavigationProvider>
      <Auth0Provider domain={auth0Domain} clientId={auth0ClientId}>
        <ReduxProvider store={store}>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </ReduxProvider>
      </Auth0Provider>
    </NavigationProvider>
  );
}
