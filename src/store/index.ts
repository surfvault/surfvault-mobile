import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { rootApi } from './apis/rootApi';
import { reducer as locationReducer } from './slices/location';
import { reducer as surfReducer } from './slices/surf';

export const store = configureStore({
  reducer: {
    location: locationReducer,
    surf: surfReducer,
    [rootApi.reducerPath]: rootApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(rootApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Re-export all hooks from endpoints
export {
  useGetConversationsQuery,
  useGetConversationWithMessagesQuery,
  useGetUnreadMessageCountQuery,
  useReadConversationMutation,
  useReplyToConversationMutation,
  useStartConversationWithUserMutation,
} from './apis/endpoints/conversation';

export { useGetCountriesQuery } from './apis/endpoints/country';

export {
  useGetBoardroomShapersQuery,
  useGetBoardroomShaperQuery,
} from './apis/endpoints/boardroom';
export type {
  BoardroomShaper,
  BoardroomShaperDetail,
  BoardroomAd,
} from './apis/endpoints/boardroom';

export {
  useGetMapSearchContentQuery,
  useGetMapSurfBreaksQuery,
  useGetNearbyPhotographersQuery,
  useGetNearbySurfBreaksQuery,
} from './apis/endpoints/map';

export {
  useCancelSurfMediaUploadMutation,
  useCompleteSurfMediaUploadMutation,
  useDeleteSurfMediaMutation,
  useDownloadSurfMediaAccessRequestPhotosMutation,
  useDownloadSurfMediaMutation,
  useFinalizeSurfMediaMutation,
  useGetSurfMediaAccessRequestQuery,
  useGetSurfMediaForMonthQuery,
  useGrantSurfMediaAccessMutation,
  useRequestAccessToSurfMediaMutation,
  useSaveSurfMediaAccessRequestToVaultMutation,
  useSaveSurfMediaMutation,
  useLazyGetPhotoDownloadUrlQuery,
} from './apis/endpoints/media';

export {
  useGetNotificationsQuery,
  useMarkNotificationsAsReadMutation,
} from './apis/endpoints/notification';

export {
  useCreateSurfSessionBookingMutation,
  useCreateSurfSessionViewReportMutation,
  useDeleteSurfSessionBookingMutation,
  useGetBookingSearchContentQuery,
  useGetLifetimeVaultStatisticsQuery,
  useGetSurfSessionBookingsQuery,
  useGetSurfSessionUploadsQuery,
  useGetSurfSessionViewsQuery,
} from './apis/endpoints/reports';

export {
  useGetSubscriptionPlansQuery,
  useManageSubscriptionMutation,
} from './apis/endpoints/subscription';

export {
  useCreateSessionGroupMutation,
  useCreateSurfSessionMutation,
  useDeleteSessionGroupMutation,
  useDoesSurfBreakExistQuery,
  useGetAdsQuery,
  useRecordAdImpressionMutation,
  useGetLatestSessionsQuery,
  useGetSessionGroupsQuery,
  useGetSessionPhotosQuery,
  useGetSessionQuery,
  useGetSurfBreakSessionsQuery,
  useGetSurfBreaksQuery,
  useGetSurfBreakWithLatestSessionsQuery,
  useGetUsersForSessionTaggingQuery,
  useUpdateGroupPhotosMutation,
  useUpdateSessionGroupMutation,
  useUpdateSessionMutation,
  useUpdateSessionsTaggedUsersMutation,
  useUpdateSessionThumbnailMutation,
  useDeleteSessionMutation,
  useReportSurfSessionMutation,
} from './apis/endpoints/surf';

export {
  useDoesHandleExistQuery,
  useFollowUserMutation,
  useGetAccessRequestQuery,
  useGetPhotographersQuery,
  useGetPopularTagsQuery,
  useGetSelfQuery,
  useGetUserFavoritesQuery,
  useGetUserFollowingQuery,
  useGetUserQuery,
  useGetUserSessionsQuery,
  useRequestAccessToUserMutation,
  useUpdateAccessRequestMutation,
  useUpdateUserFavoritesMutation,
  useUpdateUserHandleMutation,
  useUpdateUserMetaDataMutation,
  useUpdateUserPushTokenMutation,
  useClearUserPushTokenMutation,
  useUpdateUserRecentSearchesMutation,
  useUpdateUserTypeMutation,
  useRequestAccountDeletionMutation,
  useCancelAccountDeletionMutation,
} from './apis/endpoints/user';

export {
  useCreateAdMediaPresignedUrlsMutation,
  useCreateAdPartnerMutation,
  useCreateSurfBreakMutation,
  useGetAdminAdPartnersQuery,
  useGetAdminBreaksQuery,
  useGetAdminUsersQuery,
  useUpdateAdPartnerMutation,
  useUpsertAdsMutation,
} from './apis/endpoints/admin';
