import { View, Text, ActivityIndicator, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useGetAdminAdQuery } from '../../../src/store';
import CampaignUpload from '../../../src/components/CampaignUpload';

/**
 * Admin read-only campaign review screen. Opened by tapping a
 * newCampaignSubmission notification. Fetches the single ad via the admin
 * endpoint (full media[] + targeting) and renders CampaignUpload in readOnly
 * mode. Approve/Reject lives back on the notification.
 */
export default function ReviewCampaignScreen() {
  const { adId } = useLocalSearchParams<{ adId: string }>();
  const isDark = useColorScheme() === 'dark';
  const { data, isLoading, isError } = useGetAdminAdQuery({ adId }, { skip: !adId });
  const ad = (data as any)?.results?.ad;

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#000' : '#fff' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={isDark ? '#6b7280' : '#9ca3af'} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !ad) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#000' : '#fff' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#9ca3af', textAlign: 'center' }}>
            Campaign not found. It may have been deleted.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CampaignUpload editingAd={ad} readOnly />
    </>
  );
}
