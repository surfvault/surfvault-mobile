import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  Switch,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import { useUser } from '../../src/context/UserProvider';
import ScreenHeader from '../../src/components/ScreenHeader';
import ActionSheet from '../../src/components/ActionSheet';
import ContactUserSheet from '../../src/components/ContactUserSheet';
import { useUpdatePreferencesMutation, useGetUserQuery } from '../../src/store';
import {
  useUserPreferences,
  kmToUnit,
  unitToKm,
  type DistanceUnit,
  type ThemePref,
  type PreferencesPatch,
} from '../../src/helpers/preferences';

const PRIVACY_URL = 'https://surf-vault.com/privacy-policy';
const SUPPORT_EMAIL = 'support@surf-vault.com';
const SUPPORT_HANDLE = 'vault_support';

// Radius presets are round numbers IN THE DISPLAYED UNIT (so miles users see
// 25/50/100… not 31/62/124…). The stored value is always km — a tapped chip is
// converted on write, and active-state matching converts the stored km back to
// the unit and rounds. Ranges stay inside the API clamp bounds.
const BREAK_RADIUS_PRESETS: Record<DistanceUnit, number[]> = {
  mi: [25, 50, 100, 150, 250],
  km: [50, 100, 200, 300, 500],
};
const PHOTOG_RADIUS_PRESETS: Record<DistanceUnit, number[]> = {
  mi: [10, 25, 50, 100, 150],
  km: [25, 50, 100, 200, 300],
};

const SKY = '#0ea5e9';

type Colors = {
  screen: string;
  card: string;
  border: string;
  text: string;
  sub: string;
  muted: string;
  divider: string;
  segBg: string;
  segActive: string;
};

function getColors(isDark: boolean): Colors {
  return {
    screen: isDark ? '#000000' : '#ffffff',
    card: isDark ? '#111827' : '#f9fafb',
    border: isDark ? '#1f2937' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    sub: isDark ? '#9ca3af' : '#6b7280',
    muted: isDark ? '#6b7280' : '#9ca3af',
    divider: isDark ? '#1f2937' : '#f3f4f6',
    segBg: isDark ? '#0b1220' : '#eef2f7',
    segActive: isDark ? '#1f2937' : '#ffffff',
  };
}

function Card({ c, children }: { c: Colors; children: React.ReactNode }) {
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>{children}</View>;
}

function SectionTitle({ c, children }: { c: Colors; children: string }) {
  return <Text style={[styles.sectionTitle, { color: c.sub }]}>{children}</Text>;
}

function ToggleRow({
  c,
  isDark,
  label,
  description,
  value,
  onValueChange,
  first,
}: {
  c: Colors;
  isDark: boolean;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  first?: boolean;
}) {
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.rowLabel, { color: c.text }]}>{label}</Text>
        {description ? <Text style={[styles.rowDesc, { color: c.muted }]}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: SKY }}
        thumbColor="#ffffff"
        ios_backgroundColor={isDark ? '#374151' : '#d1d5db'}
      />
    </View>
  );
}

