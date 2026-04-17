export type FeedRow<T, A> =
    | { type: 'item'; key: string; data: T }
    | { type: 'ad'; key: string; data: A };

/**
 * Show one ad after every N feed items. Single source of truth — matches
 * AD_EVERY_N_ITEMS in surfvault-web/src/helpers/adFeedInterleave.js so users
 * see ads at the same cadence on web and mobile. Change both at once.
 */
export const AD_EVERY_N_ITEMS = 4;

/**
 * Interleave ads into a feed of items, inserting one ad after every `every`
 * items (defaults to AD_EVERY_N_ITEMS). Deterministic and stable — same
 * inputs → same output. Ads are never repeated; if the list runs out before
 * the feed ends, remaining slots fall through to regular items.
 */
export function interleaveAds<T extends { id?: string; session_id?: string }, A extends { id: string }>(
    items: T[],
    ads: A[],
    every: number = AD_EVERY_N_ITEMS,
    itemKey: (t: T, idx: number) => string = (t, i) => t.id ?? (t as any).session_id ?? `item-${i}`
): Array<FeedRow<T, A>> {
    if (!items?.length) return [];
    const out: Array<FeedRow<T, A>> = [];
    let adCursor = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        out.push({ type: 'item', key: `i-${itemKey(item, i)}`, data: item });

        const shouldInsertAd = (i + 1) % every === 0;
        if (shouldInsertAd && adCursor < ads.length) {
            const ad = ads[adCursor];
            out.push({ type: 'ad', key: `a-${ad.id}`, data: ad });
            adCursor += 1;
        }
    }

    return out;
}
