import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { useUser } from '../context/UserProvider';

const DISMISS_KEY = 'notification_priming_dismissed_at';
const RE_SHOW_AFTER_DAYS = 7;

type Props = {
  // Only considered when the user is fully onboarded (handle + type set).
  isOnboarded: boolean;
  // Called after the OS permission prompt completes, regardless of outcome.
  // Parent uses this to re-attempt push token registration.
  onPermissionChanged?: () => void;
};

export default function NotificationPrimingModal({ isOnboarded, onPermissionChanged }: Props) {
  const isDark = useColorScheme() === 'dark';
  const { user } = useUser();
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // Check whether to show the priming modal on mount / user change
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user?.id || !isOnboarded) return;
      if (!Device.isDevice) return;

      // Don't show during an account deletion grace period
      if (user?.deletion_requested_at) return;

      try {
        const { status } = await Notifications.getPermissionsAsync();

        // Only prime when iOS hasn't asked yet. If user previously granted or
        // denied, respect that — they'd have to go to Settings anyway.
        if (status !== 'undetermined') return;

        // Respect recent dismissal
        const dismissedAt = await SecureStore.getItemAsync(DISMISS_KEY);
        if (dismissedAt) {
          const dismissedTime = parseInt(dismissedAt, 10);
          const msSince = Date.now() - dismissedTime;
          if (msSince < RE_SHOW_AFTER_DAYS * 24 * 60 * 60 * 1000) return;
        }

        if (!cancelled) setVisible(true);
      } catch {
        // fail quietly; priming is not critical
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, isOnboarded, user?.deletion_requested_at]);

  const handleEnable = useCallback(async () => {
    setRequesting(true);
    try {
      await Notifications.requestPermissionsAsync();
      onPermissionChanged?.();
    } catch {
      // no-op
    } finally {
      setRequesting(false);
      setVisible(false);
    }
  }, [onPermissionChanged]);

  const handleLater = useCallback(async () => {
    try {
      await SecureStore.setItemAsync(DISMISS_KEY, String(Date.now()));
    } catch {
      // no-op
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={[s.card, { backgroundColor: isDark ? '#111827' : '#ffffff' }]}>
          <View style={[s.iconWrap, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}>
            <Ionicons name="notifications" size={32} color="#0ea5e9" />
          </View>

          <Text style={[s.title, { color: isDark ? '#ffffff' : '#111827' }]}>
            Stay in the loop
          </Text>

          <Text style={[s.subtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
            Turn on notifications to know when:
          </Text>

          <View style={s.bullets}>
            <BulletRow isDark={isDark} icon="camera-outline" text="Photographers you follow post new sessions" />
            <BulletRow isDark={isDark} icon="chatbubble-outline" text="You receive a new message" />
            <BulletRow isDark={isDark} icon="key-outline" text="Your photo access request is approved" />
          </View>

          <Pressable
            onPress={handleEnable}
            disabled={requesting}
            style={[s.primaryBtn, requesting && { opacity: 0.6 }]}
          >
            <Text style={s.primaryBtnText}>Enable Notifications</Text>
          </Pressable>

          <Pressable onPress={handleLater} disabled={requesting} style={s.secondaryBtn}>
            <Text style={[s.secondaryBtnText, { color: isDark ? '#9ca3af' : '#6b7280' }]}>Not Now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function BulletRow({
  isDark,
  icon,
  text,
}: {
  isDark: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <View style={s.bulletRow}>
      <View style={[s.bulletIcon, { backgroundColor: isDark ? 'rgba(14,165,233,0.12)' : '#f0f9ff' }]}>
        <Ionicons name={icon} size={16} color="#0ea5e9" />
      </View>
      <Text style={[s.bulletText, { color: isDark ? '#d1d5db' : '#374151' }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  bullets: {
    alignSelf: 'stretch',
    marginBottom: 22,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 12,
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