function Segmented<T extends string>({
  c,
  options,
  value,
  onChange,
}: {
  c: Colors;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={[styles.segment, { backgroundColor: c.segBg }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segItem, active && { backgroundColor: c.segActive }]}
          >
            <Text style={[styles.segText, { color: active ? c.text : c.sub }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RadiusChips({
  c,
  isDark,
  unit,
  presets,
  valueKm,
  onChange,
}: {
  c: Colors;
  isDark: boolean;
  unit: DistanceUnit;
  presets: number[];
  valueKm: number;
  onChange: (km: number) => void;
}) {
  // Presets are in the displayed unit; stored value is km. Highlight the chip
  // whose value equals the stored radius rounded into this unit.
  const currentInUnit = Math.round(kmToUnit(valueKm, unit));
  return (
    <View style={styles.chipsRow}>
      {presets.map((p) => {
        const active = p === currentInUnit;
        return (
          <Pressable
            key={p}
            onPress={() => onChange(Math.round(unitToKm(p, unit)))}
            style={[
              styles.chip,
              {
                borderColor: active ? SKY : c.border,
                backgroundColor: active ? (isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe') : 'transparent',
              },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? SKY : c.sub }]}>{p}{unit}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LinkRow({
  c,
  label,
  icon,
  onPress,
  first,
}: {
  c: Colors;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  first?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.linkRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}
    >
      <Ionicons name={icon} size={20} color={c.sub} />
      <Text style={[styles.linkLabel, { color: c.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const isDark = useColorScheme() === 'dark';
  const c = getColors(isDark);
  const prefs = useUserPreferences();
  const { user } = useUser();
  const [updatePreferences] = useUpdatePreferencesMutation();
  const [channelSheetVisible, setChannelSheetVisible] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);

  // Support account profile — fetched lazily once the user opens the Contact
  // Support sheet. Gives us the existing conversationId (if any) so "Message us"
  // jumps straight into the thread instead of the support profile page.
  const { data: supportData } = useGetUserQuery(
    { handle: SUPPORT_HANDLE, viewerId: user?.id },
    { skip: !channelSheetVisible }
  );
  const supportProfile = supportData?.results?.photographer ?? supportData?.results;

  // Open existing thread if there is one; otherwise open the first-message
  // composer (startConversation upserts the conversation and returns its id).
  const handleMessageSupport = useCallback(() => {
    setChannelSheetVisible(false);
    if (supportProfile?.conversationId) {
      trackedPush(`/conversation/${supportProfile.conversationId}` as any);
    } else {
      setComposerVisible(true);
    }
  }, [supportProfile, trackedPush]);

  const patch = useCallback(
    (preferences: PreferencesPatch) => {
      // The mutation patches the getSelf cache optimistically so the control
      // reflects the change immediately, then reconciles with the server. Catch
      // failures so a rejected write (e.g. offline) never bubbles as an uncaught
      // promise — the optimistic update is rolled back in onQueryStarted.
      updatePreferences({ preferences })
        .unwrap()
        .catch((e) => console.warn('Failed to save preference', e));
    },
    [updatePreferences]
  );

  const appVersion = Constants.expoConfig?.version ?? '—';

  // Linking.openURL rejects when no handler exists (simulator / no mail app).
  // Await in try/catch so it never bubbles as an uncaught rejection, and fall
  // back to surfacing the address so the user can still reach support.
  const handleContactSupport = useCallback(async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=SurfVault%20Support`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Contact Support', `Email us at ${SUPPORT_EMAIL}`);
    }
  }, []);

  const handleOpenPrivacy = useCallback(async () => {
    try {
      await Linking.openURL(PRIVACY_URL);
    } catch {
      Alert.alert('Privacy Policy', `View it at ${PRIVACY_URL}`);
    }
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.screen }]}>
      <ScreenHeader
        title="Settings"
        left={
          <Pressable onPress={smartBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={c.text} />
          </Pressable>
        }
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Push notifications */}
        <SectionTitle c={c}>Push notifications</SectionTitle>
        <Card c={c}>
          <ToggleRow
            c={c}
            isDark={isDark}
            first
            label="Photographers you follow"
            description="New sessions and when they go active"
            value={prefs.notifications.followers}
            onValueChange={(v) => patch({ notifications: { followers: v } })}
          />
          <ToggleRow
            c={c}
            isDark={isDark}
            label="Favorite breaks"
            description="New photos posted at breaks you've favorited"
            value={prefs.notifications.favorites}
            onValueChange={(v) => patch({ notifications: { favorites: v } })}
          />
          <ToggleRow
            c={c}
            isDark={isDark}
            label="Tagged in a session"
            description="When a photographer tags you in their photos"
            value={prefs.notifications.tagged}
            onValueChange={(v) => patch({ notifications: { tagged: v } })}
          />
          <ToggleRow
            c={c}
            isDark={isDark}
            label="Messages"
            description="New direct messages"
            value={prefs.notifications.messages}
            onValueChange={(v) => patch({ notifications: { messages: v } })}
          />
        </Card>
        <Text style={[styles.footnote, { color: c.muted }]}>
          These control lock-screen push only. You'll still see everything in your notifications and inbox.
        </Text>

        {/* Discovery */}
        <SectionTitle c={c}>Discovery</SectionTitle>
        <Card c={c}>
          <View style={styles.stackRow}>
            <Text style={[styles.rowLabel, { color: c.text }]}>Distance units</Text>
            <View style={{ marginTop: 10 }}>
              <Segmented<DistanceUnit>
                c={c}
                value={prefs.units}
                onChange={(units) => patch({ units })}
                options={[
                  { label: 'Miles', value: 'mi' },
                  { label: 'Kilometers', value: 'km' },
                ]}
              />
            </View>
          </View>

          <View style={[styles.stackRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
            <Text style={[styles.rowLabel, { color: c.text }]}>Nearby surf breaks</Text>
            <Text style={[styles.rowDesc, { color: c.muted }]}>How far to look for breaks near you</Text>
            <View style={{ marginTop: 10 }}>
              <RadiusChips
                c={c}
                isDark={isDark}
                unit={prefs.units}
                presets={BREAK_RADIUS_PRESETS[prefs.units]}
                valueKm={prefs.nearby.breaksKm}
                onChange={(breaksKm) => patch({ nearby: { breaksKm } })}
              />
            </View>
          </View>

          <View style={[styles.stackRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
            <Text style={[styles.rowLabel, { color: c.text }]}>Nearby photographers</Text>
            <Text style={[styles.rowDesc, { color: c.muted }]}>How far to look for photographers near you</Text>
            <View style={{ marginTop: 10 }}>
              <RadiusChips
                c={c}
                isDark={isDark}
                unit={prefs.units}
                presets={PHOTOG_RADIUS_PRESETS[prefs.units]}
                valueKm={prefs.nearby.photographersKm}
                onChange={(photographersKm) => patch({ nearby: { photographersKm } })}
              />
            </View>
          </View>
        </Card>

        {/* Vault — only applies to surfers (the access-request → auto-save flow) */}
        {user?.user_type === 'surfer' && (
          <>
            <SectionTitle c={c}>Vault</SectionTitle>
            <Card c={c}>
              <ToggleRow
                c={c}
                isDark={isDark}
                first
                label="Auto-save approved photos"
                description="When a photographer grants your access request, save those photos to your vault automatically"
                value={prefs.autoSaveApprovedToVault}
                onValueChange={(v) => patch({ autoSaveApprovedToVault: v })}
              />
            </Card>
          </>
        )}

        {/* Appearance */}
        <SectionTitle c={c}>Appearance</SectionTitle>
        <Card c={c}>
          <View style={styles.stackRow}>
            <Text style={[styles.rowLabel, { color: c.text }]}>Theme</Text>
            <View style={{ marginTop: 10 }}>
              <Segmented<ThemePref>
                c={c}
                value={prefs.theme}
                onChange={(theme) => patch({ theme })}
                options={[
                  { label: 'System', value: 'system' },
                  { label: 'Light', value: 'light' },
                  { label: 'Dark', value: 'dark' },
                ]}
              />
            </View>
          </View>
        </Card>

        {/* Language */}
        <SectionTitle c={c}>Language</SectionTitle>
        <Card c={c}>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: c.text }]}>App language</Text>
              <Text style={[styles.rowDesc, { color: c.muted }]}>More languages coming soon</Text>
            </View>
            <Text style={[styles.rowValue, { color: c.muted }]}>English</Text>
          </View>
        </Card>

        {/* System */}
        <SectionTitle c={c}>System</SectionTitle>
        <Card c={c}>
          <LinkRow c={c} first label="Open device settings" icon="phone-portrait-outline" onPress={() => Linking.openSettings()} />
        </Card>
        <Text style={[styles.footnote, { color: c.muted }]}>
          Manage OS-level permissions (notifications, photos, location) in the iOS Settings app.
        </Text>

        {/* About */}
        <SectionTitle c={c}>About</SectionTitle>
        <Card c={c}>
          <LinkRow c={c} first label="Privacy Policy" icon="document-text-outline" onPress={handleOpenPrivacy} />
          <LinkRow c={c} label="Contact Support" icon="help-buoy-outline" onPress={() => setChannelSheetVisible(true)} />
        </Card>
        <Text style={[styles.footnote, { color: c.muted }]}>SurfVault v{appVersion}</Text>
      </ScrollView>

      <ActionSheet
        visible={channelSheetVisible}
        onClose={() => setChannelSheetVisible(false)}
        header={{ title: 'Contact Support', subtitle: 'How would you like to reach us?' }}
        sections={[
          {
            options: [
              {
                label: 'Message us in the app',
                icon: 'chatbubble-ellipses-outline',
                onPress: handleMessageSupport,
              },
              {
                label: 'Email us',
                icon: 'mail-outline',
                onPress: () => {
                  setChannelSheetVisible(false);
                  handleContactSupport();
                },
              },
            ],
          },
        ]}
      />

      <ContactUserSheet
        visible={composerVisible}
        user={{ id: supportProfile?.id, handle: SUPPORT_HANDLE }}
        onClose={() => setComposerVisible(false)}
        onSent={(conversationId) => trackedPush(`/conversation/${conversationId}` as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  stackRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 16, fontWeight: '500' },
  rowDesc: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  rowValue: { fontSize: 16 },
  footnote: { fontSize: 12, marginTop: 8, marginLeft: 4, lineHeight: 17 },
  segment: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  segItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segText: { fontSize: 14, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  linkLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
});
