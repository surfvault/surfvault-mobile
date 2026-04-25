import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Linking } from 'react-native';
import { useUser } from '../../src/context/UserProvider';
import { useSmartBack, useTrackedPush } from '../../src/context/NavigationContext';
import {
  useGetConversationWithMessagesQuery,
  useReplyToConversationMutation,
  useReadConversationMutation,
} from '../../src/store';
import UserAvatar from '../../src/components/UserAvatar';
import ConversationSkeleton from '../../src/components/ConversationSkeleton';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

function MessageBody({ body, isOutbound, isDark, onNavigate }: { body: string; isOutbound: boolean; isDark: boolean; onNavigate: (path: string) => void }) {
  const textColor = isOutbound ? '#fff' : (isDark ? '#fff' : '#111827');
  const linkColor = isOutbound ? '#bfdbfe' : '#3b82f6';

  // Photo Access Request
  if (body.includes('Photo Access Request:')) {
    const id = body.split('Photo Access Request:')[1]?.trim();
    if (id && UUID_REGEX.test(id)) {
      return (
        <Text style={[styles.messageText, { color: textColor }]}>
          Photo Access Request:{' '}
          <Text
            style={{ color: linkColor, textDecorationLine: 'underline' }}
            onPress={() => onNavigate(`/access/${id}`)}
          >
            View Request
          </Text>
        </Text>
      );
    }
  }

  // Surf Media Access Granted
  if (body.includes('Surf Media Access Granted:')) {
    const id = body.split('Surf Media Access Granted:')[1]?.trim();
    if (id && UUID_REGEX.test(id)) {
      return (
        <Text style={[styles.messageText, { color: textColor }]}>
          Photos Granted!{' '}
          <Text
            style={{ color: linkColor, textDecorationLine: 'underline' }}
            onPress={() => onNavigate(`/access/${id}`)}
          >
            View Photos
          </Text>
        </Text>
      );
    }
  }

  // URL detection
  if (URL_REGEX.test(body)) {
    const parts = body.split(URL_REGEX);
    return (
      <Text style={[styles.messageText, { color: textColor }]}>
        {parts.map((part, i) => {
          if (part.match(URL_REGEX)) {
            return (
              <Text
                key={i}
                style={{ color: linkColor, textDecorationLine: 'underline' }}
                onPress={() => Linking.openURL(part)}
              >
                {part}
              </Text>
            );
          }
          return <Text key={i}>{part}</Text>;
        })}
      </Text>
    );
  }

  return (
    <Text style={[styles.messageText, { color: textColor }]}>
      {body}
    </Text>
  );
}

const formatMessageTime = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatDateSeparator = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getDateKey = (dateStr: string) => new Date(dateStr).toDateString();

