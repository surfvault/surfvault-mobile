import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Linking } from 'react-native';
import { useUser } from '../../src/context/UserProvider';
import {
  useGetConversationWithMessagesQuery,
  useReplyToConversationMutation,
  useReadConversationMutation,
} from '../../src/store';
import UserAvatar from '../../src/components/UserAvatar';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

function MessageBody({ body, isOutbound, isDark, router }: { body: string; isOutbound: boolean; isDark: boolean; router: any }) {
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
            onPress={() => router.push(`/access/${id}` as any)}
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
            onPress={() => router.push(`/access/${id}` as any)}
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
  const { conversationId, from } = useLocalSearchParams<{ conversationId: string; from?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
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
          <MessageBody body={item.body} isOutbound={isOutbound} isDark={isDark} router={router} />
        </View>
        {isSeen && (
          <Text style={[styles.seenText, { color: isDark ? '#6b7280' : '#9ca3af' }]}>Seen</Text>
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: '',
          headerStyle: { backgroundColor: isDark ? '#030712' : '#ffffff' },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => {
              if (from === 'messages') {
                router.replace('/(tabs)/messages' as any);
              } else {
                router.back();
              }
            }} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color="#007AFF" />
            </Pressable>
          ),
          headerTitle: () => otherUser ? (
            <Pressable onPress={() => router.push(`/user/${otherUser.handle}` as any)} style={styles.headerCenter}>
              <UserAvatar uri={otherUser.picture} name={otherUser.name ?? otherUser.handle} size={44} verified={otherUser.verified} />
              <Text style={[styles.headerHandle, { color: isDark ? '#fff' : '#111827' }]} numberOfLines={1}>
                {otherUser.handle}
              </Text>
            </Pressable>
          ) : (
            <ActivityIndicator size="small" />
          ),
          headerTitleAlign: 'center',
        }}
      />
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#030712' : '#fff' }]} edges={[]}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {isLoading ? (
            <View style={styles.loadingWrap}><ActivityIndicator size="large" /></View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={displayItems}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              inverted={false}
            />
          )}

          {/* Composer */}
          <View style={[styles.composer, { borderTopColor: isDark ? '#1f2937' : '#e5e7eb', backgroundColor: isDark ? '#030712' : '#fff' }]}>
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
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center', gap: 2 },
  headerHandle: { fontSize: 14, fontWeight: '600' },
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
