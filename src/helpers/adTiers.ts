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
export const adPlansUrl = () => `${WEB_APP_BASE}/plans`;
export const adCreditsUrl = () => `${WEB_APP_BASE}/ad-pay`; // buy-credits page
