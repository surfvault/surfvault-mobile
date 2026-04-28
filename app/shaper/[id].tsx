import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Linking,
  Modal,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import ImageViewing from 'react-native-image-viewing';
import { useSmartBack } from '../../src/context/NavigationContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import ActionSheet from '../../src/components/ActionSheet';
import type { ActionSheetSection } from '../../src/components/ActionSheet';
import { useGetBoardroomShaperQuery, type BoardroomAd } from '../../src/store';
import { extractInstagramHandle, normalizeWebsite } from '../../src/helpers/socialUrl';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLS = 3;
const GRID_GAP = 2;
const TILE_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

export default function ShaperDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const smartBack = useSmartBack();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const { data, isLoading, isError } = useGetBoardroomShaperQuery(
    { id: id ?? '' },
    { skip: !id }
  );

  const shaper = data?.results?.shaper;
  const ads = useMemo<BoardroomAd[]>(() => shaper?.ads ?? [], [shaper]);

  // Stat label: count distinct boards via cta_label (the board name) when every
  // ad is labeled. Otherwise fall back to a photo count — better to be honest
  // than to claim "10 boards" when half the ads are alternate angles of one
  // board with no name set.
  const stat = useMemo(() => {
    if (!ads.length) return { count: 0, noun: 'boards' };
    const allLabeled = ads.every((a) => a.cta_label?.trim());
    if (!allLabeled) {
      return { count: ads.length, noun: ads.length === 1 ? 'photo' : 'photos' };
    }
    const distinct = new Set(ads.map((a) => a.cta_label!.trim().toLowerCase())).size;
    return { count: distinct, noun: distinct === 1 ? 'board' : 'boards' };
  }, [ads]);

  // Boardroom doesn't have a partner-level website field yet, so derive it
  // from the first ad with a click_url. Admins should set the same URL across
  // all ads (the AdPartnerProfile drawer enforces this implicitly anyway).
  // If the URL is Instagram, render an IG button with the handle.
  const firstClickUrl = useMemo(
    () => ads.find((a) => !!a.click_url && a.cta_type !== 'tel')?.click_url ?? null,
    [ads]
  );
  const instagramHandle = useMemo(() => extractInstagramHandle(firstClickUrl), [firstClickUrl]);
  const websiteUrl = useMemo(
    () => (instagramHandle ? null : normalizeWebsite(firstClickUrl)),
    [firstClickUrl, instagramHandle]
  );

  const handleInstagram = useCallback(() => {
    if (!instagramHandle) return;
    Linking.openURL(`https://instagram.com/${instagramHandle}`).catch(() => {});
  }, [instagramHandle]);

  const handleWebsite = useCallback(() => {
    if (!websiteUrl) return;
    Linking.openURL(websiteUrl).catch(() => {});
  }, [websiteUrl]);

  const handleCall = useCallback(() => {
    if (!shaper?.phone_number) return;
    const num = shaper.phone_number.startsWith('tel:')
      ? shaper.phone_number
      : `tel:${shaper.phone_number}`;
    Linking.openURL(num).catch(() => {});
  }, [shaper?.phone_number]);

  const handleReport = useCallback(() => {
    if (!shaper) return;
    const subject = encodeURIComponent(`Boardroom report: ${shaper.company_name}`);
    const body = encodeURIComponent(
      [
        `Reporting Boardroom shaper.`,
        ``,
        `Partner: ${shaper.company_name}`,
        `Partner ID: ${shaper.id}`,
        ``,
        `Reason:`,
        ``,
      ].join('\n')
    );
    Linking.openURL(`mailto:support@surf-vault.com?subject=${subject}&body=${body}`).catch(() => {});
  }, [shaper]);

  const sheetSections: ActionSheetSection[] = useMemo(() => {
    const sections: ActionSheetSection[] = [];
    const contactOptions = [];
    if (shaper?.phone_number) {
      contactOptions.push({
        label: `Call ${shaper.phone_number}`,
        icon: 'call-outline' as const,
        onPress: handleCall,
      });
    }
    if (instagramHandle) {
      contactOptions.push({
        label: `View @${instagramHandle} on Instagram`,
        icon: 'logo-instagram' as const,
        onPress: handleInstagram,
      });
    }
    if (websiteUrl) {
      contactOptions.push({
        label: 'View website',
        icon: 'link-outline' as const,
        onPress: handleWebsite,
      });
    }
    if (contactOptions.length) sections.push({ options: contactOptions });
    sections.push({
      options: [{
        label: 'Report',
        icon: 'flag-outline',
        destructive: true,
        onPress: handleReport,
      }],
    });
    return sections;
  }, [shaper, instagramHandle, websiteUrl, handleCall, handleInstagram, handleWebsite, handleReport]);

  const renderHeader = () => {
    if (!shaper) return null;
    return (
      <View style={styles.profileHeader}>
        {/* Top row: logo on the left, name + board count stacked on the right.
            Mirrors ProfileHeader's avatar-on-left layout for visual consistency. */}
        <View style={styles.topRow}>
          <View style={[styles.logoLarge, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
            {shaper.logo_url ? (
              <Image source={{ uri: shaper.logo_url }} style={styles.logoImg} contentFit="cover" />
            ) : (
              <MaterialCommunityIcons
                name="surfing"
                size={32}
                color={isDark ? '#9ca3af' : '#6b7280'}
              />
            )}
          </View>
          <View style={styles.rightColumn}>
            <Text
              style={[styles.companyName, { color: isDark ? '#fff' : '#111827' }]}
              numberOfLines={2}
            >
              {shaper.company_name}
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: isDark ? '#fff' : '#111827' }]}>
                  {stat.count}
                </Text>
                <Text style={styles.statLabel}>{stat.noun}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Contact row — sits where bio/description would on a user profile.
            Shaper-equivalent of bio: how to actually reach them. */}
        {(instagramHandle || websiteUrl || shaper.phone_number) ? (
          <View style={styles.contactRow}>
            {shaper.phone_number ? (
              <Pressable onPress={handleCall} style={styles.contactItem} hitSlop={6}>
                <Ionicons name="call-outline" size={16} color="#10b981" />
                <Text
                  style={[styles.contactText, { color: isDark ? '#fff' : '#111827' }]}
                  numberOfLines={1}
                >
                  {shaper.phone_number}
                </Text>
              </Pressable>
            ) : null}
            {instagramHandle ? (
              <Pressable onPress={handleInstagram} style={styles.contactItem} hitSlop={6}>
                <Ionicons name="logo-instagram" size={16} color="#ec4899" />
                <Text
                  style={[styles.contactText, { color: isDark ? '#fff' : '#111827' }]}
                  numberOfLines={1}
                >
                  @{instagramHandle}
                </Text>
              </Pressable>
            ) : null}
            {websiteUrl ? (
              <Pressable onPress={handleWebsite} style={styles.contactItem} hitSlop={6}>
                <Ionicons name="link-outline" size={16} color="#3b82f6" />
                <Text
                  style={[styles.contactText, { color: isDark ? '#fff' : '#111827' }]}
                  numberOfLines={1}
                >
                  Website
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const galleryImages = useMemo(
    () =>
      ads
        .map((ad) => {
          const uri = ad.hero_media_url || ad.media_url;
          return uri ? { uri } : null;
        })
        .filter((x): x is { uri: string } => x !== null),
    [ads]
  );

  // Boardroom isn't an ad surface — tile taps open the lightbox so users can
  // browse boards full-screen. Contact actions (call / IG / website) sit in
  // the profile header instead.
  const handleTilePress = useCallback((index: number) => {
    setViewerIndex(index);
  }, []);

  return (
    <View style={[styles.flex, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        left={
          <Pressable onPress={smartBack} hitSlop={10} style={styles.headerSideBtn}>
            <Ionicons
              name="chevron-back"
              size={26}
              color={isDark ? '#fff' : '#111827'}
            />
          </Pressable>
        }
        right={
          <Pressable onPress={() => setSheetVisible(true)} hitSlop={10} style={styles.headerSideBtn}>
            <Ionicons
              name="ellipsis-horizontal"
              size={22}
              color={isDark ? '#fff' : '#111827'}
            />
          </Pressable>
        }
      />

      {isLoading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator />
        </View>
      ) : isError || !shaper ? (
        <View style={styles.centerWrap}>
          <Text style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
            Couldn't load this shaper.
          </Text>
        </View>
      ) : (
        <FlatList
          data={ads}
          keyExtractor={(ad) => ad.id}
          numColumns={GRID_COLS}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={{ gap: GRID_GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          renderItem={({ item, index }) => {
            const uri = item.hero_media_url || item.media_url;
            return (
              <Pressable onPress={() => handleTilePress(index)} style={styles.tile}>
                {uri ? (
                  <Image source={{ uri }} style={styles.tileImg} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.tileImg, styles.tilePlaceholder, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                    <Ionicons name="image-outline" size={20} color={isDark ? '#374151' : '#d1d5db'} />
                  </View>
                )}
                {item.cta_label ? (
                  <View style={styles.tileLabelWrap} pointerEvents="none">
                    <Text style={styles.tileLabelText} numberOfLines={1}>
                      {item.cta_label}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centerWrap}>
              <Text style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>
                No boards listed yet.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={viewerIndex !== null} transparent animationType="fade" onRequestClose={() => setViewerIndex(null)}>
        {viewerIndex !== null ? (
          <ImageViewing
            images={galleryImages}
            imageIndex={viewerIndex}
            visible
            onRequestClose={() => setViewerIndex(null)}
          />
        ) : null}
      </Modal>

      <ActionSheet
        visible={sheetVisible}
        sections={sheetSections}
        header={
          shaper
            ? {
                title: shaper.company_name,
                subtitle: shaper.contact_name ?? undefined,
                imageUri: shaper.logo_url ?? undefined,
              }
            : undefined
        }
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  headerSideBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  logoLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: '100%',
    height: '100%',
  },
  rightColumn: {
    flex: 1,
    marginLeft: 16,
  },
  companyName: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  statItem: {
    alignItems: 'flex-start',
  },
  statNumber: {
    fontSize: 15,
    fontWeight: '600',
  },
  statLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 6,
    marginTop: 14,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  contactText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  gridContent: {
    paddingBottom: 24,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    position: 'relative',
  },
  tileImg: {
    width: '100%',
    height: '100%',
  },
  tilePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabelWrap: {
    position: 'absolute',
    top: 4,
    left: 4,
    maxWidth: '90%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tileLabelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
});
