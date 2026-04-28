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
    if (!items?.length) return [];
    const groups = groupAdsByPartner(ads);
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

    // Tail: dump any remaining ad groups so partners with leftover inventory
    // still get exposure when the feed runs out of sessions.
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
