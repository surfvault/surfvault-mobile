import { ApiTag, rootApi } from '../rootApi';
// LinkedAccount tag covers the per-user list of linked sibling profiles.

const userApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getSelf: builder.query({
      providesTags: [ApiTag.User],
      query: () => ({
        url: '/user/self',
        method: 'GET',
      }),
    }),
    getUser: builder.query({
      providesTags: [ApiTag.User, ApiTag.Follow],
      query: ({ handle, viewerId }: { handle: string; viewerId?: string }) => ({
        url: `/user/${handle}?viewerId=${viewerId ?? ''}`,
        method: 'GET',
      }),
    }),
    getUserSessions: builder.query({
      providesTags: [ApiTag.Session],
      query: ({
        handle,
        selfFlag,
        limit,
        continuationToken,
        tagged,
      }: {
        handle: string;
        selfFlag: boolean;
        limit?: number;
        continuationToken?: string;
        tagged?: boolean;
      }) => ({
        url: `/user/${handle}/sessions?self=${selfFlag}&limit=${limit ?? 10}&continuationToken=${continuationToken ?? ''}${tagged ? '&tagged=true' : ''}`,
        method: 'GET',
      }),
    }),
    doesHandleExist: builder.query({
      providesTags: [ApiTag.User],
      query: ({ handle }: { handle: string }) => ({
        url: `/user/handle/${handle}`,
        method: 'GET',
      }),
    }),
    updateUserHandle: builder.mutation({
      invalidatesTags: [ApiTag.User],
      query: ({ handle }: { handle: string }) => ({
        url: '/user/onboard-handle',
        method: 'PATCH',
        body: { handle },
      }),
    }),
    updateUserType: builder.mutation({
      invalidatesTags: [ApiTag.User],
      query: ({ type, isPublic }: { type: string; isPublic: boolean }) => ({
        url: '/user/onboard-type',
        method: 'PATCH',
        body: { type, isPublic },
      }),
    }),
    getUserFavorites: builder.query({
      providesTags: [ApiTag.Favorite],
      query: () => ({
        url: '/user/favorites',
        method: 'GET',
      }),
    }),
    updateUserFavorites: builder.mutation({
      invalidatesTags: [ApiTag.Favorite, ApiTag.SurfBreak, ApiTag.Map],
      query: ({
        surfBreakId,
        action,
        newIndex,
      }: {
        surfBreakId: string;
        action: string;
        newIndex?: number;
      }) => ({
        url: `/user/${action}`,
        method: 'PATCH',
        body: { surfBreakId, newIndex },
      }),
    }),
    updateUserMetaData: builder.mutation({
      invalidatesTags: [ApiTag.User, ApiTag.Map],
      query: ({ metaData }: { metaData: Record<string, unknown> }) => ({
        url: '/user/meta',
        method: 'PATCH',
        body: metaData,
      }),
    }),
    updateUserPushToken: builder.mutation({
      query: ({ expoPushToken }: { expoPushToken: string }) => ({
        url: '/user/push-token',
        method: 'PATCH',
        body: { expoPushToken },
      }),
    }),
    clearUserPushToken: builder.mutation({
      query: () => ({
        url: '/user/clear-push-token',
        method: 'PATCH',
      }),
    }),
    // Multi-account-aware device registration. Replaces updateUserPushToken
    // for new builds; the legacy mutation is kept above so older OTA-loaded
    // bundles still work during the rollout window.
    registerDevice: builder.mutation({
      query: ({
        deviceId,
        expoPushToken,
        platform,
      }: {
        deviceId: string;
        expoPushToken: string;
        platform: 'ios' | 'android';
      }) => ({
        url: '/user/register-device',
        method: 'PATCH',
        body: { deviceId, expoPushToken, platform },
      }),
    }),
    unregisterDevice: builder.mutation({
      query: ({ deviceId }: { deviceId: string }) => ({
        url: '/user/unregister-device',
        method: 'PATCH',
        body: { deviceId },
      }),
    }),
    getLinkedAccounts: builder.query({
      providesTags: [ApiTag.LinkedAccount],
      query: () => ({
        url: '/user/linked-accounts',
        method: 'GET',
      }),
    }),
    linkAccount: builder.mutation({
      invalidatesTags: [ApiTag.LinkedAccount],
      // The bearer token MUST be the newly-authenticated account's token —
      // the API uses that to identify the new side, and `previousUserId` is
      // the side already in the user's switcher. Caller temporarily swaps
      // the auth_token before firing this mutation.
      query: ({ previousUserId }: { previousUserId: string }) => ({
        url: '/user/linked-accounts',
        method: 'POST',
        body: { previousUserId },
      }),
    }),
    unlinkAccount: builder.mutation({
      invalidatesTags: [ApiTag.LinkedAccount],
      query: ({ linkedUserId }: { linkedUserId: string }) => ({
        url: `/user/linked-accounts/${linkedUserId}`,
        method: 'DELETE',
      }),
    }),
    updateUserRecentSearches: builder.mutation({
      invalidatesTags: [ApiTag.User],
      query: ({ payload }: { payload: Record<string, unknown> }) => ({
        url: '/user/recents',
        method: 'PATCH',
        body: payload,
      }),
    }),
    getUserFollowing: builder.query({
      providesTags: [ApiTag.Follow],
      query: ({
        handle,
        filter,
        search,
        limit,
        continuationToken,
      }: {
        handle: string;
        filter: string;
        search: string;
        limit?: number;
        continuationToken?: string;
      }) => ({
        url: `/user/${handle}/follow-stats?filter=${filter}&search=${search}&limit=${limit ?? 10}&continuationToken=${continuationToken ?? ''}`,
        method: 'GET',
      }),
    }),
    followUser: builder.mutation({
      invalidatesTags: [ApiTag.Follow, ApiTag.SurfBreak],
      query: ({ userId, action }: { userId: string; action: string }) => ({
        url: `/user/${action}`,
        method: 'PATCH',
        body: { userId },
      }),
    }),
    getPhotographers: builder.query({
      providesTags: [ApiTag.User],
      query: ({ continent }: { continent: string }) => ({
        url: `/photographers?continent=${continent}`,
        method: 'GET',
      }),
    }),
    getPhotographersAtBreak: builder.query({
      providesTags: [ApiTag.User],
      query: ({ breakId }: { breakId: string }) => ({
        url: `/surf-breaks/${breakId}/photographers`,
        method: 'GET',
      }),
    }),
    getPopularTags: builder.query({
      providesTags: [ApiTag.User],
      query: () => ({
        url: '/user/tags/popular',
        method: 'GET',
      }),
    }),
    getAccessRequest: builder.query({
      providesTags: [ApiTag.User],
      query: ({ photographerHandle }: { photographerHandle: string }) => ({
        url: `/user/access/${photographerHandle}`,
        method: 'GET',
      }),
    }),
    requestAccessToUser: builder.mutation({
      invalidatesTags: [ApiTag.User],
      query: ({ photographerHandle }: { photographerHandle: string }) => ({
        url: '/user/access',
        method: 'POST',
        body: { photographerHandle },
      }),
    }),
    updateAccessRequest: builder.mutation({
      invalidatesTags: [ApiTag.User, ApiTag.Notification],
      query: ({
        requestId,
        action,
        accessLength,
      }: {
        requestId: string;
        action: string;
        accessLength?: string;
      }) => ({
        url: `/user/access/${requestId}`,
        method: 'PATCH',
        body: { action, accessLength },
      }),
    }),
    requestAccountDeletion: builder.mutation({
      invalidatesTags: [ApiTag.User],
      query: () => ({
        url: '/user/request-deletion',
        method: 'PATCH',
      }),
    }),
    cancelAccountDeletion: builder.mutation({
      invalidatesTags: [ApiTag.User],
      query: () => ({
        url: '/user/cancel-deletion',
        method: 'PATCH',
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetSelfQuery,
  useGetUserQuery,
  useUpdateUserHandleMutation,
  useUpdateUserMetaDataMutation,
  useUpdateUserPushTokenMutation,
  useClearUserPushTokenMutation,
  useFollowUserMutation,
  useUpdateUserFavoritesMutation,
  useGetPhotographersQuery,
  useGetPhotographersAtBreakQuery,
  useGetPopularTagsQuery,
  useRequestAccessToUserMutation,
  useGetAccessRequestQuery,
  useUpdateAccessRequestMutation,
  useDoesHandleExistQuery,
  useUpdateUserTypeMutation,
  useGetUserFavoritesQuery,
  useGetUserFollowingQuery,
  useGetUserSessionsQuery,
  useUpdateUserRecentSearchesMutation,
  useRequestAccountDeletionMutation,
  useCancelAccountDeletionMutation,
  useRegisterDeviceMutation,
  useUnregisterDeviceMutation,
  useGetLinkedAccountsQuery,
  useLinkAccountMutation,
  useUnlinkAccountMutation,
} = userApi;

export { userApi };
