import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Generic keyset-cursor "infinite scroll" accumulator for RTK Query feeds —
 * the TypeScript mirror of the web `useCursorList`.
 *
 * Drives every scroll-to-fetch grid that pages on a `continuationToken`
 * (Explore Films/Boards, profile Films). Matches the hand-rolled accumulation
 * the session lists already use:
 *
 *   - Pages accumulate in state, deduped by a stable id, so a row that straddles
 *     a page boundary is never shown twice.
 *   - `currentData` (not `data`) is read, so when the base args change RTK Query
 *     yields `undefined` during refetch and we never append a stale page.
 *   - `refresh()` resets and forces a fresh page 1 (an internal nonce busts the
 *     RTK cache key) — wired to pull-to-refresh.
 */
export function useCursorList<TItem>(opts: {
  // The RTK Query hook. Typed loosely so any generated hook is accepted.
  useQuery: (arg: any, options?: any) => { currentData?: any };
  args?: Record<string, any>;
  selectItems: (page: any) => TItem[];
  getId: (item: TItem) => string | number;
  skip?: boolean;
}) {
  const { useQuery, args, selectItems, getId, skip = false } = opts;

  const [token, setToken] = useState('');
  const [nonce, setNonce] = useState(0);
  const [items, setItems] = useState<TItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const seenRef = useRef<Set<string | number>>(new Set());
  const nextTokenRef = useRef('');
  const hasMoreRef = useRef(false);
  const fetchingRef = useRef(false);
  const refreshingRef = useRef(false);

  const selectRef = useRef(selectItems);
  selectRef.current = selectItems;
  const getIdRef = useRef(getId);
  getIdRef.current = getId;

  const argsKey = JSON.stringify(args ?? null);

  // `_nonce` is ignored by every query builder but changes the RTK cache key, so
  // refresh() forces a network fetch of page 1 instead of serving the cache.
  const { currentData } = useQuery(
    { ...(args ?? {}), continuationToken: token || undefined, _nonce: nonce },
    { skip }
  );

  // Reset accumulation when the base args, skip, or refresh nonce change.
  useEffect(() => {
    setItems([]);
    setToken('');
    setHasMore(false);
    setIsFetchingMore(false);
    seenRef.current = new Set();
    nextTokenRef.current = '';
    hasMoreRef.current = false;
    fetchingRef.current = false;
  }, [argsKey, skip, nonce]);

  useEffect(() => {
    if (!currentData) return;
    const list = selectRef.current(currentData) ?? [];
    const next = currentData?.results?.continuationToken || '';
    nextTokenRef.current = next;
    hasMoreRef.current = Boolean(next);
    setHasMore(Boolean(next));

    if (list.length) {
      setItems((prev) => {
        const add: TItem[] = [];
        for (const it of list) {
          const id = getIdRef.current(it);
          if (id == null || seenRef.current.has(id)) continue;
          seenRef.current.add(id);
          add.push(it);
        }
        return add.length ? prev.concat(add) : prev;
      });
    }

    fetchingRef.current = false;
    setIsFetchingMore(false);
    if (refreshingRef.current) {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [currentData]);

  const loadMore = useCallback(() => {
    if (fetchingRef.current || !hasMoreRef.current || !nextTokenRef.current) return;
    fetchingRef.current = true;
    setIsFetchingMore(true);
    setToken(nextTokenRef.current);
  }, []);

  const refresh = useCallback(() => {
    refreshingRef.current = true;
    setIsRefreshing(true);
    setNonce((n) => n + 1);
  }, []);

  const isLoading = !currentData && items.length === 0 && !skip;

  return { items, loadMore, refresh, hasMore, isFetchingMore, isRefreshing, isLoading };
}
