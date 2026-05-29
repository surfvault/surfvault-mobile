import { Text, StyleSheet, Linking, Alert } from 'react-native';
import ActionSheet, { type ActionSheetOption } from './ActionSheet';
import {
  PAYMENT_CHANNEL_META,
  isCopyOnlyChannel,
  isPaymentEligibleType,
  normalizePaymentChannels,
  paymentChannelDisplay,
  paymentChannelHref,
} from '../helpers/paymentChannels';
import * as Clipboard from 'expo-clipboard';

/**
 * Off-platform payment pointers (Venmo / PayPal / Cash App / Zelle / …).
 * Display-only — SurfVault never processes the money. Link channels deep-link
 * out; copy-only channels (Zelle) write to the clipboard.
 *
 * The sheet + channel logic lives here (not inline on the profile) so a single
 * entry point — the nav-bar pay icon on the read-only /user/[handle] view —
 * can open it without bloating the profile body.
 */

/** Whether a profile is eligible AND has at least one configured channel. */
export function hasPaymentChannels(profile: any): boolean {
  const userType = profile?.user_type ?? profile?.type;
  if (!isPaymentEligibleType(userType)) return false;
  return normalizePaymentChannels(profile?.payment_channels).length > 0;
}

/** Donation framing ("Buy me a coffee") vs direct pay ("Pay {name}"). */
export function acceptsDonations(profile: any): boolean {
  return Boolean(profile?.accepts_donations);
}

interface PaymentSheetProps {
  profile: any;
  isDark: boolean;
  visible: boolean;
  onClose: () => void;
}

export default function PaymentSheet({ profile, isDark, visible, onClose }: PaymentSheetProps) {
  const userType = profile?.user_type ?? profile?.type;
  if (!isPaymentEligibleType(userType)) return null;

  const channels = normalizePaymentChannels(profile?.payment_channels);
  if (!channels.length) return null;

  const firstName = String(profile?.name || profile?.handle || '').split(' ')[0];
  const donate = Boolean(profile?.accepts_donations);

  const onCopy = async (handle: string) => {
    try {
      await Clipboard.setStringAsync(handle);
      Alert.alert('Copied', `${handle} copied to clipboard.`);
    } catch {
      /* clipboard unavailable — noop */
    }
  };

  const onOpen = async (href: string | null) => {
    if (!href) return;
    try {
      await Linking.openURL(href);
    } catch {
      /* no handler for this URL — noop */
    }
  };

  const options: ActionSheetOption[] = channels.map((channel) => {
    const meta = PAYMENT_CHANNEL_META[channel.type] ?? PAYMENT_CHANNEL_META.other;
    const copyOnly = isCopyOnlyChannel(channel);
    return {
      label: paymentChannelDisplay(channel),
      subtitle: copyOnly ? 'Tap to copy' : 'Tap to open',
      icon: meta.icon as any,
      iconColor: meta.color,
      onPress: () => (copyOnly ? onCopy(channel.handle) : onOpen(paymentChannelHref(channel))),
    };
  });

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={donate ? 'Buy me a coffee' : `Pay ${firstName}`}
      titleStyle={styles.payTitle}
      options={options}
      footerNode={
        <Text style={[styles.disclaimer, { color: isDark ? '#6b7280' : '#9ca3af' }]}>
          Paid directly to the {userType} — SurfVault doesn&apos;t process payments.
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  payTitle: { fontSize: 17, marginTop: 8, marginBottom: 16 },
  disclaimer: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
});
