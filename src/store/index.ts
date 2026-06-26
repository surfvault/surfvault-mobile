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

export { rootApi } from './apis/rootApi';
export { ApiTag } from './apis/rootApi';

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
  useGetLatestShapersQuery,
  useGetShapersForSurfBreakQuery,
  useGetShaperBoardsQuery,
  useGetShapersFromFollowingQuery,
  useGetBoardQuery,
  useCreateMyBoardMutation,
  useUpdateMyBoardMutation,
  useDeleteMyBoardMutation,
  useCreateMyBoardPhotosMutation,
  useFinalizeMyBoardPhotosMutation,
  useDeleteMyBoardPhotoMutation,
  useUpdateBoardThumbnailMutation,
  useReportBoardMutation,
} from './apis/endpoints/boardroom';
export type {
  BoardroomShaper,
  Board,
  BoardDetail,
  BoardPhoto,
} from './apis/endpoints/boardroom';

export {
  useGetLatestFilmsQuery,
  useGetFilmsNearQuery,
  useGetFilmsForSurfBreakQuery,
  useGetFilmsFromFollowingQuery,
  useGetFilmsForUserQuery,
  useGetFilmQuery,
  useGetFilmCandidateSessionsQuery,
  useLazyCheckFilmByVideoIdQuery,
  useCreateFilmMutation,
  useUpdateFilmMutation,
  useDeleteFilmMutation,
  useTagFilmParticipantMutation,
  useConfirmFilmParticipantMutation,
  useTagFilmSurfBreakMutation,
  useTagFilmBoardMutation,
  useTagFilmSessionMutation,
  useConfirmFilmSessionMutation,
  useClaimFilmCreatorMutation,
  useVerifyFilmCheckMutation,
  useVerifyFilmApplyMutation,
  useReportFilmMutation,
} from './apis/endpoints/films';
export type {
  Film,
  FilmBreak,
  FilmRegion,
  FilmParticipant,
  FilmBoardTag,
  FilmSessionTag,
  FilmDetailResult,
} from './apis/endpoints/films';

export {
  useGetMapSearchContentQuery,
  useGetMapSurfBreaksQuery,
  useGetMapAdsQuery,
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
  useCreateBoardViewReportMutation,
  useCreateFilmViewReportMutation,
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
  useCreateMyAdMediaPresignedUrlsMutation,
  useCreateMyAdMutation,
  useUpdateMyAdMutation,
  useDeleteMyAdMutation,
  usePauseMyAdMutation,
  useResumeMyAdMutation,
  useGetAdvertiserAdsQuery,
  useGetMyCampaignsQuery,
  useReportAdMutation,
  useGetLatestSessionsQuery,
  useGetExploreFeedQuery,
  useGetExploreSearchQuery,
  useGetSearchSuggestionsQuery,
  useGetProfilePreviewQuery,
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
  useGetLocalsAtBreakQuery,
  useGetPopularTagsQuery,
  useGetSelfQuery,
  useGetUserFavoritesQuery,
  useGetUserFollowingQuery,
  useGetUserQuery,
  useGetUserSessionsQuery,
  useGetUserSessionBreaksQuery,
  useRequestAccessToUserMutation,
  useUpdateAccessRequestMutation,
  useUpdateUserFavoritesMutation,
  useUpdateUserHandleMutation,
  useUpdateUserMetaDataMutation,
  useUpdatePreferencesMutation,
  useUpdateUserPushTokenMutation,
  useClearUserPushTokenMutation,
  useUpdateUserRecentSearchesMutation,
  useUpdateUserTypeMutation,
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
} from './apis/endpoints/user';

export {
  useReportMessageMutation,
} from './apis/endpoints/conversation';

export {
  useCreateAdMediaPresignedUrlsMutation,
  useCreateAdPartnerMutation,
  useCreateSurfBreakMutation,
  useGetAdminAdPartnersQuery,
  useGetAdminBreaksQuery,
  useGetAdminUsersQuery,
  useUpdateAdPartnerMutation,
  useUpsertAdsMutation,
  useGetAdminAdQuery,
  useApproveAdminAdMutation,
  useRejectAdminAdMutation,
} from './apis/endpoints/admin';
