import '../global.css';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { UploadProvider } from '../src/context/UploadContext';
import UploadProgressPill from '../src/components/UploadProgressPill';
import PendingDeletionBanner from '../src/components/PendingDeletionBanner';
import NotificationPrimingModal from '../src/components/NotificationPrimingModal';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function hasNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
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
  // Mirrors web onboarding gating: user is onboarded once they've picked a handle
  // (handle_changed) and chosen their user type (surfer/photographer).
  const isOnboarded = !!user?.handle_changed && !!user?.user_type;

  // Set up Pusher when we have a user
  usePusher({ userId: user?.id });

  // Push token registration — kept fresh against OS-initiated APNs rotation.
  // Runs on mount, on foreground, and on `addPushTokenListener` events. Only
  // writes to the server when the token actually changes.
  const [updatePushToken] = useUpdateUserPushTokenMutation();
  const lastSyncedToken = useRef<string | null>(null);

  const syncToken = useCallback(
    async (token: string) => {
      if (!token || token === lastSyncedToken.current) return;
      try {
        await updatePushToken({ expoPushToken: token }).unwrap();
        lastSyncedToken.current = token;
      } catch (e) {
        console.warn('Failed to sync push token:', e);
      }
    },
    [updatePushToken]
  );

  const registerPushToken = useCallback(async () => {
    if (!user?.id || !Device.isDevice) return;
    if (!(await hasNotificationPermission())) return;
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (token) await syncToken(token);
    } catch (e) {
      console.warn('Failed to register push token:', e);
    }
  }, [user?.id, syncToken]);

  // Register on mount / user change.
  useEffect(() => {
    registerPushToken();
  }, [registerPushToken]);

  // Re-register whenever the app comes to the foreground — catches tokens
  // rotated by iOS while the app was backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') registerPushToken();
    });
    return () => sub.remove();
  }, [registerPushToken]);

  // Push token rotation events from Expo/iOS — fires in-session when the
  // underlying APNs device token changes.
  useEffect(() => {
    const sub = Notifications.addPushTokenListener(({ data }) => {
      if (typeof data === 'string' && data) syncToken(data);
    });
    return () => sub.remove();
  }, [syncToken]);

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
        case 'session':
          if (data.sessionId) router.push(`/session/${data.sessionId}` as any);
          break;
        case 'user':
          if (data.userId) router.push(`/user/${data.userId}` as any);
          break;
        case 'access':
          if (data.requestId) router.push(`/access/${data.requestId}` as any);
          break;
      }
    });

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && selfLoading) return;

    SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';
    const onOnboarding = inAuthGroup && (segments as string[])[1] === 'onboarding';

    // If authenticated but not fully onboarded, force them to onboarding.
    if (isAuthenticated && !isOnboarded && !onOnboarding) {
      router.replace('/(auth)/onboarding');
      return;
    }

    // If authenticated + onboarded and on a non-onboarding auth screen (login),
    // route to tabs. NEVER redirect away from onboarding here — the onboarding
    // component manages its own transition to tabs when the user is done so
    // mid-flow state changes don't eject them early.
    if (isAuthenticated && isOnboarded && inAuthGroup && !onOnboarding) {
      router.replace('/(tabs)');
    }

    // If not authenticated and somehow in auth group, route to tabs (public content)
    if (!isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, selfLoading, isOnboarded, segments]);

  const bannerVisible = !!user?.deletion_requested_at && !user?.deleted_at;

  return (
    <UserProvider user={user}>
      <View style={{ flex: 1 }}>
        {bannerVisible && <PendingDeletionBanner />}
        {bannerVisible ? (
          // Nested SafeAreaProvider creates a new native context. Its view
          // sits below the banner (which consumed the status bar area), so
          // child screens' SafeAreaView will see native insets.top = 0 and
          // won't double-pad for the status bar.
          <SafeAreaProvider style={{ flex: 1 }}>
            <Slot />
          </SafeAreaProvider>
        ) : (
          <Slot />
        )}
        <UploadProgressPill />
        <NotificationPrimingModal
          isOnboarded={isOnboarded}
          onPermissionChanged={registerPushToken}
        />
        <StatusBar style="auto" />
      </View>
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
              <ActionSheetProvider useCustomActionSheet>
                <UploadProvider>
                  <AppShell />
                </UploadProvider>
              </ActionSheetProvider>
            </AuthProvider>
          </ReduxProvider>
        </Auth0Provider>
      </NavigationProvider>
    </GestureHandlerRootView>
  );
}
