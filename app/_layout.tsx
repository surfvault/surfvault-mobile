import '../global.css';
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Auth0Provider } from 'react-native-auth0';
import { Provider as ReduxProvider } from 'react-redux';
import Constants from 'expo-constants';
import { store, useGetSelfQuery } from '../src/store';
import { AuthProvider, useAuth } from '../src/context/AuthProvider';
import { UserProvider } from '../src/context/UserProvider';
import { usePusher } from '../src/hooks/usePusher';

SplashScreen.preventAutoHideAsync();

function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Only fetch self if authenticated
  const { data: selfData, isLoading: selfLoading } = useGetSelfQuery(undefined, {
    skip: !isAuthenticated,
  });

  const user = isAuthenticated ? (selfData?.results ?? null) : null;
  const isOnboarded = user?.onboarded;

  // Set up Pusher when we have a user
  usePusher({ userId: user?.id });

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

  return (
    <Auth0Provider domain={auth0Domain} clientId={auth0ClientId}>
      <ReduxProvider store={store}>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ReduxProvider>
    </Auth0Provider>
  );
}
