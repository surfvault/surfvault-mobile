// Mobile mirror of surfvault-api/shared/ad_tiers.ts (credit model). Used to show
// live credit cost + balance and to gate the free break cap. Billing is web-only
// (no in-app Chargebee per the billing strategy) — top-up/subscribe open the web
// app. The server is always authoritative; this only shapes the UI.

export type AdTier = 'free' | 'spotlight' | 'reach' | 'brand';

export const TIER_MONTHLY_GRANT: Record<AdTier, number> = {
  free: 90,
  spotlight: 300,
  reach: 1000,
  brand: 3500,
};

export const AD_TIER_LABELS: Record<AdTier, string> = {
  free: 'Free',
  spotlight: 'Spotlight',
  reach: 'Reach',
  brand: 'Brand',
};

export const FREE_BREAK_CAP = 2;

/** Daily credit cost = 1 credit per surface (break or Discover). */
export const dailyCreditCost = (breakCount: number, onDiscover: boolean): number =>
  Math.max(0, breakCount || 0) + (onDiscover ? 1 : 0);

const MS_PER_DAY = 86400000;

/**
 * Whole serving days remaining in a campaign window, counting from today (or its
 * future start) through its end date, inclusive. Returns null for an open-ended
 * campaign (no end date = no finite total cost).
 */
export const campaignWindowDays = (
  startsAt?: string | Date | null,
  endsAt?: string | Date | null,
): number | null => {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const start = startsAt ? new Date(startsAt) : now;
  const from = start > now ? start : now;
  const days = Math.floor((end.getTime() - from.getTime()) / MS_PER_DAY) + 1; // inclusive
  return Math.max(0, days);
};

export const adTierOf = (user: any): AdTier => (user?.adPartner?.adTier ?? 'free') as AdTier;

export const creditBalance = (user: any): { monthly: number; pack: number; total: number } => {
  const ap = user?.adPartner;
  if (!ap) return { monthly: 0, pack: 0, total: 0 };
  const monthly = ap.monthlyCredits ?? 0;
  const pack = ap.packCredits ?? 0;
  return { monthly, pack, total: ap.credits ?? monthly + pack };
};

// Web app base — billing flows hand off here (billing is web-only).
export const WEB_APP_BASE = 'https://app.surf-vault.com';
// `from=app` tells the web app this is the native billing handoff: suppress the
// "download the app" takeover (they came FROM the app — nudging back is a dead
// loop) and pre-fill login. `login_hint` (the user's email) smooths the one-time
// web sign-in for browsers that haven't authenticated yet.
const handoff = (path: string, email?: string | null) => {
  const params = new URLSearchParams({ from: 'app' });
  if (email) params.set('login_hint', email);
  return `${WEB_APP_BASE}${path}?${params.toString()}`;
};
export const adPlansUrl = (email?: string | null) => handoff('/plans', email);
export const adCreditsUrl = (email?: string | null) => handoff('/ad-pay', email); // buy-credits page