export default function ConversationDetailScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const smartBack = useSmartBack();
  const trackedPush = useTrackedPush();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const flatListRef = useRef<FlatList>(null);

  const [message, setMessage] = useState('');

  const { data, isLoading } = useGetConversationWithMessagesQuery(
    { conversationId: conversationId ?? '' },
    { skip: !conversationId }
  );

  const [replyToConversation, { isLoading: sending }] = useReplyToConversationMutation();
  const [readConversation] = useReadConversationMutation();

  const conversation = data?.results?.conversation;
  const messages = data?.results?.messages ?? [];

  // Determine other participant
  const otherUser = user?.id === conversation?.participant_one?.id
    ? conversation?.participant_two
    : conversation?.participant_one;

  const isOtherUserDeleted = !!otherUser?.deleted_at;

  // Auto-scroll to bottom when messages load
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (messages.length > 0 && !hasScrolledRef.current) {
      hasScrolledRef.current = true;
      const attempts = [100, 300, 600];
      attempts.forEach((ms) => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), ms);
      });
    }
  }, [messages.length]);

  // Mark as read on load
  useEffect(() => {
    if (!conversationId || !user?.id || !conversation) return;
    const unread = user.id === conversation.participant_one?.id
      ? conversation.participant_one_unread_count
      : conversation.participant_two_unread_count;
    if (unread > 0) {
      readConversation({ conversationId });
    }
  }, [conversationId, conversation, user?.id]);

  // Find last seen outbound message
  const lastSeenOutboundId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const isMine = user?.id ? messages[i].sender_id === user.id : messages[i].sender_id !== otherUser?.id;
      if (isMine && messages[i].read_at) {
        return messages[i].id;
      }
    }
    return null;
  })();

  // Build display items with date separators
  const displayItems = (() => {
    const items: any[] = [];
    let lastDateKey = '';
    for (const msg of messages) {
      const dateKey = getDateKey(msg.created_at);
      if (dateKey !== lastDateKey) {
        items.push({ type: 'date', key: `date-${dateKey}`, date: msg.created_at });
        lastDateKey = dateKey;
      }
      items.push({ type: 'message', key: msg.id, ...msg });
    }
    return items;
  })();

  const handleSend = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || !conversationId) return;
    setMessage('');
    await replyToConversation({ conversationId, message: trimmed });
    // Scroll after send — multiple attempts to catch the data refetch
    [300, 600, 1000].forEach((ms) => {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), ms);
    });
  }, [message, conversationId, replyToConversation]);

  const renderItem = ({ item }: { item: any }) => {
    if (item.type === 'date') {
      return (
        <View style={styles.dateSeparator}>
          <Text style={[styles.dateSeparatorText, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6', color: isDark ? '#6b7280' : '#9ca3af' }]}>
            {formatDateSeparator(item.date)}
          </Text>
        </View>
      );
    }

    const isOutbound = user?.id ? item.sender_id === user.id : item.sender_id !== otherUser?.id;
    const isSeen = item.id === lastSeenOutboundId;
    const time = formatMessageTime(item.created_at);

    return (
      <View style={[styles.messageBubbleWrap, isOutbound ? styles.outbound : styles.inbound]}>
        <Text style={[styles.messageTime, { color: isDark ? '#6b7280' : '#9ca3af' }]}>{time}</Text>
        <View style={[
          styles.messageBubble,
          isOutbound
            ? { backgroundColor: '#3b82f6', borderBottomRightRadius: 4 }
            : { backgroundColor: isDark ? '#1f2937' : '#f3f4f6', borderTopLeftRadius: 4 },
        ]}>
          <MessageBody body={item.body} isOutbound={isOutbound} isDark={isDark} onNavigate={trackedPush} />
        </View>
        {isSeen && (
          <Text style={[styles.seenText, { color: isDark ? '#6b7280' : '#9ca3af' }]}>Seen</Text>
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#fff' }]}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {isLoading ? (
            <ConversationSkeleton topPadding={insets.top + 70} />
          ) : (
            <FlatList
              ref={flatListRef}
              data={displayItems}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              contentContainerStyle={[styles.messagesList, { paddingTop: insets.top + 70 }]}
              showsVerticalScrollIndicator={false}
              inverted={false}
            />
          )}

          {/* Floating header — iMessage style with blur */}
          <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={[styles.floatingHeader, { paddingTop: insets.top }]}>
            <Pressable onPress={smartBack} hitSlop={8} style={[styles.headerPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)' }]}>
              <Ionicons name="chevron-back" size={20} color="#007AFF" />
            </Pressable>
            {otherUser ? (
              <View style={styles.headerCenter}>
                <UserAvatar
                  uri={isOtherUserDeleted ? undefined : otherUser.picture}
                  name={isOtherUserDeleted ? 'Deleted User' : (otherUser.name ?? otherUser.handle)}
                  size={36}
                  verified={isOtherUserDeleted ? false : otherUser.verified}
                />
                <Pressable
                  onPress={isOtherUserDeleted ? undefined : () => trackedPush(`/user/${otherUser.handle}` as any)}
                  disabled={isOtherUserDeleted}
                  style={[styles.headerNamePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)' }]}
                >
                  <Text style={[styles.headerHandle, { color: isOtherUserDeleted ? (isDark ? '#6b7280' : '#9ca3af') : (isDark ? '#fff' : '#111827') }]} numberOfLines={1}>
                    {isOtherUserDeleted ? 'Deleted User' : (otherUser.name ?? otherUser.handle)}
                  </Text>
                  {!isOtherUserDeleted && <Ionicons name="chevron-forward" size={12} color={isDark ? '#6b7280' : '#9ca3af'} />}
                </Pressable>
              </View>
            ) : (
              // Keeps BlurView at full height so the bottom-anchored back button stays on-screen.
              <View style={styles.headerCenter}>
                <View style={[styles.headerAvatarPlaceholder, { backgroundColor: isDark ? '#1f2937' : '#e5e7eb' }]} />
                <View style={[styles.headerNamePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)' }]}>
                  <View style={[styles.headerNamePlaceholder, { backgroundColor: isDark ? '#374151' : '#d1d5db' }]} />
                </View>
              </View>
            )}
          </BlurView>
          {/* Soft fade below header */}
          <View style={[styles.headerFade, { top: insets.top + 68 }]} pointerEvents="none">
            <View style={{ height: 6, backgroundColor: isDark ? 'rgba(3,7,18,0.4)' : 'rgba(255,255,255,0.5)' }} />
            <View style={{ height: 6, backgroundColor: isDark ? 'rgba(3,7,18,0.2)' : 'rgba(255,255,255,0.3)' }} />
            <View style={{ height: 6, backgroundColor: isDark ? 'rgba(3,7,18,0.05)' : 'rgba(255,255,255,0.1)' }} />
          </View>

          {/* Composer */}
          <View style={[styles.composer, { borderTopColor: isDark ? '#1f2937' : '#e5e7eb', backgroundColor: isDark ? '#000000' : '#fff', paddingBottom: Math.max(insets.bottom, 8) }]}>
            {isOtherUserDeleted ? (
              <View style={[styles.inputWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6', justifyContent: 'center', paddingVertical: 12 }]}>
                <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', fontSize: 14, textAlign: 'center' }}>
                  This user's account has been deleted
                </Text>
              </View>
            ) : (
              <View style={[styles.inputWrap, { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }]}>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Type a message..."
                  placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                  multiline
                  style={[styles.input, { color: isDark ? '#fff' : '#111827' }]}
                  maxLength={2000}
                />
                <Pressable
                  onPress={handleSend}
                  disabled={!message.trim() || sending}
                  style={[styles.sendBtn, { backgroundColor: message.trim() ? '#3b82f6' : (isDark ? '#374151' : '#d1d5db') }]}
                >
                  <Ionicons name="send" size={16} color="#fff" />
                </Pressable>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  headerPill: {
    position: 'absolute',
    left: 12,
    bottom: 28,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { alignItems: 'center', gap: 4 },
  headerNamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
  },
  headerHandle: { fontSize: 13, fontWeight: '600' },
  headerAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18 },
  headerNamePlaceholder: { width: 70, height: 10, borderRadius: 4 },
  messagesList: { padding: 16, paddingBottom: 8 },
  dateSeparator: { alignItems: 'center', paddingVertical: 12 },
  dateSeparatorText: { fontSize: 12, fontWeight: '500', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  messageBubbleWrap: { marginBottom: 8, maxWidth: '80%' },
  outbound: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  inbound: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  messageTime: { fontSize: 11, marginBottom: 2 },
  messageBubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  messageText: { fontSize: 15, lineHeight: 20 },
  seenText: { fontSize: 11, marginTop: 2 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 34 },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 22, paddingHorizontal: 12, paddingVertical: 6 },
  input: { flex: 1, fontSize: 16, maxHeight: 100, paddingVertical: 8 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
});
