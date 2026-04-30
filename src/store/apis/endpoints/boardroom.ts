import { ApiTag, rootApi } from '../rootApi';

export interface BoardPhoto {
  id: string;
  s3_key: string;
  sort_order: number;
}

export interface Board {
  id: string;
  name: string;
  board_type: string | null;
  dimensions: string | null;
  description: string | null;
  is_featured?: boolean;
  sort_order: number;
  /** Owner-selected cover photo. Falls back to first photo by sort_order
   * when null. Set via PATCH /boards/{id}/thumbnail. */
  thumbnail_photo_id?: string | null;
  photos: BoardPhoto[];
  // Lifetime distinct (viewer × day) view count. Populated by
  // getShaperBoards; falls back to 0 if not present (e.g. older API responses).
  view_count?: number;
}

/** Single-board detail response shape for the dedicated board page. */
export interface BoardDetail extends Board {
  shaper_user_id: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  shaper: {
    id: string;
    handle: string;
    name: string | null;
    picture: string | null;
    verified: boolean | null;
    instagram: string | null;
    website: string | null;
    phone_number: string | null;
  };
}

/**
 * Per-shaper feed row. Same shape across all four shaper-feed endpoints
 * (`/shapers/latest`, `/shapers/from-following`, `/boardroom/shapers`,
 * `/surf-breaks/{breakId}/shapers`) so a single card component renders any
 * of them.
 *
 * `distance_km` is only populated by `/boardroom/shapers` when the caller
 * passes a `viewerSurfBreakId` that resolves to a break with lat/lon — null
 * everywhere else. `surf_break_*` fields are derived from a LEFT JOIN on
 * `surf_breaks` via `users.surf_break_id`; null when the shaper hasn't
 * picked a home break.
 */
export interface BoardroomShaper {
  id: string;
  handle: string;
  name: string | null;
  picture: string | null;
  surf_break_id: string | null;
  surf_break_name: string | null;
  surf_break_country: string | null;
  surf_break_country_code: string | null;
  surf_break_region: string | null;
  coordinates: { lat?: number; lon?: number } | null;
  phone_number: string | null;
  instagram: string | null;
  website: string | null;
  verified: boolean | null;
  distance_km: number | null;
  /** ISO timestamp of the most recent featured-board activity (board create
   * OR photo upload). Drives the Discover/Following sort order. */
  latest_activity_at: string;
  featured_boards: Board[];
}

const boardroomApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    /** Boardroom feed — public. Pass the viewer's `users.surf_break_id` as
     * `viewerSurfBreakId` to get shapers sorted by distance from that break
     * (NULLS LAST). Without it, falls back to latest-activity sort — same
     * content as `/shapers/latest`. */
    getBoardroomShapers: builder.query<
      { results: { shapers: BoardroomShaper[] } },
      { viewerSurfBreakId?: string | null; limit?: number }
    >({
      providesTags: [ApiTag.Boardroom],
      query: ({ viewerSurfBreakId, limit = 30 }) => {
        const params = new URLSearchParams();
        if (viewerSurfBreakId) params.set('viewerSurfBreakId', viewerSurfBreakId);
        params.set('limit', String(limit));
        return { url: `/boardroom/shapers?${params.toString()}`, method: 'GET' };
      },
    }),
    /** Latest shapers — public. Drives the mobile + web Discover feed. One
     * card per shaper, sorted by their most recent featured-board activity. */
    getLatestShapers: builder.query<
      { results: { shapers: BoardroomShaper[] } },
      { limit?: number } | void
    >({
      providesTags: [ApiTag.Boardroom],
      query: (args) => {
        const limit = args?.limit ?? 30;
        return { url: `/shapers/latest?limit=${limit}`, method: 'GET' };
      },
    }),
    /** Shapers tied to a specific surf break — public. Filters by region match
     * (or country fallback when the break has no region). Used to interleave
     * local shapers into the surf-break-sessions page. */
    getShapersForSurfBreak: builder.query<
      { results: { shapers: BoardroomShaper[] } },
      { breakId: string; limit?: number }
    >({
      providesTags: [ApiTag.Boardroom],
      query: ({ breakId, limit = 20 }) => ({
        url: `/surf-breaks/${breakId}/shapers?limit=${limit}`,
        method: 'GET',
      }),
    }),
    /** All boards for a shaper's profile gallery — featured first, then rest. */
    getShaperBoards: builder.query<
      { results: { boards: Board[] } },
      { handle: string }
    >({
      providesTags: [ApiTag.Boardroom],
      query: ({ handle }) => ({
        url: `/shapers/${handle}/boards`,
        method: 'GET',
      }),
    }),
    /** Single board detail — drives the dedicated /board/{id} page. */
    getBoard: builder.query<
      { results: { board: BoardDetail } },
      { boardId: string }
    >({
      providesTags: (_r, _e, { boardId }) => [
        { type: ApiTag.Boardroom, id: boardId },
        ApiTag.Boardroom,
      ],
      query: ({ boardId }) => ({
        url: `/boards/${boardId}`,
        method: 'GET',
      }),
    }),
    /** Shapers the caller follows, sorted by latest featured-board activity.
     * One card per shaper. Auth required — viewer is the source side of the
     * follow lookup. */
    getShapersFromFollowing: builder.query<
      { results: { shapers: BoardroomShaper[] } },
      { limit?: number } | void
    >({
      providesTags: [ApiTag.Boardroom, ApiTag.Follow],
      query: (args) => {
        const limit = args?.limit ?? 30;
        return { url: `/shapers/from-following?limit=${limit}`, method: 'GET' };
      },
    }),

    // ---- Self-service mutations (shaper manages own boards) ----

    createMyBoard: builder.mutation<
      { results: { success: boolean; boardId: string; shaperId: string } },
      { name: string; board_type?: string | null; dimensions?: string | null; description?: string | null; is_featured?: boolean }
    >({
      invalidatesTags: [ApiTag.Boardroom],
      query: (payload) => ({ url: `/boards`, method: 'POST', body: payload }),
    }),
    updateMyBoard: builder.mutation<
      { results: { success: boolean; boardId: string } },
      { boardId: string; payload: Record<string, any> }
    >({
      invalidatesTags: [ApiTag.Boardroom],
      query: ({ boardId, payload }) => ({ url: `/boards/${boardId}`, method: 'PATCH', body: payload }),
    }),
    deleteMyBoard: builder.mutation<
      { results: { success: boolean; boardId: string } },
      { boardId: string }
    >({
      invalidatesTags: [ApiTag.Boardroom],
      query: ({ boardId }) => ({ url: `/boards/${boardId}`, method: 'DELETE' }),
    }),
    // Intentionally NO invalidatesTags — same race-with-S3-PUT reason as
    // admin's createBoardPhotos. Caller refetches manually after PUTs land.
    // `file_size_bytes` is required for storage accounting — backend uses it
    // to atomically increment the shaper's `current_storage` alongside the
    // INSERT. Pass 0 only when the size is genuinely unknown (the daily
    // reconcile cron will surface drift in that case).
    createMyBoardPhotos: builder.mutation<
      { results: { photos: Array<{ id: string; file_uuid: string; s3_key: string; url: string; media_url: string; sort_order: number; size_in_gb: number | null }> } },
      { boardId: string; payload: { files: Array<{ file_uuid: string; file_type: string; file_size_bytes?: number }> } }
    >({
      query: ({ boardId, payload }) => ({ url: `/boards/${boardId}/photos`, method: 'POST', body: payload }),
    }),
    deleteMyBoardPhoto: builder.mutation<
      { results: { success: boolean; photoId: string } },
      { photoId: string }
    >({
      invalidatesTags: [ApiTag.Boardroom],
      query: ({ photoId }) => ({ url: `/board-photos/${photoId}`, method: 'DELETE' }),
    }),
    /** Owner sets the cover photo for a board. */
    updateBoardThumbnail: builder.mutation<
      { results: { success: boolean; boardId: string; thumbnailPhotoId: string } },
      { boardId: string; photoId: string }
    >({
      invalidatesTags: (_r, _e, { boardId }) => [
        { type: ApiTag.Boardroom, id: boardId },
        ApiTag.Boardroom,
      ],
      query: ({ boardId, photoId }) => ({
        url: `/boards/${boardId}/thumbnail`,
        method: 'PATCH',
        body: { photoId },
      }),
    }),
    /** Send a moderation report email to support. No DB write. */
    reportBoard: builder.mutation<
      { message: string },
      { boardId: string; reason: string; details?: string }
    >({
      query: ({ boardId, reason, details }) => ({
        url: `/boards/${boardId}/report`,
        method: 'POST',
        body: { reason, details: details ?? '' },
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
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
  useDeleteMyBoardPhotoMutation,
  useUpdateBoardThumbnailMutation,
  useReportBoardMutation,
} = boardroomApi;
export { boardroomApi };
