// Map screen's bottom sheet — replaces the old static "selected break" bar +
// floating ad Callout with a swipe-up sheet that has two snap points:
//
//   half (~38%)  — single horizontal carousel, type-locked to the user's
//                  selection. Tap a break → breaks carousel. Tap an ad → ads
//                  carousel. Swiping a card centers it on the map (via
//                  `onCenterItem`). Auto-fires impression tracking when an ad
//                  card lands centered.
//
//   full (~85%)  — sectioned view. Selected type's section is pinned on top;
//                  each section is a horizontal scroll (matches /home pattern).
//
// The sheet OWNS the carousel index. The parent owns `selectedId/Mode` and
// passes it down — when the parent flips the selection (e.g. user tapped a
// marker), the sheet auto-scrolls its carousel to that index.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import MapNearbyCard, { MapNearbyItem } from './MapNearbyCard';

export type SheetMode = 'break' | 'ad';

interface Props {
  /** Combined feed shape: breaks + ads. Each list lives in its own carousel. */
  breaks: MapNearbyItem[];
  ads: MapNearbyItem[];
  /** Which content type drives the half-snap carousel. */
  mode: SheetMode;
  /** Selected item's id within the active mode's list (centers the carousel). */
  selectedId: string | null;
  isDark: boolean;
  /** Called when the carousel settles on a new item (swipe-to-select-pin).
   *  Safe because the list is viewport-anchored — selection change doesn't
   *  reshuffle the list and can't re-fire viewable events into a loop. */
  onCenterItem?: (item: MapNearbyItem) => void;
  /** Called when a card is tapped (navigate or open ad). */
  onPressItem: (item: MapNearbyItem) => void;
  /** Called when the sheet is dragged closed — recipient clears selection. */
  onClose: () => void;
  /** Called when an ad card becomes the centered item (per-view impression). */
  onAdImpression?: (adId: string) => void;
  /** Carousel card width in px (computed once from window width). */
  cardWidth: number;
  /** Initial snap index (use 0 for peek when zoom is already in range on mount,
   *  -1 to start closed). Captured once on mount — subsequent transitions are
   *  driven by parent calling `ref.snapToIndex(...)`. */
  initialIndex?: number;
}

