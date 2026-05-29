export type FeedRow<T, A> =
    | { type: 'item'; key: string; data: T }
    | { type: 'ad'; key: string; data: A[] };

/**
 * Show one ad after every N feed items. Single source of truth — matches
 * AD_EVERY_N_ITEMS in surfvault-web/src/helpers/adFeedInterleave.js so users
 * see ads at the same cadence on web and mobile. Change both at once.
 */
export const AD_EVERY_N_ITEMS = 4;

// Small seeded PRNG (mulberry32). A given seed always yields the same shuffle,
// so the ad order stays stable across re-renders within one mount and only
// changes when the caller passes a new seed (new mount / filter change).
function mulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return function () {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Re-order ads for display so (a) no advertiser's creatives ever sit
 * back-to-back and (b) the order is fresh each time `seed` changes. Groups by
 * `ad_partner_id`, shuffles within each advertiser and across advertisers,
 * then round-robins one ad per advertiser per pass.
 *
 * Mirrors shuffleAdsByPartner in surfvault-web/src/helpers/adFeedInterleave.js.
 * Fixes a fresh batch of ads from one advertiser clustering at the top of the
 * feed: the backend weighted-randomizes once per fetch and RTK Query caches
 * that draw, so passing a per-mount/per-filter seed gives a fresh order each
 * time plus a hard no-clustering guarantee.
 */
export function shuffleAdsByPartner<A extends { id: string; ad_partner_id?: string }>(
    ads: A[] = [],
    seed: number = Math.floor(Math.random() * 1e9)
): A[] {
    if (!Array.isArray(ads) || ads.length <= 1) return ads ? [...ads] : [];
    const rand = mulberry32(seed);
    const shuffle = <X>(arr: X[]): X[] => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    const byPartner = new Map<string, A[]>();
    for (const ad of ads) {
        if (!ad) continue;
        const key = ad.ad_partner_id || ad.id;
        if (!byPartner.has(key)) byPartner.set(key, []);
        byPartner.get(key)!.push(ad);
    }
    const groups = shuffle(Array.from(byPartner.values()).map((g) => shuffle(g)));
    const out: A[] = [];
    let added = true;
    for (let i = 0; added; i++) {
        added = false;
        for (const g of groups) {
            if (i < g.length) {
                out.push(g[i]);
                added = true;
            }
        }
    }
    return out;
}

/**
 * @deprecated Phase B (2026-05-19) — each ad now carries its own media[]
 * carousel inside SponsoredCard, so partner-level grouping is no longer
 * useful. Kept temporarily as a no-op (wraps each ad in a 1-element array)
 * so any in-progress code paths still compile. Remove once all callers
 * migrate to passing individual ads directly.
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
    itemKey: (t: T, idx: number) => string = (t, i) => t.id ?? (t as any).session_id ?? `item-${i}`,
    hasMoreItems: boolean = false
): Array<FeedRow<T, A>> {
    return interleavePromoGroups(items, groupAdsByPartner(ads), every, itemKey, hasMoreItems);
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
    itemKey: (t: T, idx: number) => string = (t, i) => t.id ?? (t as any).session_id ?? `item-${i}`,
    hasMoreItems: boolean = false
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
                // Key by the row id (unique per ad/shaper). Partner grouping is
            // retired, so two ads from the same advertiser are separate slots —
            // keying by ad_partner_id would collide and trigger React's
            // duplicate-key warning.
            const keyBase = group[0].id ?? group[0].ad_partner_id;
                out.push({ type: 'ad', key: `a-${keyBase}`, data: group });
                adCursor += 1;
            }
        }
    }

    // Tail: dump any remaining promo groups so partners with leftover
    // inventory still get exposure when the feed runs out of sessions.
    // Gated on `hasMoreItems` — otherwise this fires on every partial page
    // load, causing a consecutive promo clump at the end of the rendered
    // list while more sessions are still pending. Only drain when the item
    // feed is truly exhausted.
    if (!hasMoreItems) {
        while (adCursor < groups.length) {
            const group = groups[adCursor];
            if (group.length) {
                const keyBase = group[0].id ?? group[0].ad_partner_id;
                out.push({ type: 'ad', key: `a-${keyBase}`, data: group });
            }
            adCursor += 1;
        }
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
