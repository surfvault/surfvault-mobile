// Off-platform payment handles surfaced on photographer/shaper profiles.
// SurfVault processes NO money — these are display-only pointers. Mirrors the
// backend sanitizer (surfvault-api/services/user/helpers.ts) + the web helper.

export const PAYMENT_CHANNEL_TYPES = ['venmo', 'paypal', 'zelle', 'cashapp', 'other'] as const;
export type PaymentChannelType = (typeof PAYMENT_CHANNEL_TYPES)[number];
export const MAX_PAYMENT_CHANNELS = 6;

export interface PaymentChannel {
  type: PaymentChannelType | string;
  handle: string;
  label?: string;
}

interface ChannelMeta {
  label: string;
  placeholder: string;
  copyOnly: boolean;
  // Ionicons glyph name; brand icons aren't in the set so we use close generics.
  icon: string;
  color: string;
}

export const PAYMENT_CHANNEL_META: Record<string, ChannelMeta> = {
  venmo: { label: 'Venmo', placeholder: '@your-venmo', copyOnly: false, icon: 'logo-venmo', color: '#3D95CE' },
  paypal: { label: 'PayPal', placeholder: 'paypal.me/you or username', copyOnly: false, icon: 'logo-paypal', color: '#003087' },
  zelle: { label: 'Zelle', placeholder: 'email or phone number', copyOnly: true, icon: 'mail-outline', color: '#6D1ED4' },
  cashapp: { label: 'Cash App', placeholder: '$yourcashtag', copyOnly: false, icon: 'cash-outline', color: '#00C244' },
  other: { label: 'Other', placeholder: 'https://link-to-pay-you', copyOnly: false, icon: 'link-outline', color: '#64748b' },
};

const stripLead = (s: string, ch: string): string => (s.startsWith(ch) ? s.slice(ch.length) : s);

export const isPaymentEligibleType = (userType?: string): boolean =>
  userType === 'photographer' || userType === 'shaper';

// Returns a tappable URL, or null for copy-only channels (Zelle has no
// universal deep link — it's a raw email/phone the user pastes into their bank).
export const paymentChannelHref = (channel: PaymentChannel): string | null => {
  const h = (channel?.handle ?? '').trim();
  if (!h) return null;
  switch (channel.type) {
    case 'venmo':
      return `https://venmo.com/u/${stripLead(h, '@')}`;
    case 'paypal': {
      const clean = h
        .replace(/^https?:\/\//i, '')
        .replace(/^(www\.)?paypal\.me\//i, '')
        .replace(/^@/, '');
      return `https://paypal.me/${clean}`;
    }
    case 'cashapp':
      return `https://cash.app/$${stripLead(h, '$')}`;
    case 'zelle':
      return null;
    case 'other':
      return h.startsWith('http') ? h : `https://${h}`;
    default:
      return null;
  }
};

export const paymentChannelDisplay = (channel: PaymentChannel): string => {
  if (channel?.type === 'other') return channel.label || channel.handle;
  return PAYMENT_CHANNEL_META[channel?.type]?.label ?? String(channel?.type ?? '');
};

export const isCopyOnlyChannel = (channel: PaymentChannel): boolean =>
  Boolean(PAYMENT_CHANNEL_META[channel?.type]?.copyOnly);

export const normalizePaymentChannels = (raw: unknown): PaymentChannel[] =>
  (Array.isArray(raw) ? raw : []).filter(
    (c: any) => c && PAYMENT_CHANNEL_META[c.type] && typeof c.handle === 'string' && c.handle.trim()
  );
