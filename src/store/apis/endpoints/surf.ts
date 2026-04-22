import { ApiTag, rootApi } from '../rootApi';

const surfApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getSurfBreaks: builder.query({
      providesTags: [ApiTag.SurfBreak],
      query: ({
        continent,
        search,
        limit,
        continuationToken,
      }: {
        continent?: string;
        search?: string;
        limit?: number;
        continuationToken?: string;
      }) => ({
        url: `/surf-breaks?continent=${continent ?? ''}&search=${search ?? ''}&limit=${limit ?? ''}&continuationToken=${continuationToken ?? ''}`,
        method: 'GET',
      }),
    }),
    doesSurfBreakExist: builder.query({
      query: ({
        country,
        region,
        surf_break,
      }: {
        country: string;
        region: string;
        surf_break: string;
      }) => ({
        url: `/surf-breaks/${country}/${region}/${surf_break}`,
        method: 'GET',
      }),
    }),
    getUsersForSessionTagging: builder.query({
      providesTags: [ApiTag.Session, ApiTag.User],
      query: ({ search, sessionId }: { search?: string; sessionId: string }) => ({
        url: `/surf-sessions/${sessionId}/user-tagging?search=${search ?? ''}`,
        method: 'GET',
      }),
    }),
    updateSessionsTaggedUsers: builder.mutation({
      invalidatesTags: [ApiTag.SurfBreak, ApiTag.Session, ApiTag.User],
      query: ({
        sessionId,
        action,
        userId,
      }: {
        sessionId: string;
        action: string;
        userId: string;
      }) => ({
        url: `/surf-sessions/${sessionId}/user-tagging`,
        method: 'PATCH',
        body: { userId, action },
      }),
    }),
    getLatestSessions: builder.query({
      providesTags: [ApiTag.SurfBreak],
      query: ({
        userId,
        country,
        region,
        surfBreak,
        date,
        limit,
        continuationToken,
      }: {
        userId?: string;
        country?: string;
        region?: string;
        surfBreak?: string;
        date?: string;
        limit?: number;
        continuationToken?: string;
      }) => ({
        url: `/surf-sessions?limit=${limit ?? ''}&viewerId=${userId ?? ''}&country=${country ?? ''}&region=${region ?? ''}&surfBreak=${surfBreak ?? ''}&date=${date ?? ''}&continuationToken=${continuationToken ?? ''}`,
        method: 'GET',
      }),
    }),
    getSurfBreakWithLatestSessions: builder.query({
      providesTags: [ApiTag.SurfBreak],
      query: ({
        userId,
        country,
        region,
        surfBreak,
        date,
      }: {
        userId?: string;
        country: string;
        region?: string;
        surfBreak: string;
        date?: string;
      }) => ({
        url: `/surf-sessions/${country}/${region ?? '0'}/${surfBreak}?viewerId=${userId ?? ''}&date=${date ?? ''}`,
        method: 'GET',
      }),
    }),
    getSurfBreakSessions: builder.query({
      providesTags: [],
      query: ({
        surfBreakId,
        limit,
        continuationToken,
      }: {
        surfBreakId: string;
        limit?: number;
        continuationToken?: string;
      }) => ({
        url: `/surf-session/${surfBreakId}/posts?limit=${limit ?? ''}&continuationToken=${continuationToken ?? ''}`,
        method: 'GET',
      }),
    }),
    getSession: builder.query({
      providesTags: [ApiTag.SurfBreak],
      query: ({
        userId,
        handle,
        country,
        region,
        surfBreak,
        date,
        limit,
        continuationToken,
        sessionId,
      }: {
        userId?: string;
        handle?: string;
        country?: string;
        region?: string;
        surfBreak?: string;
        date?: string;
        limit?: number;
        continuationToken?: string;
        sessionId?: string;
      }) => ({
        url: `/surf-session?limit=${limit ?? ''}&viewerId=${userId ?? ''}&handle=${handle ?? ''}&country=${country ?? ''}&region=${region ?? ''}&surfBreak=${surfBreak ?? ''}&date=${date ?? ''}&continuationToken=${continuationToken ?? ''}&sessionId=${sessionId ?? ''}`,
        method: 'GET',
      }),
    }),
    getSessionPhotos: builder.query({
      providesTags: [ApiTag.Media],
      query: ({
        sessionId,
        limit,
        continuationToken,
        groupId,
        viewerId,
      }: {
        sessionId: string;
        limit?: number;
        continuationToken?: string;
        groupId?: string;
        viewerId?: string;
      }) => ({
        url: `/surf-session/${sessionId}/photos?limit=${limit ?? ''}&continuationToken=${continuationToken ?? ''}&groupId=${groupId ?? ''}&viewerId=${viewerId ?? ''}`,
        method: 'GET',
      }),
    }),
    getSessionGroups: builder.query({
      providesTags: [ApiTag.Session],
      query: ({ sessionId }: { sessionId: string }) => ({
        url: `/surf-sessions/${sessionId}/groups`,
        method: 'GET',
      }),
    }),
    createSessionGroup: builder.mutation({
      invalidatesTags: [ApiTag.Session],
      query: ({
        sessionId,
        name,
        color,
      }: {
        sessionId: string;
        name: string;
        color: string;
      }) => ({
        url: `/surf-sessions/${sessionId}/groups`,
        method: 'POST',
        body: { name, color },
      }),
    }),
    updateSessionGroup: builder.mutation({
      invalidatesTags: [ApiTag.Session],
      query: ({
        sessionId,
        groupId,
        name,
        color,
        sortOrder,
      }: {
        sessionId: string;
        groupId: string;
        name?: string;
        color?: string;
        sortOrder?: number;
      }) => ({
        url: `/surf-sessions/${sessionId}/groups/${groupId}`,
        method: 'PATCH',
        body: { name, color, sortOrder },
      }),
    }),
    deleteSessionGroup: builder.mutation({
      invalidatesTags: [ApiTag.Session, ApiTag.Media],
      query: ({ sessionId, groupId }: { sessionId: string; groupId: string }) => ({
        url: `/surf-sessions/${sessionId}/groups/${groupId}`,
        method: 'DELETE',
      }),
    }),
    updateGroupPhotos: builder.mutation({
      invalidatesTags: [ApiTag.Session, ApiTag.Media],
      query: ({
        sessionId,
        groupId,
        photoIds,
        action,
      }: {
        sessionId: string;
        groupId: string;
        photoIds: string[];
        action: string;
      }) => ({
        url: `/surf-sessions/${sessionId}/groups/${groupId}/photos`,
        method: 'PATCH',
        body: { photoIds, action },
      }),
    }),
    getAds: builder.query({
      providesTags: [],
      query: ({
        surfBreakId,
        lat,
        lon,
        placement,
        limit,
        feed,
      }: {
        surfBreakId?: string;
        lat?: number;
        lon?: number;
        placement?: string | string[];
        limit?: number;
        feed?: boolean;
      } = {}) => {
        const params = new URLSearchParams();
        if (surfBreakId) params.set('surfBreakId', surfBreakId);
        if (lat != null && !Number.isNaN(lat)) params.set('lat', String(lat));
        if (lon != null && !Number.isNaN(lon)) params.set('lon', String(lon));
        if (placement) params.set('placement', Array.isArray(placement) ? placement.join(',') : placement);
        if (limit) params.set('limit', String(limit));
        if (feed) params.set('feed', 'true');
        const qs = params.toString();
        return {
          url: qs ? `/ads?${qs}` : `/ads`,
          method: 'GET',
        };
      },
    }),
    recordAdImpression: builder.mutation({
      query: ({
        adId,
        surfBreakId,
        placement,
        device,
      }: {
        adId: string;
        surfBreakId?: string;
        placement?: string;
        device: 'ios' | 'android';
      }) => ({
        url: `/ads/${adId}/impression`,
        method: 'POST',
        body: {
          surf_break_id: surfBreakId ?? null,
          placement_key: placement ?? null,
          device,
        },
      }),
    }),
    updateSessionThumbnail: builder.mutation({
      invalidatesTags: [],
      query: ({ sessionId, photoId }: { sessionId: string; photoId: string }) => ({
        url: `/surf-sessions/${sessionId}/thumbnail`,
        method: 'PATCH',
        body: { photoId },
      }),
    }),
    createSurfSession: builder.mutation({
      invalidatesTags: [],
      query: ({
        surfBreakId,
        sessionName,
        sessionDate,
        hideLocation,
        files,
        totalSizeInGB,
      }: {
        surfBreakId: string;
        sessionName: string;
        sessionDate: string;
        hideLocation: boolean;
        files: Array<{ name: string; size: number; type: string }>;
        totalSizeInGB: number;
      }) => ({
        url: '/surf-session',
        method: 'POST',
        body: { surfBreakId, sessionName, sessionDate, hideLocation, files, totalSizeInGB },
      }),
    }),
    updateSession: builder.mutation({
      invalidatesTags: [ApiTag.SurfBreak],
      query: ({
        sessionId,
        sessionName,
        hideLocation,
      }: {
        sessionId: string;
        sessionName?: string;
        hideLocation?: boolean;
      }) => ({
        url: `/surf-sessions/${sessionId}`,
        method: 'PATCH',
        body: { sessionName, hideLocation },
      }),
    }),
    deleteSession: builder.mutation({
      invalidatesTags: [ApiTag.SurfBreak, ApiTag.Session, ApiTag.User],
      query: ({ sessionId, force }: { sessionId: string; force?: boolean }) => ({
        url: `/surf-sessions/${sessionId}${force ? '?force=true' : ''}`,
        method: 'DELETE',
      }),
    }),
    reportSurfSession: builder.mutation({
      query: ({ sessionId, reason, details }: { sessionId: string; reason: string; details?: string }) => ({
        url: `/surf-sessions/${sessionId}/report`,
        method: 'POST',
        body: { reason, details: details ?? '' },
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useDoesSurfBreakExistQuery,
  useGetSurfBreaksQuery,
  useGetUsersForSessionTaggingQuery,
  useUpdateSessionsTaggedUsersMutation,
  useGetLatestSessionsQuery,
  useGetSessionQuery,
  useGetSessionPhotosQuery,
  useGetAdsQuery,
  useRecordAdImpressionMutation,
  useGetSurfBreakWithLatestSessionsQuery,
  useGetSurfBreakSessionsQuery,
  useUpdateSessionThumbnailMutation,
  useCreateSurfSessionMutation,
  useUpdateSessionMutation,
  useGetSessionGroupsQuery,
  useCreateSessionGroupMutation,
  useUpdateSessionGroupMutation,
  useDeleteSessionGroupMutation,
  useUpdateGroupPhotosMutation,
  useDeleteSessionMutation,
  useReportSurfSessionMutation,
} = surfApi;

export { surfApi };
