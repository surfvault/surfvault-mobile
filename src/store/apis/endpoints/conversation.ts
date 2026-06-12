import { ApiTag, rootApi } from '../rootApi';

const conversationApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    // The conversation LIST + unread badge share the 'LIST' id so a new message
    // refetches them without touching every open thread. Each thread is tagged
    // by its own conversationId so realtime/mutations invalidate ONLY the
    // affected thread (see usePusher).
    getConversations: builder.query({
      providesTags: [{ type: ApiTag.Conversation, id: 'LIST' }],
      query: ({ limit }: { limit?: number } = {}) => ({
        url: `/conversations${limit ? `?limit=${limit}` : ''}`,
        method: 'GET',
      }),
    }),
    getUnreadMessageCount: builder.query({
      providesTags: [{ type: ApiTag.Conversation, id: 'LIST' }],
      query: () => ({
        url: '/conversations-unread',
        method: 'GET',
      }),
    }),
    startConversationWithUser: builder.mutation({
      invalidatesTags: [{ type: ApiTag.Conversation, id: 'LIST' }, ApiTag.User],
      query: ({ userId, message }: { userId: string; message: string }) => ({
        url: '/conversation/0/start',
        method: 'POST',
        body: { message, userId },
      }),
    }),
    getConversationWithMessages: builder.query({
      providesTags: (_result, _error, arg) => [{ type: ApiTag.Conversation, id: arg.conversationId }],
      query: ({ conversationId, limit }: { conversationId: string; limit?: number }) => ({
        url: `/conversation/${conversationId}${limit ? `?limit=${limit}` : ''}`,
        method: 'GET',
      }),
    }),
    replyToConversation: builder.mutation({
      invalidatesTags: (_result, _error, arg) => [
        { type: ApiTag.Conversation, id: arg.conversationId },
        { type: ApiTag.Conversation, id: 'LIST' },
      ],
      query: ({ conversationId, message }: { conversationId: string; message: string }) => ({
        url: `/conversation/${conversationId}/reply`,
        method: 'POST',
        body: { message },
      }),
    }),
    readConversation: builder.mutation({
      invalidatesTags: (_result, _error, arg) => [
        { type: ApiTag.Conversation, id: arg.conversationId },
        { type: ApiTag.Conversation, id: 'LIST' },
      ],
      query: ({ conversationId }: { conversationId: string }) => ({
        url: `/conversation/${conversationId}/read`,
        method: 'POST',
      }),
    }),
    reportMessage: builder.mutation<
      { message: string },
      { messageId: string; reason: string; details?: string }
    >({
      query: ({ messageId, reason, details }) => ({
        url: `/message/${messageId}/report`,
        method: 'POST',
        body: { reason, details: details ?? '' },
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetConversationsQuery,
  useGetUnreadMessageCountQuery,
  useStartConversationWithUserMutation,
  useGetConversationWithMessagesQuery,
  useReplyToConversationMutation,
  useReadConversationMutation,
  useReportMessageMutation,
} = conversationApi;

export { conversationApi };