const MapNearbySheet = React.forwardRef<BottomSheet, Props>(function MapNearbySheet(
  {
    breaks,
    ads,
    mode,
    selectedId,
    isDark,
    onCenterItem,
    onPressItem,
    onClose,
    onAdImpression,
    cardWidth,
    initialIndex = -1,
  },
  ref,
) {
  // Three snap points:
  //   0 = peek (~6% — just the drag handle peeking above the tab bar; signals
  //       the sheet exists without consuming screen)
  //   1 = half (~38% — carousel of in-viewport items)
  //   2 = full (~85% — sectioned breaks + ads rows)
  //   -1 = closed (off-screen; used only when zoomed out past the threshold)
  const snapPoints = useMemo(() => ['6%', '38%', '85%'], []);
  const carouselRef = useRef<any>(null);
  // Track which ads we've already counted an impression for in this sheet
  // open — prevents re-firing as the user swipes back and forth.
  const seenAdsRef = useRef<Set<string>>(new Set());
  // Sheet's current snap index. Drives conditional render — carousel mounts at
  // half+ snaps, sections only at full snap.
  const [snapIndex, setSnapIndex] = useState(-1);

  // The list shown in the half-snap carousel — locked to mode.
  const carouselList = mode === 'ad' ? ads : breaks;

  // Auto-scroll the carousel when the parent's selection changes (e.g. user
  // tapped a marker for an item that isn't the centered card).
  useEffect(() => {
    if (!selectedId) return;
    const idx = carouselList.findIndex((it) => it.id === selectedId);
    if (idx < 0) return;
    // Defer to next frame so the FlatList has its measurements
    requestAnimationFrame(() => {
      carouselRef.current?.scrollToIndex({ index: idx, animated: true });
    });
  }, [selectedId, carouselList]);

  // Stable refs so the ViewabilityHelper isn't reconfigured between renders
  // (RN warns when this prop changes mid-tracking). The callbacks read from
  // ref-mirrors so they always see the latest parent handlers.
  const onCenterRef = useRef(onCenterItem);
  const onAdImpressionRef = useRef(onAdImpression);
  const carouselListRef = useRef(carouselList);
  const cardWidthRef = useRef(cardWidth);
  // Latest selection, read by the deferred auto-promote in handleSheetChange so
  // it never acts on a stale value (see note there).
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    onCenterRef.current = onCenterItem;
    onAdImpressionRef.current = onAdImpression;
    carouselListRef.current = carouselList;
    cardWidthRef.current = cardWidth;
    selectedIdRef.current = selectedId;
  });

  // Impressions fire on visible-during-scroll (so an ad seen briefly still
  // counts). Selection updates do NOT — they wait for `onMomentumScrollEnd`
  // so a fast swipe through 4 cards only fires ONE selection change at the
  // end, not 4 in rapid succession. Rapid selection changes caused all
  // markers' `tracksViewChanges` to thrash on Android, producing the visible
  // flicker.
  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: MapNearbyItem; isViewable: boolean }> }) => {
      const centered = viewableItems.find((v) => v.isViewable);
      if (!centered) return;
      const it = centered.item;
      if (it.kind === 'ad' && !seenAdsRef.current.has(it.id)) {
        seenAdsRef.current.add(it.id);
        onAdImpressionRef.current?.(it.id);
      }
    },
  ).current;

  const handleMomentumScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const list = carouselListRef.current;
      if (!list.length) return;
      // Page index = round(scrollX / pageWidth). pageWidth = card + separator.
      const pageWidth = cardWidthRef.current + 12;
      const idx = Math.max(0, Math.min(list.length - 1, Math.round(e.nativeEvent.contentOffset.x / pageWidth)));
      const item = list[idx];
      if (item) onCenterRef.current?.(item);
    },
    [],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  // Reset seen-ads when the sheet closes so a re-open re-fires impressions.
  // Also drives `snapIndex` so the JSX can conditionally render sections only
  // at full-snap, and so we can promote the first carousel card to "selected"
  // whenever the user opens the sheet to half-snap with no existing selection.
  const handleSheetChange = useCallback(
    (index: number) => {
      setSnapIndex(index);
      if (index === -1) {
        seenAdsRef.current.clear();
        onClose();
        return;
      }
      // When opening to half-snap (or above) with NO selection, promote the
      // first card so the map always has a matching selected pin alongside the
      // carousel. Deferred a frame and read from a ref because a marker tap
      // sets the selection AND snaps the sheet open in the same gesture — a
      // synchronous read here can still see the pre-tap (empty) value and would
      // wrongly override the tapped break with the centered one. By next frame
      // the selection has settled, so a tap is respected while a plain
      // swipe-open (still empty) correctly promotes the first card.
      if (index >= 1) {
        requestAnimationFrame(() => {
          if (selectedIdRef.current) return;
          const first = carouselListRef.current[0];
          if (first) onCenterRef.current?.(first);
        });
      }
    },
    [onClose],
  );

  // Helper to render the type-locked carousel at the half snap point.
  const renderCarousel = () => {
    const initialIdx = selectedId
      ? Math.max(0, carouselList.findIndex((it) => it.id === selectedId))
      : 0;
    return (
      <BottomSheetFlatList
        ref={carouselRef as any}
        data={carouselList}
        keyExtractor={(it: MapNearbyItem) => `${it.kind}-${it.id}`}
        horizontal
        pagingEnabled
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        initialScrollIndex={initialIdx > 0 ? initialIdx : undefined}
        getItemLayout={(_: any, index: number) => ({
          length: cardWidth + 12,
          offset: (cardWidth + 12) * index,
          index,
        })}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        // Guard against the uncaught invariant RN throws if a scrollToIndex /
        // initialScrollIndex ever lands out of range. Re-attempt via offset
        // (we know each page is cardWidth + 12 wide) on the next frame.
        onScrollToIndexFailed={(info: { index: number }) => {
          requestAnimationFrame(() => {
            carouselRef.current?.scrollToOffset({
              offset: info.index * (cardWidth + 12),
              animated: false,
            });
          });
        }}
        renderItem={({ item }: { item: MapNearbyItem }) => (
          <MapNearbyCard item={item} isDark={isDark} onPress={() => onPressItem(item)} width={cardWidth} />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
            {mode === 'ad' ? 'No nearby sponsors yet.' : 'No nearby surf breaks.'}
          </Text>
        }
      />
    );
  };

  // Helper to render one horizontal section at full snap (title + scroll row).
  const renderSection = (title: string, items: MapNearbyItem[]) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: isDark ? '#f3f4f6' : '#111827' }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: isDark ? '#6b7280' : '#9ca3af', paddingHorizontal: 16 }]}>
          None nearby yet.
        </Text>
      ) : (
        <BottomSheetFlatList
          data={items}
          keyExtractor={(it: MapNearbyItem) => `${it.kind}-${it.id}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
          renderItem={({ item }: { item: MapNearbyItem }) => (
            <MapNearbyCard item={item} isDark={isDark} onPress={() => onPressItem(item)} width={260} />
          )}
        />
      )}
    </View>
  );

  // Section order at full snap: selected type pinned on top. Headings match
  // the "In This Area" framing — these describe what's visible in the current
  // map viewport.
  const sections =
    mode === 'ad'
      ? [{ title: 'Local Business', items: ads }, { title: 'Surf Breaks', items: breaks }]
      : [{ title: 'Surf Breaks', items: breaks }, { title: 'Local Business', items: ads }];

  return (
    <BottomSheet
      ref={ref}
      index={initialIndex}
      snapPoints={snapPoints}
      // Drag-down does NOT close the sheet — the lowest snap is peek, which
      // is the "dismissed" state when zoomed-in. Full hide only happens
      // imperatively via `close()` from the parent's zoom-out effect. This
      // keeps the peek bar visible whenever the user is in the peekable
      // zoom range, regardless of how aggressively they swipe down.
      enablePanDownToClose={false}
      // On Android, the BottomSheet's vertical pan gesture defaults to
      // grabbing horizontal swipes inside its content too, which kills the
      // carousel's pagingEnabled swipe. Disabling content panning forces the
      // user to drag the handle for snap changes — but the horizontal
      // carousel inside works untouched. Tradeoff: can't drag the bottom
      // sheet up/down by grabbing a card; must use the handle. Acceptable
      // because the handle is a clear affordance.
      enableContentPanningGesture={false}
      // Disable overdrag so a hard swipe up from peek (6%) cannot blow past
      // half (38%) and land at full (85%) in one gesture. The user wants
      // peek → half on first swipe, half → full on second swipe — each
      // gesture should stop at the nearest snap point, not overshoot.
      enableOverDrag={false}
      // Snap to the next sequential point (not the nearest by velocity) so a
      // single swipe always advances exactly one snap level.
      animateOnMount={false}
      onChange={handleSheetChange}
      backgroundStyle={{ backgroundColor: isDark ? '#0f172a' : '#fff' }}
      handleIndicatorStyle={{ backgroundColor: isDark ? '#4b5563' : '#d1d5db' }}
    >
      <BottomSheetView style={{ flex: 1, paddingTop: 6 }}>
        {/* Three distinct contents, one per snap point:
              Peek  (0): handle only
              Half  (1): carousel (one row of cards near the map center)
              Full  (2): "In This Area" heading + Surf Breaks section +
                         Local Business section. Carousel is REPLACED, not
                         duplicated, since the sections cover the same data
                         with more breathing room. */}
        {snapIndex === 1 && renderCarousel()}
        {snapIndex >= 2 && (
          <View style={styles.sectionsWrap}>
            <Text style={[styles.areaTitle, { color: isDark ? '#fff' : '#111827' }]}>In This Area</Text>
            {sections.map((s) => (
              <React.Fragment key={s.title}>{renderSection(s.title, s.items)}</React.Fragment>
            ))}
          </View>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
});

export default MapNearbySheet;

const styles = StyleSheet.create({
  carouselContent: { paddingHorizontal: 16, paddingVertical: 8 },
  sectionsWrap: { paddingTop: 4, gap: 18 },
  areaTitle: {
    fontSize: 22,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  section: {},
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
