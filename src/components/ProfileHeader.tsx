import { View, Text, Pressable, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import UserAvatar from './UserAvatar';

const isNoteActive = (setAt?: string): boolean => {
  if (!setAt) return false;
  return Date.now() - new Date(setAt).getTime() < 7 * 24 * 60 * 60 * 1000;
};

interface ProfileHeaderProps {
  profile: any;
  isDark: boolean;
  isSelf?: boolean;
  showStorage?: boolean;
  showActiveToggle?: boolean;
  // Self actions
  onEditProfile?: () => void;
  onToggleActive?: () => void;
  onSelectBreak?: () => void;
  onEditStatusNote?: () => void;
  currentBreakName?: string;
  storageUsed?: number;
  storageLimit?: number;
  // Other user actions
  isFollowing?: boolean;
  isFollowLoading?: boolean;
  isMessageLoading?: boolean;
  onFollow?: () => void;
  onMessage?: () => void;
  onShare?: () => void;
  // Tap a stat count to open followers/following list
  onViewStats?: (tab: 'followers' | 'following') => void;
}

export default function ProfileHeader({
  profile,
  isDark,
  isSelf = false,
  onEditProfile,
  onToggleActive,
  onSelectBreak,
  onEditStatusNote,
  currentBreakName,
  storageUsed = 0,
  storageLimit = 15,
  isFollowing,
  isFollowLoading = false,
  isMessageLoading = false,
  onFollow,
  onMessage,
  onShare,
  onViewStats,
  showStorage = false,
  showActiveToggle = false,
}: ProfileHeaderProps) {
  const router = useRouter();
  const hasActiveNote = !!profile?.status_note && isNoteActive(profile?.status_note_set_at);
  const userType = profile?.user_type ?? profile?.type;
  const storagePct = storageLimit > 0 ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;

  const formatStorage = (gb: number): string => {
    if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <View style={s.wrap}>
      {/* Chat bubble above avatar */}
      {hasActiveNote && (
        <Pressable
          onPress={isSelf ? onEditStatusNote : undefined}
          style={[s.chatBubble, {
            backgroundColor: isDark ? '#1e293b' : '#eff6ff',
            borderColor: isDark ? '#334155' : '#bfdbfe',
          }]}
        >
          <Text style={[s.chatBubbleText, { color: isDark ? '#e2e8f0' : '#1e40af' }]} numberOfLines={3}>
            {profile.status_note}
          </Text>
        </Pressable>
      )}

      {/* Avatar + right column */}
      <View style={s.topRow}>
        <Pressable onPress={isSelf ? onEditStatusNote : undefined}>
          <UserAvatar
            uri={profile?.picture}
            name={profile?.name ?? profile?.handle}
            size={80}
            active={false}
            verified={profile?.verified}
          />
        </Pressable>
        <View style={s.rightColumn}>
          {/* Name + social */}
          <View style={s.nameRowOuter}>
            <View style={s.nameAndDot}>
              <Text style={[s.nameText, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                {profile?.name ?? profile?.handle ?? ''}
              </Text>
              <View style={[s.activeDot, {
                backgroundColor: profile?.active ? '#10b981' : 'transparent',
                borderWidth: profile?.active ? 0 : 1,
                borderColor: '#9ca3af',
              }]} />
            </View>
            {(profile?.instagram || profile?.youtube || profile?.website) && (
              <View style={s.socialIcons}>
                {profile?.instagram && (
                  <Pressable onPress={() => Linking.openURL(`https://instagram.com/${profile.instagram.replace(/^@/, '')}`)} hitSlop={6}>
                    <Ionicons name="logo-instagram" size={16} color="#ec4899" />
                  </Pressable>
                )}
                {profile?.youtube && (
                  <Pressable onPress={() => Linking.openURL(`https://youtube.com/@${profile.youtube}`)} hitSlop={6}>
                    <Ionicons name="logo-youtube" size={16} color="#ef4444" />
                  </Pressable>
                )}
                {profile?.website && (
                  <Pressable onPress={() => Linking.openURL(profile.website?.startsWith('http') ? profile.website : `https://${profile.website}`)} hitSlop={6}>
                    <Ionicons name="link-outline" size={16} color="#3b82f6" />
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Stats */}
          {(() => {
            // Followers/following are viewable when:
            //  - it's your own profile, OR
            //  - the profile is public (not private)
            // Backend /user/{handle}/follow-stats enforces access on private profiles.
            const isPrivate = profile?.access === 'private';
            const statsTappable = Boolean(onViewStats) && (isSelf || !isPrivate);
            return (
              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={[s.statNumber, { color: isDark ? '#fff' : '#111827' }]}>
                    {profile?.surfBreaksCount ?? profile?.mySpots?.length ?? profile?.my_spots?.length ?? 0}
                  </Text>
                  <Text style={s.statLabel}>spots</Text>
                </View>
                <Pressable
                  onPress={statsTappable ? () => onViewStats?.('followers') : undefined}
                  disabled={!statsTappable}
                  style={s.statItem}
                  hitSlop={4}
                >
                  <Text style={[s.statNumber, { color: isDark ? '#fff' : '#111827' }]}>
                    {profile?.followersCount ?? profile?.follower_count ?? profile?.followers_count ?? 0}
                  </Text>
                  <Text style={s.statLabel}>followers</Text>
                </Pressable>
                <Pressable
                  onPress={statsTappable ? () => onViewStats?.('following') : undefined}
                  disabled={!statsTappable}
                  style={s.statItem}
                  hitSlop={4}
                >
                  <Text style={[s.statNumber, { color: isDark ? '#fff' : '#111827' }]}>
                    {profile?.followingCount ?? profile?.following_count ?? 0}
                  </Text>
                  <Text style={s.statLabel}>following</Text>
                </Pressable>
              </View>
            );
          })()}
        </View>
      </View>

      {/* Bio */}
      {profile?.bio && (
        <Text style={[s.bioText, { color: isDark ? '#d1d5db' : '#374151' }]}>{profile.bio}</Text>
      )}

      {/* Tags */}
      {(userType || profile?.verified || (!isSelf && profile?.access === 'private') || (profile?.tags?.length ?? 0) > 0) && (
        <View style={s.tagsRow}>
          {userType && (
            <View style={[s.tagPill, s.typePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }]}>
              {userType === 'photographer' ? (
                <Ionicons name="camera-outline" size={11} color={isDark ? '#d1d5db' : '#475569'} />
              ) : userType === 'shaper' ? (
                <MaterialCommunityIcons name="hammer-wrench" size={11} color={isDark ? '#d1d5db' : '#475569'} />
              ) : (
                <MaterialCommunityIcons name="surfing" size={12} color={isDark ? '#d1d5db' : '#475569'} />
              )}
              <Text style={{ fontSize: 11, fontWeight: '500', color: isDark ? '#d1d5db' : '#475569' }}>
                {userType === 'photographer' ? 'Photographer' : userType === 'shaper' ? 'Shaper' : 'Surfer'}
              </Text>
            </View>
          )}
          {profile?.verified && (
            <View style={[s.tagPill, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#f0f9ff', borderWidth: 1, borderColor: isDark ? 'rgba(14,165,233,0.3)' : '#bae6fd' }]}>
              <Text style={{ fontSize: 11, fontWeight: '500', color: isDark ? '#38bdf8' : '#0284c7' }}>Verified</Text>
            </View>
          )}
          {!isSelf && profile?.access === 'private' && (
            <View style={[s.tagPill, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2', borderWidth: 1, borderColor: isDark ? 'rgba(239,68,68,0.25)' : '#fecaca' }]}>
              <Text style={{ fontSize: 11, fontWeight: '500', color: isDark ? '#fca5a5' : '#dc2626' }}>Private</Text>
            </View>
          )}
          {profile?.tags?.map((tag: string) => (
            <View key={tag} style={[s.tagPill, { backgroundColor: isDark ? 'rgba(99,102,241,0.1)' : '#eef2ff' }]}>
              <Text style={{ fontSize: 11, fontWeight: '500', color: isDark ? '#a5b4fc' : '#4338ca' }}>{tag}</Text>
            </View>
          ))}
        </View>
      )}


      {/* Profile tab: break selector + active toggle */}
      {showActiveToggle ? (
        <View style={s.actionRow}>
          <Pressable
            onPress={showActiveToggle ? onSelectBreak : undefined}
            style={[s.actionBtn, s.breakBtn, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}
          >
            <Ionicons name="location-outline" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
            <Text style={[s.breakBtnText, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
              {currentBreakName ?? 'Set location'}
            </Text>
          </Pressable>
          {showActiveToggle && userType === 'photographer' && profile?.access !== 'private' && (
            <Pressable
              onPress={onToggleActive}
              style={[s.activeToggleBtn, { backgroundColor: profile?.active ? '#10b981' : (isDark ? '#1f2937' : '#f3f4f6') }]}
            >
              {profile?.active ? (
                <View style={s.activeIndicator}>
                  <View style={s.activeGreenDot} />
                  <Text style={[s.actionBtnText, { color: '#fff' }]}>Active</Text>
                </View>
              ) : (
                <View style={s.activeIndicator}>
                  <Ionicons name="moon-outline" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
                  <Text style={[s.actionBtnText, { color: isDark ? '#9ca3af' : '#6b7280' }]}>Away</Text>
                </View>
              )}
            </Pressable>
          )}
        </View>
      ) : (
        <>
        {/* Other user: location bar with active status */}
        {currentBreakName && (
          <View style={[s.currentBreakRow, {
            backgroundColor: profile?.active ? (isDark ? 'rgba(16,185,129,0.08)' : '#f0fdf4') : (isDark ? '#1f2937' : '#f3f4f6'),
          }]}>
            <Ionicons name="location" size={14} color={profile?.active ? '#10b981' : (isDark ? '#9ca3af' : '#6b7280')} />
            <Text style={{ fontSize: 13, fontWeight: '500', marginLeft: 4, flex: 1, color: profile?.active ? '#10b981' : (isDark ? '#9ca3af' : '#6b7280') }} numberOfLines={1}>
              {currentBreakName}
            </Text>
            {profile?.active ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#10b981' }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#10b981' }}>Active</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="moon-outline" size={13} color={isDark ? '#6b7280' : '#9ca3af'} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#6b7280' : '#9ca3af' }}>Away</Text>
              </View>
            )}
          </View>
        )}
        {!isSelf && (
        <View style={s.actionRow}>
          {/* Follow — hidden on private profiles (matches web) */}
          {profile?.access !== 'private' && (
          <Pressable
            onPress={onFollow}
            disabled={isFollowLoading}
            style={[s.actionBtn, {
              backgroundColor: isFollowing
                ? 'transparent'
                : '#0ea5e9',
              borderWidth: isFollowing ? 1 : 0,
              borderColor: isFollowing
                ? (isDark ? 'rgba(255,255,255,0.18)' : '#cbd5e1')
                : 'transparent',
              opacity: isFollowLoading ? 0.75 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }]}
          >
            {isFollowLoading ? (
              <ActivityIndicator size="small" color={isFollowing ? (isDark ? '#fff' : '#111827') : '#fff'} />
            ) : (
              <>
                {isFollowing && (
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={isDark ? '#fff' : '#111827'}
                  />
                )}
                <Text style={[s.actionBtnText, { color: isFollowing ? (isDark ? '#fff' : '#111827') : '#fff' }]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </>
            )}
          </Pressable>
          )}
          <Pressable
            onPress={onMessage}
            disabled={isMessageLoading}
            style={[s.actionBtn, {
              backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
              opacity: isMessageLoading ? 0.75 : 1,
            }]}
          >
            {isMessageLoading ? (
              <ActivityIndicator size="small" color={isDark ? '#fff' : '#111827'} />
            ) : (
              <Text style={[s.actionBtnText, { color: isDark ? '#fff' : '#111827' }]}>Message</Text>
            )}
          </Pressable>
          {onShare && (
            <Pressable onPress={onShare} style={[s.iconBtn, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
              <Ionicons name="share-outline" size={18} color={isDark ? '#fff' : '#374151'} />
            </Pressable>
          )}
        </View>
        )}
        </>
      )}

      {/* Storage (profile tab only) */}
      {showStorage && (
        <View style={[s.storageWrap, {
          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
        }]}>
          <Text style={[s.storageLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
            {formatStorage(storageUsed)} of {formatStorage(storageLimit)}
          </Text>
          <View style={[s.storageBar, { backgroundColor: isDark ? '#1f2937' : '#e5e7eb' }]}>
            <View style={[s.storageBarFill, { width: `${storagePct}%`, backgroundColor: storagePct > 90 ? '#f59e0b' : '#0ea5e9' }]} />
          </View>
        </View>
      )}

    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  chatBubble: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: -4,
    zIndex: 10,
    marginLeft: 36,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chatBubbleText: { fontSize: 13, lineHeight: 17 },

  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rightColumn: { flex: 1, marginLeft: 16 },

  nameRowOuter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameAndDot: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  nameText: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  socialIcons: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingRight: 16 },
  statItem: { alignItems: 'flex-start' },
  statNumber: { fontSize: 15, fontWeight: '600' },
  statLabel: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  bioText: { fontSize: 14, lineHeight: 19, marginBottom: 6 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  tagPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },


  currentBreakRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8, alignSelf: 'flex-start',
  },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  breakBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12 },
  breakBtnText: { fontSize: 13, fontWeight: '500' },
  actionBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  activeToggleBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  activeIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  activeGreenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  iconBtn: { width: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  storageWrap: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  storageLabel: { fontSize: 12 },
  storageBar: { height: 4, borderRadius: 2, marginTop: 6 },
  storageBarFill: { height: 4, borderRadius: 2 },
});
