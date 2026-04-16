import '../global.css';
import { useEffect, useRef } from 'react';
import { Platform, Alert, View } from 'react-native';
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
import { store, useGetSelfQuery, useUpdateUserPushTokenMutation, useCancelAccountDeletionMutation } from '../src/store';
import { AuthProvider, useAuth } from '../src/context/AuthProvider';
import { UserProvider } from '../src/context/UserProvider';
import { usePusher } from '../src/hooks/usePusher';
import { NavigationProvider } from '../src/context/NavigationContext';
import { UploadProvider } from '../src/context/UploadContext';
import UploadProgressPill from '../src/components/UploadProgressPill';
import PendingDeletionBanner from '../src/components/PendingDeletionBanner';
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

async function requestNotificationPermissions() {
  if (!Device.isDevice) {
    console.log('[Notifications] Skipping — not a physical device');
    return;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  console.log('[Notifications] Current permission status:', existing);
  if (existing === 'granted') return;
  const { status } = await Notifications.requestPermissionsAsync();
  console.log('[Notifications] Permission request result:', status);
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

  // Prompt to cancel account deletion if pending
  const [cancelDeletion] = useCancelAccountDeletionMutation();
  const deletionPromptShown = useRef(false);

  useEffect(() => {
    if (!user?.deletion_requested_at || deletionPromptShown.current) return;
    deletionPromptShown.current = true;

    const deletionDate = new Date(user.deletion_scheduled_for).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    Alert.alert(
      'Account Scheduled for Deletion',
      `Your account will be permanently deleted on ${deletionDate}. Would you like to cancel the deletion and keep your account?\n\nIf your paid subscription is still active, it will be restored automatically. If it already ended during the grace period, you'll come back on the Free plan.`,
      [
        { text: 'Continue Deletion', style: 'cancel' },
        {
          text: 'Cancel Deletion',
          onPress: async () => {
            try {
              await cancelDeletion({}).unwrap();
              Alert.alert('Deletion Cancelled', 'Your account has been restored.');
            } catch {
              Alert.alert('Error', 'Failed to cancel deletion. Please try again from Account settings.');
            }
          },
        },
      ]
    );
  }, [user?.deletion_requested_at]);

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

  // Request notification permissions after splash screen hides and location dialog settles
  const notifRequested = useRef(false);
  useEffect(() => {
    if (isLoading) return; // Wait until auth state is resolved (splash still showing)
    if (notifRequested.current) return;
    notifRequested.current = true;
    const timer = setTimeout(() => requestNotificationPermissions(), 3000);
    return () => clearTimeout(timer);
  }, [isLoading]);

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
