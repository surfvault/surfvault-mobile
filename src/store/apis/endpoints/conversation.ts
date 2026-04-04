import { ApiTag, rootApi } from '../rootApi';

const conversationApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getConversations: builder.query({
      providesTags: [ApiTag.Conversation],
      query: () => ({
        url: '/conversations',
        method: 'GET',
      }),
    }),
    getUnreadMessageCount: builder.query({
      providesTags: [ApiTag.Conversation],
      query: () => ({
        url: '/conversations-unread',
        method: 'GET',
      }),
    }),
    startConversationWithUser: builder.mutation({
      invalidatesTags: [ApiTag.Conversation, ApiTag.User],
      query: ({ userId, message }: { userId: string; message: string }) => ({
        url: '/conversation/0/start',
        method: 'POST',
        body: { message, userId },
      }),
    }),
    getConversationWithMessages: builder.query({
      providesTags: [ApiTag.Conversation],
      query: ({ conversationId }: { conversationId: string }) => ({
        url: `/conversation/${conversationId}`,
        method: 'GET',
      }),
    }),
    replyToConversation: builder.mutation({
      invalidatesTags: [ApiTag.Conversation],
      query: ({ conversationId, message }: { conversationId: string; message: string }) => ({
        url: `/conversation/${conversationId}/reply`,
        method: 'POST',
        body: { message },
      }),
    }),
    readConversation: builder.mutation({
      invalidatesTags: [ApiTag.Conversation],
      query: ({ conversationId }: { conversationId: string }) => ({
        url: `/conversation/${conversationId}/read`,
        method: 'POST',
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
} = conversationApi;

export { conversationApi };
