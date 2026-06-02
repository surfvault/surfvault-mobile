import { useCallback, useRef, useState } from 'react';
import type { ViewToken } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Tracks which FlatList rows are currently on-screen so feed cards can gate
 * expensive work (e.g. video autoplay) to the viewport instead of running it
 * for every mounted-but-off-screen card.
 *
 * Usage:
 *   const { viewabilityConfig, onViewableItemsChanged, isItemViewable } = useViewableItems();
 *   <FlatList
 *     onViewableItemsChanged={onViewableItemsChanged}
 *     viewabilityConfig={viewabilityConfig}
 *     renderItem={({ item }) => (
 *       <SessionCard ... isViewable={isItemViewable(item.key)} />
 *     )}
 *   />
 *
 * `onViewableItemsChanged` and `viewabilityConfig` are stable refs — RN throws
 * if either identity changes between renders. The key passed to `isItemViewable`
 * MUST match the list's keyExtractor output (that's what RN reports as v.key).
 *
 * Until the first non-empty report arrives, every row is treated as viewable so
 * a freshly-mounted list (or one restored on focus) doesn't flash paused.
 *
 * Also gates on screen focus: when the screen is navigated away from (tab switch
 * or a route pushed on top), every row reports not-viewable so clips pause
 * instead of playing under the covers. "In view" means on-screen AND focused.
 */
export function useViewableItems(threshold = 60) {
  const [hasReport, setHasReport] = useState(false);
  const [viewableKeys, setViewableKeys] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState(true);

  // focus → resume, blur → pause. Cleanup fires on blur/unmount.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: threshold }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    // Ignore transient empty reports (fire during re-attach / programmatic
    // scroll) — treating them as "nothing visible" would pause every card.
    if (viewableItems.length === 0) return;
    setHasReport(true);
    setViewableKeys(new Set(viewableItems.map((v) => v.key)));
  }).current;

  const isItemViewable = useCallback(
    (key: string) => focused && (!hasReport || viewableKeys.has(key)),
    [focused, hasReport, viewableKeys]
  );

  // `screenFocused` is for cards rendered OUTSIDE the virtualized list (static
  // header/empty-state blocks) that can't get per-row viewability — gate them
  // on focus at least, so they pause on tab switch / pushed route.
  return { viewabilityConfig, onViewableItemsChanged, isItemViewable, screenFocused: focused };
}
