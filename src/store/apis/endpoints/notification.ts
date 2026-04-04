import { ApiTag, rootApi } from '../rootApi';

const notificationApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getNotifications: builder.query({
      providesTags: [ApiTag.Notification],
      query: ({
        read,
        filter,
        limit,
        continuationToken,
      }: {
        read: boolean;
        filter: string;
        limit: number;
        continuationToken?: string;
      }) => ({
        url: `/notifications?read=${read}&filter=${filter}&limit=${limit}&continuationToken=${continuationToken ?? ''}`,
        method: 'GET',
      }),
    }),
    markNotificationsAsRead: builder.mutation({
      invalidatesTags: [ApiTag.Notification],
      query: ({ notificationIds }: { notificationIds: string[] }) => ({
        url: '/notifications/mark-as-read',
        method: 'PATCH',
        body: { notificationIds },
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationsAsReadMutation,
} = notificationApi;

export { notificationApi };
