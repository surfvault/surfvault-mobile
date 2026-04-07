import { useState, useRef, useCallback, useEffect } from 'react';
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
import { useUser } from '../../../../../src/context/UserProvider';
import { useRequireAuth } from '../../../../../src/hooks/useRequireAuth';
import {
  useGetSurfBreakWithLatestSessionsQuery,
  useGetSurfBreakSessionsQuery,
  useUpdateUserFavoritesMutation,
} from '../../../../../src/store';
import SessionCard from '../../../../../src/components/SessionCard';

const formatDateLabel = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateParam = (date: Date): string => {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

export default function SurfBreakDetailScreen() {
  const { country, region, surfBreak } = useLocalSearchParams<{
    country: string;
    region: string;
    surfBreak: string;
  }>();
  const router = useRouter();
  const { user } = useUser();
  const requireAuth = useRequireAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [continuationToken, setContinuationToken] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const seenIdsRef = useRef(new Set<string>());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Initial data — pass date if selected
  const { data: initialData, isLoading } = useGetSurfBreakWithLatestSessionsQuery({
    userId: user?.id,
    country: country ?? '',
    region: region ?? '',
    surfBreak: surfBreak ?? '',
    date: selectedDate ? formatDateParam(selectedDate) : undefined,
  });

  const breakData = initialData?.results?.surfBreak;
  const initialSessions = initialData?.results?.sessions ?? [];
  const initialToken = initialData?.results?.continuationToken ?? '';
  const isFavorited = breakData?.is_favorited;

  // Load initial sessions — reset when date changes
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

  // Pagination
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
      if (newSessions.length > 0) {
        setSessions((prev) => [...prev, ...newSessions]);
      }
      setContinuationToken(moreData.results.continuationToken ?? '');
    }
  }, [moreData]);

  // Favorite
  const [favoriteSurfBreak] = useUpdateUserFavoritesMutation();
  const handleFavorite = useCallback(async () => {
    if (!requireAuth()) return;
    if (!breakData?.id) return;
    const action = isFavorited ? 'unfavorite' : 'favorite';
    await favoriteSurfBreak({ surfBreakId: breakData.id, action });
  }, [requireAuth, breakData, isFavorited, favoriteSurfBreak]);

  // Share
  const handleShare = useCallback(async () => {
    if (!country || !surfBreak) return;
    const shareUrl = `https://app.surf-vault.com/${country}/${region ?? '0'}/${surfBreak}`;
    await Share.share(
      Platform.OS === 'ios' ? { url: shareUrl } : { message: shareUrl }
    );
  }, [country, region, surfBreak]);

  // Date picker
  const handleDateChange = useCallback((_event: any, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      setSessions([]);
      seenIdsRef.current = new Set();
      setContinuationToken('');
    }
  }, []);

  const clearDate = useCallback(() => {
    setSelectedDate(null);
    setSessions([]);
    seenIdsRef.current = new Set();
    setContinuationToken('');
  }, []);

  const breakName = breakData?.name?.replaceAll('_', ' ') ?? surfBreak?.replaceAll('_', ' ').replaceAll('-', ' ') ?? '';
  const regionDisplay = breakData?.region?.replaceAll('_', ' ') ?? region?.replaceAll('_', ' ') ?? '';
  const countryDisplay = breakData?.country_code ?? country?.toUpperCase() ?? '';

  const BreakHeader = () => (
    <View style={styles.headerWrap}>
      <Text style={[styles.breakName, { color: isDark ? '#fff' : '#111827' }]}>
        {breakName}
      </Text>
      <Text style={[styles.breakLocation, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
        {regionDisplay}{regionDisplay && countryDisplay ? ' · ' : ''}{countryDisplay}
      </Text>

      {/* Date filter */}
      <View style={styles.dateRow}>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={[styles.dateBtn, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}
        >
          <Ionicons name="calendar-outline" size={16} color={isDark ? '#9ca3af' : '#6b7280'} />
          <Text style={[styles.dateBtnText, { color: isDark ? '#d1d5db' : '#374151' }]}>
            {selectedDate ? formatDateLabel(selectedDate) : 'Any date'}
          </Text>
        </Pressable>
        {selectedDate && (
          <Pressable onPress={clearDate} hitSlop={8} style={styles.clearDateBtn}>
            <Ionicons name="close-circle" size={20} color={isDark ? '#6b7280' : '#9ca3af'} />
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: '',
          headerBackTitle: '',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingRight: 4 }}>
              <Pressable onPress={handleFavorite} hitSlop={8}>
                <Ionicons
                  name={isFavorited ? 'heart' : 'heart-outline'}
                  size={22}
                  color={isFavorited ? '#ef4444' : (isDark ? '#e5e7eb' : '#374151')}
                />
              </Pressable>
              <Pressable onPress={handleShare} hitSlop={8}>
                <Ionicons name="share-outline" size={22} color={isDark ? '#e5e7eb' : '#374151'} />
              </Pressable>
            </View>
          ),
        }}
      />
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#030712' : '#ffffff' }]} edges={[]}>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.session_id ?? item.id}
            renderItem={({ item }) => (
              <View style={{ paddingHorizontal: 16 }}>
                <SessionCard session={item} />
              </View>
            )}
            ListHeaderComponent={<BreakHeader />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="camera-outline" size={48} color={isDark ? '#374151' : '#d1d5db'} />
                <Text style={[styles.emptyTitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                  {selectedDate ? 'No sessions on this date' : 'No sessions yet'}
                </Text>
                <Text style={[styles.emptySubtitle, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
                  {selectedDate ? 'Try a different date or clear the filter' : 'Be the first to upload photos at this break'}
                </Text>
              </View>
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator />
                </View>
              ) : null
            }
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Date picker */}
        {showDatePicker && (
          <View style={[styles.datePickerOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDatePicker(false)} />
            <View style={[styles.datePickerSheet, { backgroundColor: isDark ? '#1f2937' : '#ffffff' }]}>
              <View style={styles.datePickerHeader}>
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Text style={{ fontSize: 16, color: '#0ea5e9', fontWeight: '600' }}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={selectedDate ?? new Date()}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                maximumDate={new Date()}
                themeVariant={isDark ? 'dark' : 'light'}
                style={{ height: 200 }}
              />
            </View>
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  breakName: { fontSize: 22, fontWeight: '700' },
  breakLocation: { fontSize: 13, marginTop: 3 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  dateBtnText: { fontSize: 14, fontWeight: '500' },
  clearDateBtn: { padding: 2 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  datePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  datePickerSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  datePickerHeader: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 20, paddingVertical: 14,
  },
});
