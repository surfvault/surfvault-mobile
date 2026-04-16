import { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserProvider';
import { useCancelAccountDeletionMutation } from '../store';

export default function PendingDeletionBanner() {
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const [cancelDeletion, { isLoading }] = useCancelAccountDeletionMutation();
  const [confirming, setConfirming] = useState(false);

  const handleCancel = useCallback(() => {
    if (confirming || isLoading) return;
    setConfirming(true);
    Alert.alert(
      'Cancel Account Deletion?',
      'Your account will be restored. If your paid subscription is still active, it will continue normally. If it already ended during the grace period, you\'ll be on the Free plan.',
      [
        { text: 'Keep Deleting', style: 'cancel', onPress: () => setConfirming(false) },
        {
          text: 'Cancel Deletion',
          style: 'default',
          onPress: async () => {
            try {
              await cancelDeletion({}).unwrap();
            } catch {
              Alert.alert('Error', 'Failed to cancel deletion. Please try again.');
            } finally {
              setConfirming(false);
            }
          },
        },
      ]
    );
  }, [cancelDeletion, confirming, isLoading]);

  if (!user?.deletion_requested_at || !user?.deletion_scheduled_for) return null;
  if (user?.deleted_at) return null;

  const scheduledFor = new Date(user.deletion_scheduled_for as string);
  const now = new Date();
  const msRemaining = scheduledFor.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  return (
    <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning" size={14} color="#fff" />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            Deletes in {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Download photos before then
          </Text>
        </View>
        <Pressable
          onPress={handleCancel}
          disabled={isLoading}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          hitSlop={6}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#7c2d12" />
          ) : (
            <Text style={styles.buttonText}>Cancel</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ea580c',
    paddingBottom: 6,
    paddingHorizontal: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 1,
  },
  button: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#7c2d12',
    fontSize: 13,
    fontWeight: '700',
  },
});
