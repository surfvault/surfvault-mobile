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
    // Public — drives the launch-time force-update gate. A fresh fetch each
    // cold start is plenty (config rarely changes).
    getAppVersion: builder.query<
      { ios: { minVersion: string | null }; android: { minVersion: string | null } },
      void
    >({
      query: () => ({ url: '/app-version', method: 'GET' }),
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
        surfBreakId,
      }: {
        handle: string;
        selfFlag: boolean;
        limit?: number;
        continuationToken?: string;
        tagged?: boolean;
        surfBreakId?: string;
      }) => ({
        url: `/user/${handle}/sessions?self=${selfFlag}&limit=${limit ?? 10}&continuationToken=${continuationToken ?? ''}${tagged ? '&tagged=true' : ''}${surfBreakId ? `&surfBreakId=${surfBreakId}` : ''}`,
        method: 'GET',
      }),
    }),
    getUserSessionBreaks: builder.query({
      providesTags: [ApiTag.Session],
      query: ({
        handle,
        selfFlag,
      }: {
        handle: string;
        selfFlag: boolean;
      }) => ({
        url: `/user/${handle}/session-breaks?self=${selfFlag}`,
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
      // viewerId required for server-side block filtering — endpoint has no
      // authorizer. Anonymous callers pass empty.
      query: ({ continent, viewerId }: { continent: string; viewerId?: string }) => ({
        url: `/photographers?continent=${continent}&viewerId=${viewerId ?? ''}`,
        method: 'GET',
      }),
    }),
    // Combined "locals" feed — photographers AND shapers whose home break is
    // within radiusKm of this break, interleaved + relevance-sorted server-side.
    getLocalsAtBreak: builder.query({
      providesTags: [ApiTag.User],
      query: ({ breakId, viewerId, radiusKm }: { breakId: string; viewerId?: string; radiusKm?: number }) => ({
        url: `/surf-breaks/${breakId}/locals?viewerId=${viewerId ?? ''}${radiusKm != null ? `&radiusKm=${radiusKm}` : ''}`,
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
    updateUserEmail: builder.mutation<{ success: boolean; pendingEmail?: string; unchanged?: boolean }, { email: string }>({
      invalidatesTags: [ApiTag.User],
      query: ({ email }) => ({
        url: '/user/update-email',
        method: 'PATCH',
        body: { email },
      }),
    }),
    cancelEmailChange: builder.mutation<{ success: boolean }, void>({
      invalidatesTags: [ApiTag.User],
      query: () => ({
        url: '/user/cancel-email-change',
        method: 'PATCH',
      }),
    }),
    resendEmailChange: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        url: '/user/resend-email-change',
        method: 'PATCH',
      }),
    }),
    // Block / unblock. The mutations invalidate caches that surface user
    // content so feeds, follow lists, conversations, and search re-fetch with
    // the blocked user filtered out (server-side).
    blockUser: builder.mutation<{ message?: string }, { userId: string }>({
      invalidatesTags: [
        ApiTag.Block,
        ApiTag.User,
        ApiTag.Follow,
        ApiTag.Conversation,
        ApiTag.Map,
        ApiTag.Session,
        ApiTag.SurfBreak,
      ],
      query: ({ userId }) => ({
        url: '/user/block',
        method: 'PATCH',
        body: { userId },
      }),
    }),
    unblockUser: builder.mutation<{ message?: string }, { userId: string }>({
      invalidatesTags: [
        ApiTag.Block,
        ApiTag.User,
        ApiTag.Follow,
        ApiTag.Conversation,
        ApiTag.Map,
        ApiTag.Session,
        ApiTag.SurfBreak,
      ],
      query: ({ userId }) => ({
        url: '/user/unblock',
        method: 'PATCH',
        body: { userId },
      }),
    }),
    getUserBlocks: builder.query<
      { message: string; results: { blockedUsers: Array<{ id: string; handle: string; name: string; picture: string | null; user_type: string | null; created_at: string }> } },
      void
    >({
      providesTags: [ApiTag.Block],
      query: () => ({
        url: '/user/blocks',
        method: 'GET',
      }),
    }),
    reportUser: builder.mutation<
      { message: string },
      { userId: string; reason: string; details?: string; alsoBlock?: boolean }
    >({
      invalidatesTags: (_r, _e, arg) =>
        arg.alsoBlock
          ? [ApiTag.Block, ApiTag.User, ApiTag.Follow, ApiTag.Conversation, ApiTag.Map, ApiTag.Session, ApiTag.SurfBreak]
          : [],
      query: ({ userId, reason, details, alsoBlock }) => ({
        url: `/user/${userId}/report`,
        method: 'POST',
        body: { reason, details, alsoBlock },
      }),
    }),
    // Self-service ad-partner upsert for advertisers. Hits the `updateUser`
    // action dispatch (PATCH /user/{action}) — UPSERTs the satellite
    // ad_partners row keyed by advertiser_user_id (caller derived from JWT).
    updateMyAdPartner: builder.mutation<
      any,
      {
        company_name?: string;
        contact_name?: string | null;
        phone_number?: string | null;
        coordinates?: { lat?: number; lon?: number } | null;
        target_radius_km?: number;
        logo_url?: string | null;
      }
    >({
      invalidatesTags: [ApiTag.User],
      query: (payload) => ({
        url: '/user/ad-partner',
        method: 'PATCH',
        body: payload,
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
  useGetLocalsAtBreakQuery,
  useGetPopularTagsQuery,
  useRequestAccessToUserMutation,
  useGetAccessRequestQuery,
  useUpdateAccessRequestMutation,
  useDoesHandleExistQuery,
  useUpdateUserTypeMutation,
  useGetUserFavoritesQuery,
  useGetUserFollowingQuery,
  useGetUserSessionsQuery,
  useGetUserSessionBreaksQuery,
  useUpdateUserRecentSearchesMutation,
  useRequestAccountDeletionMutation,
  useCancelAccountDeletionMutation,
  useUpdateUserEmailMutation,
  useCancelEmailChangeMutation,
  useResendEmailChangeMutation,
  useRegisterDeviceMutation,
  useUnregisterDeviceMutation,
  useGetLinkedAccountsQuery,
  useLinkAccountMutation,
  useUnlinkAccountMutation,
  useBlockUserMutation,
  useUnblockUserMutation,
  useGetUserBlocksQuery,
  useReportUserMutation,
  useUpdateMyAdPartnerMutation,
  useGetAppVersionQuery,
} = userApi;

export { userApi };
