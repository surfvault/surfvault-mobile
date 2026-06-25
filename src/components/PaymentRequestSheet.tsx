import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildPaymentRequestMessage,
  isPaymentEligibleType,
  normalizePaymentChannels,
  paymentChannelDisplay,
  paymentChannelHref,
  type PaymentChannel,
} from '../helpers/paymentChannels';

interface PaymentRequestSheetProps {
  visible: boolean;
  user: any;
  onClose: () => void;
  onInsert: (text: string) => void;
}

/**
 * Lets a photographer/shaper compose a payment request inside a DM — amount +
 * note + a pay link (a saved channel, or a freshly generated one-time link like
 * a Payoneer request). SurfVault never processes the money; this just builds a
 * normal message that fills the composer for review before sending.
 */
export default function PaymentRequestSheet({ visible, user, onClose, onInsert }: PaymentRequestSheetProps) {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const channels = useMemo<PaymentChannel[]>(
    () => normalizePaymentChannels(user?.payment_channels),
    [user?.payment_channels]
  );

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [providerLabel, setProviderLabel] = useState('');
  const [payTo, setPayTo] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setNote('');
      setProviderLabel('');
      setPayTo('');
    }
  }, [visible]);

  if (!isPaymentEligibleType(user?.user_type)) return null;

  const pickChannel = (channel: PaymentChannel) => {
    setProviderLabel(paymentChannelDisplay(channel));
    setPayTo(paymentChannelHref(channel) || channel.handle || '');
  };

  const canInsert = payTo.trim().length > 0;

  const handleInsert = () => {
    if (!canInsert) return;
    onInsert(buildPaymentRequestMessage({ amount, note, providerLabel, payTo }));
    onClose();
  };

  const fieldBg = isDark ? 'rgba(255,255,255,0.03)' : '#fff';
  const fieldBorder = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';
  const labelColor = isDark ? '#94a3b8' : '#64748b';
  const textColor = isDark ? '#fff' : '#0f172a';

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kbFill}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: isDark ? '#000000' : '#ffffff', paddingBottom: insets.bottom + 16 }]}>
          <View style={s.handleRow}>
            <View style={[s.handle, { backgroundColor: isDark ? '#374151' : '#d1d5db' }]} />
          </View>

          {/* Header */}
          <View style={[s.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
            <View style={s.iconChip}>
              <Ionicons name="cash-outline" size={16} color="#10b981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: textColor }]}>Request a payment</Text>
              <Text style={[s.subtitle, { color: labelColor }]} numberOfLines={3}>
                SurfVault doesn&apos;t process payments or take a cut — this drops your pay info into the chat so they can pay you directly.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={labelColor} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }} contentContainerStyle={s.body}>
            <Text style={[s.sectionLabel, { color: labelColor }]}>Amount (optional)</Text>
            <View style={[s.inputWrap, { borderColor: fieldBorder, backgroundColor: fieldBg, flexDirection: 'row', alignItems: 'center' }]}>
              <Text style={[s.dollar, { color: labelColor }]}>$</Text>
              <TextInput
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                placeholder="40"
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                keyboardType="decimal-pad"
                style={[s.input, { color: textColor, flex: 1 }]}
              />
            </View>

            <Text style={[s.sectionLabel, { color: labelColor, marginTop: 14 }]}>What&apos;s it for? (optional)</Text>
            <View style={[s.inputWrap, { borderColor: fieldBorder, backgroundColor: fieldBg }]}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Tuesday's session at Mayport"
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                maxLength={120}
                style={[s.input, { color: textColor }]}
              />
            </View>

            {channels.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: labelColor, marginTop: 14 }]}>Use a saved method</Text>
                <View style={s.chipRow}>
                  {channels.map((c, i) => {
                    const label = paymentChannelDisplay(c);
                    const active = providerLabel === label;
                    return (
                      <Pressable
                        key={`${c.type}-${i}`}
                        onPress={() => pickChannel(c)}
                        style={[
                          s.chip,
                          {
                            borderColor: active ? '#10b981' : fieldBorder,
                            backgroundColor: active ? (isDark ? 'rgba(16,185,129,0.12)' : '#ecfdf5') : 'transparent',
                          },
                        ]}
                      >
                        <Text style={[s.chipText, { color: active ? (isDark ? '#6ee7b7' : '#047857') : (isDark ? '#cbd5e1' : '#475569') }]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={[s.sectionLabel, { color: labelColor, marginTop: 14 }]}>Pay link or handle</Text>
            <View style={[s.inputWrap, { borderColor: fieldBorder, backgroundColor: fieldBg }]}>
              <TextInput
                value={payTo}
                onChangeText={setPayTo}
                placeholder="Paste a one-time link, or pick a method above"
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                autoCapitalize="none"
                autoCorrect={false}
                style={[s.input, { color: textColor }]}
              />
            </View>
            <Text style={[s.hint, { color: isDark ? '#475569' : '#94a3b8' }]}>
              {providerLabel ? `Shows as "Pay me on ${providerLabel}: …"` : 'Shows as "Pay here: …"'}
            </Text>
          </ScrollView>

          {/* Footer */}
          <View style={[s.footer, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
            <Pressable onPress={onClose} style={s.cancelBtn}>
              <Text style={[s.cancelText, { color: isDark ? '#e2e8f0' : '#334155' }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleInsert}
              disabled={!canInsert}
              style={[s.addBtn, { backgroundColor: canInsert ? '#059669' : (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0') }]}
            >
              <Ionicons name="add" size={16} color={canInsert ? '#fff' : (isDark ? '#64748b' : '#94a3b8')} />
              <Text style={[s.addText, { color: canInsert ? '#fff' : (isDark ? '#64748b' : '#94a3b8') }]}>Add to message</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  kbFill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handleRow: { alignItems: 'center', paddingVertical: 8 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconChip: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  subtitle: { fontSize: 13, lineHeight: 17, marginTop: 2 },
  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  inputWrap: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  dollar: { fontSize: 15, marginRight: 4 },
  input: { fontSize: 15, lineHeight: 20, padding: 0 },
  hint: { fontSize: 11, marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  addBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  addText: { fontSize: 15, fontWeight: '700' },
});
