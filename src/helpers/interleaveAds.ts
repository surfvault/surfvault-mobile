export type FeedRow<T, A> =
    | { type: 'item'; key: string; data: T }
    | { type: 'ad'; key: string; data: A[] };

/**
 * Show one ad after every N feed items. Single source of truth — matches
 * AD_EVERY_N_ITEMS in surfvault-web/src/helpers/adFeedInterleave.js so users
 * see ads at the same cadence on web and mobile. Change both at once.
 */
export const AD_EVERY_N_ITEMS = 4;

/**
 * Group a flat list of ads by `ad_partner_id` so each partner occupies a
 * single feed slot (rendered as a swipeable carousel on the client). Preserves
 * first-appearance order of each partner so the server's weighted shuffle /
 * geo-boost ordering stays meaningful.
 */
export function groupAdsByPartner<A extends { id: string; ad_partner_id?: string }>(ads: A[]): A[][] {
    const groups = new Map<string, A[]>();
    for (const ad of ads) {
        if (!ad) continue;
        const key = ad.ad_partner_id || ad.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(ad);
    }
    return Array.from(groups.values());
}

/**
 * Interleave ads into a feed of items, inserting one partner ad group after
 * every `every` items (defaults to AD_EVERY_N_ITEMS). Ads are grouped by
 * `ad_partner_id` so each feed slot renders as one swipeable carousel per
 * partner rather than N separate sponsored posts. Deterministic.
 *
 * After items are exhausted, any remaining ad groups append at the tail —
 * partner content (especially shapers) is editorially relevant to surfers,
 * so the feed shouldn't dead-end if there's still inventory the user hasn't
 * seen. Empty `items` still returns `[]` so empty-state UIs render normally
 * instead of an ads-only feed.
 */
export function interleaveAds<T extends { id?: string; session_id?: string }, A extends { id: string; ad_partner_id?: string }>(
    items: T[],
    ads: A[],
    every: number = AD_EVERY_N_ITEMS,
    itemKey: (t: T, idx: number) => string = (t, i) => t.id ?? (t as any).session_id ?? `item-${i}`
): Array<FeedRow<T, A>> {
    return interleavePromoGroups(items, groupAdsByPartner(ads), every, itemKey);
}

/**
 * Lower-level interleave that takes already-grouped promo slots. Use this when
 * the caller wants explicit control over slot ordering (e.g. alternating paid
 * ads with shaper editorial content), since `groupAdsByPartner` collapses
 * by `ad_partner_id` and would otherwise merge same-partner ads into the
 * earliest slot, breaking any pre-built alternation.
 */
export function interleavePromoGroups<T extends { id?: string; session_id?: string }, A extends { id: string; ad_partner_id?: string }>(
    items: T[],
    groups: A[][],
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
        if (shouldInsertAd && adCursor < groups.length) {
            const group = groups[adCursor];
            if (group.length) {
                const keyBase = group[0].ad_partner_id ?? group[0].id;
                out.push({ type: 'ad', key: `a-${keyBase}`, data: group });
                adCursor += 1;
            }
        }
    }

    // Tail: dump any remaining promo groups so partners with leftover
    // inventory still get exposure when the feed runs out of sessions.
    while (adCursor < groups.length) {
        const group = groups[adCursor];
        if (group.length) {
            const keyBase = group[0].ad_partner_id ?? group[0].id;
            out.push({ type: 'ad', key: `a-${keyBase}`, data: group });
        }
        adCursor += 1;
    }

    return out;
}

/**
 * Zip two promo-group streams together so they alternate slot-by-slot. Used
 * to mix paid ad groups with shaper editorial entries at the same cadence —
 * each side gets every-other slot, so neither can crowd the other out.
 * `primary` takes the first slot when both are non-empty.
 */
export function zipPromoGroups<A extends { id: string; ad_partner_id?: string }>(
    primary: A[][],
    secondary: A[][]
): A[][] {
    const out: A[][] = [];
    const max = Math.max(primary.length, secondary.length);
    for (let i = 0; i < max; i++) {
        if (i < primary.length) out.push(primary[i]);
        if (i < secondary.length) out.push(secondary[i]);
    }
    return out;
}
