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
        feed,
        groupByBreakDate,
      }: {
        userId?: string;
        country?: string;
        region?: string;
        surfBreak?: string;
        date?: string;
        limit?: number;
        continuationToken?: string;
        feed?: 'following' | 'favorites';
        groupByBreakDate?: boolean;
      }) => ({
        url: `/surf-sessions?limit=${limit ?? ''}&viewerId=${userId ?? ''}&country=${country ?? ''}&region=${region ?? ''}&surfBreak=${surfBreak ?? ''}&date=${date ?? ''}&continuationToken=${continuationToken ?? ''}&feed=${feed ?? ''}&groupByBreakDate=${groupByBreakDate ? 'true' : ''}`,
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
      providesTags: [ApiTag.SurfBreak, ApiTag.Session],
      query: ({
        surfBreakId,
        limit,
        continuationToken,
        viewerId,
      }: {
        surfBreakId: string;
        limit?: number;
        continuationToken?: string;
        // Optional but required for block filtering: this endpoint has no
        // authorizer so the API can't derive the caller. Pass current user id
        // when known so blocked photographers' sessions get filtered out.
        viewerId?: string;
      }) => ({
        url: `/surf-session/${surfBreakId}/posts?limit=${limit ?? ''}&continuationToken=${continuationToken ?? ''}&viewerId=${viewerId ?? ''}`,
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
    // Self-service presigned-URL minting for advertiser creative uploads.
    // Mirrors web/endpoints/surf.js. Backend scopes to caller via JWT.
    createMyAdMediaPresignedUrls: builder.mutation<
      { results: { idMappedPresignedUrls: { file_uuid: string; url: string; media_url: string }[] } },
      { files: { file_uuid: string; file_type: string }[] }
    >({
      query: (payload) => ({
        url: '/ads/media-presigned-urls',
        method: 'POST',
        body: payload,
      }),
    }),
    // Public ad gallery for an advertiser profile. Backend gates the
    // response by JWT: self-view returns all statuses (with `status` field
    // on each ad); public viewers get only approved + currently-active.
    getAdvertiserAds: builder.query<any, { handle: string }>({
      providesTags: [ApiTag.AdPartners],
      query: ({ handle }) => ({
        url: `/advertisers/${handle}/ads`,
        method: 'GET',
      }),
    }),
    // Self-service ad creation. Status forced to 'pending' server-side so
    // every submission goes through admin moderation. Invalidates
    // AdPartners so the advertiser's profile gallery refetches and
    // immediately shows the new submission with its "Pending review" pill.
    createMyAd: builder.mutation<
      { results: { id: string; status: string } },
      {
        placement_key: 'sidebar' | 'content';
        media_type: 'image' | 'video';
        media_urls?: string[];
        media_url?: string;
        thumbnail_index?: number;
        hero_media_url?: string | null;
        click_url?: string | null;
        headline: string;
        body?: string | null;
        cta_label?: string | null;
        cta_type?: 'url' | 'tel';
        starts_at?: string | null;
        ends_at?: string | null;
        daily_impression_cap_per_user?: number;
        show_on_discover?: boolean;
        surf_break_ids?: string[];
      }
    >({
      invalidatesTags: [ApiTag.AdPartners],
      query: (payload) => ({
        url: '/ads',
        method: 'POST',
        body: payload,
      }),
    }),
    reportAd: builder.mutation({
      query: ({ adId, reason, details }: { adId: string; reason: string; details?: string }) => ({
        url: `/ads/${adId}/report`,
        method: 'POST',
        body: { reason, details: details ?? '' },
      }),
    }),
    updateSessionThumbnail: builder.mutation({
      invalidatesTags: [ApiTag.SurfBreak, ApiTag.Session, ApiTag.User],
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
        notifyFollowers,
        files,
        totalSizeInGB,
      }: {
        surfBreakId: string;
        sessionName: string;
        sessionDate: string;
        hideLocation: boolean;
        notifyFollowers: boolean;
        files: Array<{ name: string; size: number; type: string }>;
        totalSizeInGB: number;
      }) => ({
        url: '/surf-session',
        method: 'POST',
        body: { surfBreakId, sessionName, sessionDate, hideLocation, notifyFollowers, files, totalSizeInGB },
      }),
    }),
    updateSession: builder.mutation({
      // Skip invalidation for aspect-ratio-only updates. Both the profile
      // and surf-break feeds accumulate paginated pages in component state;
      // invalidating would refetch page 1 and snap the user back to the top
      // with all scrolled-in pages dropped. The `onQueryStarted` patch below
      // already updates every cache that contains this session, so the UI
      // stays consistent without a refetch. When the user navigates away
      // and remounts the feed, RTK Query's standard refetch-on-mount picks
      // up server truth.
      invalidatesTags: (_result, _err, arg) => {
        const isAspectOnly =
          arg.aspectRatio !== undefined &&
          arg.sessionName === undefined &&
          arg.hideLocation === undefined;
        return isAspectOnly ? [] : [ApiTag.SurfBreak, ApiTag.Session, ApiTag.User];
      },
      query: ({
        sessionId,
        sessionName,
        hideLocation,
        aspectRatio,
      }: {
        sessionId: string;
        sessionName?: string;
        hideLocation?: boolean;
        aspectRatio?: '4:5' | '1:1' | '5:4' | '16:9' | null;
      }) => ({
        url: `/surf-sessions/${sessionId}`,
        method: 'PATCH',
        body: { sessionName, hideLocation, aspectRatio },
      }),
      // Optimistic update: patch every cached feed/detail entry that
      // contains this session BEFORE the server replies. Card reflows
      // immediately on chip tap. Reverts if the PATCH fails.
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        if (arg.aspectRatio === undefined) return; // not an aspect-ratio update
        const nextRatio = arg.aspectRatio; // string | null
        const targetId = arg.sessionId;

        // Walks every cached entry of `endpointName` and runs `mutator` on
        // its `draft` (immer draft). Collects patch results for revert.
        const patches: { undo: () => void }[] = [];
        const patchEndpoint = (endpointName: string, mutator: (draft: any) => void) => {
          const state: any = getState();
          const queries = state?.rootApiSlice?.queries ?? {};
          for (const key of Object.keys(queries)) {
            if (!key.startsWith(`${endpointName}(`)) continue;
            const entry = queries[key];
            const originalArgs = entry?.originalArgs;
            if (originalArgs === undefined) continue;
            const patch = dispatch(
              (surfApi.util as any).updateQueryData(endpointName, originalArgs, mutator)
            );
            patches.push(patch);
          }
        };

        // getSession → { results: { session: {...} } } — single session
        patchEndpoint('getSession', (draft: any) => {
          const s = draft?.results?.session;
          if (s && (s.id === targetId || s.session_id === targetId)) {
            s.aspect_ratio = nextRatio;
          }
        });

        // getUserSessions / getSurfBreakSessions →
        // { results: { sessions: [...] } } — flat list, may have session_id or id
        const flatListMutator = (draft: any) => {
          const arr = draft?.results?.sessions;
          if (!Array.isArray(arr)) return;
          for (const row of arr) {
            if (row && (row.id === targetId || row.session_id === targetId)) {
              row.aspect_ratio = nextRatio;
            }
          }
        };
        patchEndpoint('getUserSessions', flatListMutator);
        patchEndpoint('getSurfBreakSessions', flatListMutator);

        // getSurfBreakWithLatestSessions →
        // { results: { surfBreak, sessions: [...] } } — break detail page
        patchEndpoint('getSurfBreakWithLatestSessions', (draft: any) => {
          const arr = draft?.results?.sessions;
          if (!Array.isArray(arr)) return;
          for (const row of arr) {
            if (row && (row.session_id === targetId || row.id === targetId)) {
              row.aspect_ratio = nextRatio;
            }
          }
        });

        try {
          await queryFulfilled;
        } catch {
          // Server rejected — undo every patch so caches revert to truth.
          patches.forEach((p) => p.undo());
        }
      },
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
  useCreateMyAdMediaPresignedUrlsMutation,
  useCreateMyAdMutation,
  useGetAdvertiserAdsQuery,
  useReportAdMutation,
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
