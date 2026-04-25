import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useColorScheme,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useUser } from '../../src/context/UserProvider';
import { useRequireAuth } from '../../src/hooks/useRequireAuth';
import { useSmartBack } from '../../src/context/NavigationContext';
import {
  useGetSurfBreakWithLatestSessionsQuery,
  useGetSurfBreakSessionsQuery,
  useUpdateUserFavoritesMutation,
  useGetAdsQuery,
} from '../../src/store';
import SessionCard from '../../src/components/SessionCard';
import ScreenHeader from '../../src/components/ScreenHeader';
import SponsoredCard from '../../src/components/SponsoredCard';
import BreakSkeleton from '../../src/components/BreakSkeleton';
import { interleaveAds, type FeedRow } from '../../src/helpers/interleaveAds';

const formatDateLabel = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const formatDateParam = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function SurfBreakDetailScreen() {
  const { breakRoute } = useLocalSearchParams<{ breakRoute: string[] | string }>();
  // Catch-all returns an array of segments: ["US", "FLORIDA", "THE_MAYPORT_POLES"]
  const parts = Array.isArray(breakRoute) ? breakRoute : (breakRoute ?? '').split('/');
  const country = parts[0] ?? '';
  const region = parts.length >= 3 ? parts[1] : '0';
  const surfBreak = parts.length >= 3 ? parts[2] : parts[1] ?? parts[0] ?? '';

  const router = useRouter();
  const smartBack = useSmartBack();
  const { user } = useUser();
  const requireAuth = useRequireAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [continuationToken, setContinuationToken] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const seenIdsRef = useRef(new Set<string>());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [pickerDate, setPickerDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const dateStr = selectedDate ? formatDateParam(selectedDate) : '';

  const { data: initialData, isLoading } = useGetSurfBreakWithLatestSessionsQuery({
    userId: user?.id, country, region, surfBreak,
    date: dateStr || undefined,
  }, { refetchOnMountOrArgChange: true });

  const breakData = initialData?.results?.surfBreak;
  const initialSessions = initialData?.results?.sessions ?? [];
  const initialToken = initialData?.results?.continuationToken ?? '';
  const isFavorited = breakData?.is_favorited;

  // Ads scoped to this break — surfaces both explicitly-targeted ads and
  // partners within range of the break's coords. No placement filter on mobile:
  // sidebar inventory would otherwise be wasted since there is no sidebar rail.
  const { data: adsData } = useGetAdsQuery(
    { surfBreakId: breakData?.id, feed: true, limit: 6 },
    { skip: !breakData?.id }
  );
  const breakAds = useMemo(
    () => adsData?.results?.ads || [],
    [adsData]
  );

  // Interleave sessions + ads using the shared cadence (same on web + mobile).
  const feedRows = useMemo(
    () => interleaveAds(sessions, breakAds) as FeedRow<any, any>[],
    [sessions, breakAds]
  );

  useEffect(() => {
    seenIdsRef.current = new Set();
    if (initialSessions.length > 0) {
      const unique = initialSessions.filter((s: any) => {
        const key = s.session_id ?? s.id;
        if (seenIdsRef.current.has(key)) return false;
        seenIdsRef.current.add(key);
        return true;
      });
      setSessions(unique);
    } else {
      setSessions([]);
    }
    setContinuationToken(initialToken);
  }, [initialData]);

  const { data: moreData, isFetching: loadingMore } = useGetSurfBreakSessionsQuery(
    { surfBreakId: breakData?.id ?? '', limit: 10, continuationToken },
    { skip: !continuationToken || !breakData?.id }
  );

  useEffect(() => {
    if (moreData?.results?.sessions?.length) {
      const newSessions = moreData.results.sessions.filter((s: any) => {
        const key = s.session_id ?? s.id;
        if (seenIdsRef.current.has(key)) return false;
        seenIdsRef.current.add(key);
        return true;
      });
      if (newSessions.length > 0) setSessions((prev) => [...prev, ...newSessions]);
      setContinuationToken(moreData.results.continuationToken ?? '');
    }
  }, [moreData]);

  const [favoriteSurfBreak] = useUpdateUserFavoritesMutation();
  const handleFavorite = useCallback(async () => {
    if (!requireAuth()) return;
    if (!breakData?.id) return;
    await favoriteSurfBreak({ surfBreakId: breakData.id, action: isFavorited ? 'unfavorite' : 'favorite' });
  }, [requireAuth, breakData, isFavorited, favoriteSurfBreak]);

  const handleShare = useCallback(async () => {
    const shareUrl = `https://share.surf-vault.com/${country}/${region}/${surfBreak}`;
    await Share.share(Platform.OS === 'ios' ? { url: shareUrl } : { message: shareUrl });
  }, [country, region, surfBreak]);

  const handleDateChange = useCallback((_event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (date) { setSelectedDate(date); setSessions([]); seenIdsRef.current = new Set(); setContinuationToken(''); }
    } else {
      // iOS spinner — just update picker state, apply on Done
      if (date) setPickerDate(date);
    }
  }, []);

  const handleDateDone = useCallback(() => {
    setShowDatePicker(false);
    setSelectedDate(pickerDate);
    setSessions([]);
    seenIdsRef.current = new Set();
    setContinuationToken('');
  }, [pickerDate]);

  const clearDate = useCallback(() => {
    setSelectedDate(null); setSessions([]); seenIdsRef.current = new Set(); setContinuationToken('');
  }, []);

  const breakName = breakData?.name?.replaceAll('_', ' ') ?? surfBreak?.replaceAll('_', ' ') ?? '';
  const regionDisplay = breakData?.region?.replaceAll('_', ' ') ?? (region !== '0' ? region?.replaceAll('_', ' ') : '') ?? '';
  const countryDisplay = breakData?.country_code ?? country?.toUpperCase() ?? '';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        left={
          <Pressable onPress={smartBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color="#007AFF" />
          </Pressable>
        }
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <Pressable onPress={handleFavorite} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Ionicons name={isFavorited ? 'heart' : 'heart-outline'} size={22} color={isFavorited ? '#ef4444' : (isDark ? '#e5e7eb' : '#374151')} />
            </Pressable>
            <Pressable onPress={handleShare} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Ionicons name="share-outline" size={22} color={isDark ? '#e5e7eb' : '#374151'} />
            </Pressable>
          </View>
        }
      />
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#ffffff' }]} edges={[]}>
        {isLoading ? (
          <BreakSkeleton />
        ) : (
          <FlatList
            data={feedRows}
            keyExtractor={(row) => row.key}
            renderItem={({ item: row }) => {
              if (row.type === 'ad') {
                return (
                  <SponsoredCard
                    ads={row.data}
                    placement="content"
                    surfBreakId={breakData?.id}
                  />
                );
              }
              return <SessionCard session={row.data} enableCarousel />;
            }}
            ListHeaderComponent={
              <View style={styles.headerWrap}>
                <Text style={[styles.breakName, { color: isDark ? '#fff' : '#111827' }]}>{breakName}</Text>
                <Text style={[styles.breakLocation, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                  {regionDisplay}{regionDisplay && countryDisplay ? ' · ' : ''}{countryDisplay}
                </Text>
                <View style={styles.dateRow}>
                  <Pressable onPress={() => { setPickerDate(selectedDate ?? new Date()); setShowDatePicker(true); }} style={[styles.dateBtn, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                    <Ionicons name="calendar-outline" size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
                    <Text style={[styles.dateBtnText, { color: isDark ? '#d1d5db' : '#374151' }]}>
                      {selectedDate ? formatDateLabel(selectedDate) : 'Any date'}
                    </Text>
                  </Pressable>
                  {selectedDate && (
                    <Pressable onPress={clearDate} hitSlop={8}><Ionicons name="close-circle" size={20} color={isDark ? '#6b7280' : '#9ca3af'} /></Pressable>
                  )}
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="camera-outline" size={48} color={isDark ? '#374151' : '#d1d5db'} />
                <Text style={[styles.emptyTitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                  {selectedDate ? 'No sessions on this date' : `Be the first to share ${breakName}`}
                </Text>

                {breakAds.length > 0 && !selectedDate && (
                  <View style={styles.localLoveWrap}>
                    <Text style={[styles.localLoveTitle, { color: isDark ? '#fff' : '#111827' }]}>
                      Local love near {breakName}
                    </Text>
                    <Text style={[styles.localLoveSub, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                      These businesses are just down the road
                    </Text>
                    {breakAds.slice(0, 3).map((ad: any) => (
                      <SponsoredCard
                        key={ad.id}
                        ad={ad}
                        placement="content"
                        surfBreakId={breakData?.id}
                      />
                    ))}
                  </View>
                )}
              </View>
            }
            ListFooterComponent={loadingMore ? <View style={{ paddingVertical: 16 }}><ActivityIndicator /></View> : null}
            onEndReachedThreshold={0.5} showsVerticalScrollIndicator={false}
          />
        )}
        {showDatePicker && (
          <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDatePicker(false)} />
            <View style={[styles.sheet, { backgroundColor: isDark ? '#1f2937' : '#fff' }]}>
              <View style={styles.sheetHeader}>
                <Pressable onPress={handleDateDone}>
                  <Text style={{ fontSize: 16, color: '#0ea5e9', fontWeight: '600' }}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker value={pickerDate} mode="date" display="spinner" onChange={handleDateChange} maximumDate={new Date()} themeVariant={isDark ? 'dark' : 'light'} style={{ height: 200 }} />
            </View>
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  breakName: { fontSize: 22, fontWeight: '700' },
  breakLocation: { fontSize: 13, marginTop: 3 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  dateBtnText: { fontSize: 14, fontWeight: '500' },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  localLoveWrap: { width: '100%', marginTop: 32, paddingHorizontal: 12 },
  localLoveTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  localLoveSub: { fontSize: 12, marginBottom: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 100 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 14 },
});
