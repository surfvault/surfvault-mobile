// Off-platform payment handles surfaced on photographer/shaper profiles.
// SurfVault processes NO money — these are display-only pointers. Mirrors the
// backend sanitizer (surfvault-api/services/user/helpers.ts) + the web helper.

export const PAYMENT_CHANNEL_TYPES = ['paypal', 'other', 'venmo', 'cashapp', 'zelle'] as const;
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
  // Rails that only work between two US accounts — flagged in the editor so
  // non-US photographers / international surfers aren't misled.
  usOnly?: boolean;
}

export const PAYMENT_CHANNEL_META: Record<string, ChannelMeta> = {
  paypal: { label: 'PayPal', placeholder: 'paypal.me/you or username', copyOnly: false, icon: 'logo-paypal', color: '#003087' },
  other: { label: 'Payment link', placeholder: 'Wise, Remitly, Stripe, PayPal.me… any pay URL', copyOnly: false, icon: 'link-outline', color: '#64748b' },
  venmo: { label: 'Venmo', placeholder: '@your-venmo', copyOnly: false, icon: 'logo-venmo', color: '#3D95CE', usOnly: true },
  cashapp: { label: 'Cash App', placeholder: '$yourcashtag', copyOnly: false, icon: 'cash-outline', color: '#00C244', usOnly: true },
  zelle: { label: 'Zelle', placeholder: 'email or phone number', copyOnly: true, icon: 'mail-outline', color: '#6D1ED4', usOnly: true },
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
  if (channel?.type === 'other') return channel.label || 'Payment link';
  return PAYMENT_CHANNEL_META[channel?.type]?.label ?? String(channel?.type ?? '');
};

export const isCopyOnlyChannel = (channel: PaymentChannel): boolean =>
  Boolean(PAYMENT_CHANNEL_META[channel?.type]?.copyOnly);

// Compose a one-off payment-request DM body. Off-platform — SurfVault never
// touches the money; this just drops the photographer's pay info into the chat
// as a normal message. `payTo` is a tappable link (preferred — e.g. a Venmo
// deep link or a freshly-generated one-time Payoneer link) or a copy-only
// handle (email/phone). `providerLabel` labels it ("Pay me on Payoneer: …");
// omit it for a bare link ("Pay here: …").
export const buildPaymentRequestMessage = ({
  amount,
  note,
  providerLabel,
  payTo,
}: {
  amount?: string;
  note?: string;
  providerLabel?: string;
  payTo?: string;
}): string => {
  const lines: string[] = [];
  const amt = (amount ?? '').trim();
  lines.push(amt ? `Payment request: $${amt}` : 'Payment request');
  const n = (note ?? '').trim();
  if (n) lines.push(n);
  const pay = (payTo ?? '').trim();
  if (pay) {
    const label = (providerLabel ?? '').trim();
    lines.push(label ? `Pay me on ${label}: ${pay}` : `Pay here: ${pay}`);
  }
  return lines.join('\n');
};

export const normalizePaymentChannels = (raw: unknown): PaymentChannel[] =>
  (Array.isArray(raw) ? raw : []).filter(
    (c: any) => c && PAYMENT_CHANNEL_META[c.type] && typeof c.handle === 'string' && c.handle.trim()
  );

// True when a user is an eligible type (photographer/shaper) AND has at least
// one configured payment channel. Gates the messenger "Generate payment link"
// action so it only shows when there's something to pay to.
export const hasPaymentChannels = (user: any): boolean =>
  isPaymentEligibleType(user?.user_type) &&
  normalizePaymentChannels(user?.payment_channels).length > 0;
