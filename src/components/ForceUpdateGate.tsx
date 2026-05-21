import { View, Text, Pressable, StyleSheet, Linking, Platform, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useGetAppVersionQuery } from '../store';

const STORE_URL = Platform.select({
  ios: 'https://apps.apple.com/app/id6768126465',
  android: 'https://play.google.com/store/apps/details?id=com.surfvaultapp.mobile',
}) as string;

// Semver-ish compare of dotted numeric versions. Returns -1 if a < b, 0 if
// equal, 1 if a > b. Tolerant of missing/extra segments and non-numeric junk.
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/**
 * Launch-time force-update gate. Native (store) builds can't be replaced by an
 * OTA update, so when a change requires a new binary we raise the minimum
 * supported version (DB: app_config) and this blocks older installs until the
 * user updates from the store.
 *
 * Fail-open by design: if the version check is missing, null, errors, or is
 * still loading, nothing renders — a backend/config hiccup must never lock the
 * whole user base out of the app.
 */
export default function ForceUpdateGate() {
  const isDark = useColorScheme() === 'dark';
  const { data } = useGetAppVersionQuery();

  const installed = Constants.expoConfig?.version ?? null;
  const minVersion = Platform.OS === 'ios' ? data?.ios?.minVersion : data?.android?.minVersion;

  const blocked = !!installed && !!minVersion && compareVersions(installed, minVersion) < 0;
  if (!blocked) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <View style={styles.inner}>
        <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}>
          <Ionicons name="rocket-outline" size={34} color="#0ea5e9" />
        </View>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#111827' }]}>Update required</Text>
        <Text style={[styles.body, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
          A newer version of SurfVault is available. Please update to keep using the app.
        </Text>
        <Pressable
          onPress={() => Linking.openURL(STORE_URL).catch(() => { /* noop */ })}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            Update on the {Platform.OS === 'ios' ? 'App Store' : 'Play Store'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  inner: { alignItems: 'center', maxWidth: 380 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  button: {
    marginTop: 28,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
