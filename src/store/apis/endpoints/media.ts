import { ApiTag, rootApi } from '../rootApi';

const mediaApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getSurfMediaForMonth: builder.query({
      providesTags: [ApiTag.Media],
      query: ({
        country,
        region,
        beach,
        startDate,
        endDate,
        photographer,
      }: {
        country: string;
        region: string;
        beach: string;
        startDate: string;
        endDate: string;
        photographer?: string;
      }) => ({
        url: `/media/month?country=${country}&region=${region}&surf_break=${beach}&startDate=${startDate}&endDate=${endDate}&photographer=${photographer ?? ''}`,
        method: 'GET',
      }),
    }),
    saveSurfMedia: builder.mutation({
      invalidatesTags: [ApiTag.Media],
      query: ({
        sessionId,
        mediaFiles,
        totalSizeInGB,
      }: {
        sessionId: string;
        mediaFiles: Array<{ name: string; size: number; type: string; source?: string; sourceId?: string }>;
        totalSizeInGB: number;
      }) => ({
        url: `/media/upload/surf-session/${sessionId}`,
        method: 'POST',
        body: { mediaFiles, totalSizeInGB },
      }),
    }),
    deleteSurfMedia: builder.mutation({
      invalidatesTags: [ApiTag.SurfBreak, ApiTag.User],
      query: ({
        sessionId,
        photos,
      }: {
        sessionId: string;
        photos: Array<{ id: string; s3Key: string }>;
      }) => ({
        url: '/media',
        method: 'DELETE',
        body: { sessionId, photos },
      }),
    }),
    requestAccessToSurfMedia: builder.mutation({
      invalidatesTags: [ApiTag.Conversation, ApiTag.User],
      query: (payload: {
        handle: string;
        photos: string[];
        sessionId: string;
        surfBreakId: string;
      }) => ({
        url: '/media/access',
        method: 'POST',
        body: payload,
      }),
    }),
    getSurfMediaAccessRequest: builder.query({
      providesTags: [ApiTag.AccessRequest],
      query: ({
        requestId,
        limit,
        continuationToken,
      }: {
        requestId: string;
        limit: number;
        continuationToken?: string;
      }) => ({
        url: `/media/access/${requestId}?limit=${limit}&continuationToken=${continuationToken ?? ''}`,
        method: 'GET',
      }),
    }),
    grantSurfMediaAccess: builder.mutation({
      invalidatesTags: [ApiTag.AccessRequest, ApiTag.Conversation],
      query: ({ requestId }: { requestId: string }) => ({
        url: `/media/access/${requestId}/grant`,
        method: 'PATCH',
      }),
    }),
    saveSurfMediaAccessRequestToVault: builder.mutation({
      query: ({ requestId }: { requestId: string }) => ({
        url: `/media/access/${requestId}/save`,
        method: 'PATCH',
      }),
    }),
    downloadSurfMediaAccessRequestPhotos: builder.mutation({
      query: ({ requestId }: { requestId: string }) => ({
        url: `/media/access/${requestId}/download`,
        method: 'GET',
      }),
    }),
    downloadSurfMedia: builder.mutation({
      query: ({ photos }: { photos: string[] }) => ({
        url: '/media/download',
        method: 'POST',
        body: { photos },
      }),
    }),
    getPhotoDownloadUrl: builder.query({
      query: ({ photoId }: { photoId: string }) => ({
        url: `/media/photo/${photoId}/download-url`,
        method: 'GET',
      }),
    }),
    finalizeSurfMedia: builder.mutation({
      invalidatesTags: [ApiTag.Media],
      query: ({
        uploadId,
        uploadFileIds,
      }: {
        uploadId: string;
        uploadFileIds: string[];
      }) => ({
        url: `/media/upload/${uploadId}/finalize`,
        method: 'PATCH',
        body: { uploadFileIds },
      }),
    }),
    cancelSurfMediaUpload: builder.mutation({
      invalidatesTags: [ApiTag.Media],
      query: ({ uploadId }: { uploadId: string }) => ({
        url: `/media/upload/${uploadId}/cancel`,
        method: 'DELETE',
      }),
    }),
    completeSurfMediaUpload: builder.mutation({
      invalidatesTags: [ApiTag.Media, ApiTag.User],
      query: ({ uploadId }: { uploadId: string }) => ({
        url: `/media/upload/${uploadId}/complete`,
        method: 'PATCH',
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useSaveSurfMediaMutation,
  useDeleteSurfMediaMutation,
  useGetSurfMediaForMonthQuery,
  useRequestAccessToSurfMediaMutation,
  useGetSurfMediaAccessRequestQuery,
  useGrantSurfMediaAccessMutation,
  useSaveSurfMediaAccessRequestToVaultMutation,
  useDownloadSurfMediaMutation,
  useFinalizeSurfMediaMutation,
  useCancelSurfMediaUploadMutation,
  useCompleteSurfMediaUploadMutation,
  useDownloadSurfMediaAccessRequestPhotosMutation,
  useLazyGetPhotoDownloadUrlQuery,
} = mediaApi;

export { mediaApi };
