import { useMemo } from 'react';
import { View, Text, ActivityIndicator, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useGetMyCampaignsQuery } from '../../../src/store';
import CampaignUpload from '../../../src/components/CampaignUpload';

/**
 * Campaign edit screen. Reuses the CampaignUpload form in edit mode. The
 * ad to edit is pulled from the already-cached /campaigns list (RTK Query
 * dedupes, so this rarely refetches) and matched by id. No dedicated
 * single-ad GET endpoint needed.
 */
export default function EditCampaignScreen() {
  const { adId } = useLocalSearchParams<{ adId: string }>();
  const isDark = useColorScheme() === 'dark';
  const { data, isLoading } = useGetMyCampaignsQuery(undefined);

  const ad = useMemo(
    () => (data?.results?.ads ?? []).find((a: any) => a.id === adId),
    [data, adId],
  );

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

  if (!ad) {
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
      <CampaignUpload editingAd={ad} />
    </>
  );
}
