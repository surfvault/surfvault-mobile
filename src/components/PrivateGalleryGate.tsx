import { View, Text, Pressable, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type AccessStatus = 'pending' | 'approved' | 'rejected' | undefined | null;

export type AccessRequest = {
  access_status?: AccessStatus;
  expires_at?: string | null;
} | null | undefined;

function formatExpiry(expiresAt: string): string {
  const d = new Date(expiresAt);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * In-flow banner shown above a gallery when the viewer has approved,
 * time-limited access. Renders null for unlimited grants or non-approved states.
 */
export function AccessBanner({
  isPrivate,
  accessRequest,
  scope,
}: {
  isPrivate: boolean;
  accessRequest: AccessRequest;
  scope: 'profile' | 'session';
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (!isPrivate) return null;
  if (accessRequest?.access_status !== 'approved') return null;
  if (!accessRequest?.expires_at) return null;

  const formatted = formatExpiry(accessRequest.expires_at);
  const label = scope === 'profile'
    ? `You have access to this user's sessions until ${formatted}.`
    : `You have access to this user's session until ${formatted}.`;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: isDark ? 'rgba(14,165,233,0.12)' : '#f0f9ff',
          borderColor: isDark ? 'rgba(14,165,233,0.3)' : '#bae6fd',
        },
      ]}
    >
      <Ionicons name="time-outline" size={16} color={isDark ? '#38bdf8' : '#0284c7'} />
      <Text style={[styles.bannerText, { color: isDark ? '#bae6fd' : '#075985' }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Inline "private gallery" card shown in place of the gallery grid when the
 * viewer lacks approved access. Lets them request access (or see their pending
 * request status).
 */
export function PrivateGalleryCard({
  scope,
  accessRequest,
  onRequestAccess,
  isSending,
}: {
  scope: 'profile' | 'session';
  accessRequest: AccessRequest;
  onRequestAccess: () => void;
  isSending: boolean;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const status = accessRequest?.access_status;
  const pending = status === 'pending';

  const message = scope === 'profile'
    ? "This photographer's sessions are private. Request access to unlock their content."
    : "This user's profile is private. You must request access to view this session.";

  return (
    <View style={styles.cardWrap}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? 'rgba(17,24,39,0.7)' : '#ffffff',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
          },
        ]}
      >
        <View
          style={[
            styles.lockIconWrap,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
              borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#e2e8f0',
            },
          ]}
        >
          <Ionicons name="lock-closed" size={22} color={isDark ? '#e5e7eb' : '#334155'} />
        </View>

        <Text style={[styles.cardTitle, { color: isDark ? '#fff' : '#0f172a' }]}>
          Private gallery
        </Text>
        <Text style={[styles.cardBody, { color: isDark ? 'rgba(255,255,255,0.75)' : '#475569' }]}>
          {message}
        </Text>

        {pending ? (
          <View
            style={[
              styles.pendingCard,
              {
                backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#fffbeb',
                borderColor: isDark ? 'rgba(245,158,11,0.3)' : '#fde68a',
              },
            ]}
          >
            <Ionicons
              name="time-outline"
              size={16}
              color={isDark ? '#fbbf24' : '#b45309'}
            />
            <Text style={[styles.pendingText, { color: isDark ? '#fde68a' : '#78350f' }]}>
              Request pending — you'll be notified if it's approved.
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={onRequestAccess}
            disabled={isSending}
            style={({ pressed }) => [
              styles.requestBtn,
              {
                backgroundColor: '#0284c7',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={[styles.requestBtnText, { color: '#ffffff' }]}>
                Request Access
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  cardWrap: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lockIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 14,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'stretch',
  },
  pendingText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  requestBtn: {
    minWidth: 160,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  requestBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
