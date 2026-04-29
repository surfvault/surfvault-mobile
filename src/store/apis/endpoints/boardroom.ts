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
  photos: BoardPhoto[];
  // Lifetime distinct (viewer × day) view count. Populated by
  // getShaperBoards; falls back to 0 if not present (e.g. older API responses).
  view_count?: number;
}

export interface BoardroomShaper {
  id: string;
  handle: string;
  name: string | null;
  picture: string | null;
  coordinates: { lat?: number; lon?: number } | null;
  phone_number: string | null;
  service_radius_km: number | null;
  instagram: string | null;
  website: string | null;
  distance_km: number;
  featured_boards: Board[];
}

/** Flattened featured-board row used by Discover interleave. One entry per
 * featured board, with shaper info denormalized for card rendering. */
export interface FeaturedShaperBoard {
  board_id: string;
  board_name: string;
  board_type: string | null;
  dimensions: string | null;
  description: string | null;
  sort_order: number;
  shaper_id: string;
  shaper_handle: string;
  shaper_name: string | null;
  shaper_picture: string | null;
  shaper_instagram: string | null;
  shaper_phone_number: string | null;
  distance_km: number;
  photos: BoardPhoto[];
}

const boardroomApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    /** Boardroom feed — shaper users sorted by distance with their featured
     * boards inlined for card rendering. */
    getBoardroomShapers: builder.query<
      { results: { shapers: BoardroomShaper[] } },
      { lat: number; lon: number; limit?: number }
    >({
      providesTags: [ApiTag.Boardroom],
      query: ({ lat, lon, limit = 30 }) => ({
        url: `/boardroom/shapers?lat=${lat}&lon=${lon}&limit=${limit}`,
        method: 'GET',
      }),
    }),
    /** Discover interleave — flat list of featured boards from nearby shapers,
     * one per board, ordered by distance. */
    getFeaturedShaperBoardsNear: builder.query<
      { results: { boards: FeaturedShaperBoard[] } },
      { lat: number; lon: number; limit?: number }
    >({
      providesTags: [ApiTag.Boardroom],
      query: ({ lat, lon, limit = 20 }) => ({
        url: `/shapers/featured-near?lat=${lat}&lon=${lon}&limit=${limit}`,
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
    /** Shapers the caller follows, with their featured boards inlined.
     * Used in the Following feed — ONE slot per shaper (their featured
     * boards swipe inside the card) so a prolific shaper can't dominate. */
    getShapersFromFollowing: builder.query<
      { results: { shapers: BoardroomShaper[] } },
      { lat: number; lon: number; limit?: number }
    >({
      providesTags: [ApiTag.Boardroom, ApiTag.Follow],
      query: ({ lat, lon, limit = 30 }) => ({
        url: `/shapers/from-following?lat=${lat}&lon=${lon}&limit=${limit}`,
        method: 'GET',
      }),
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
    createMyBoardPhotos: builder.mutation<
      { results: { photos: Array<{ id: string; file_uuid: string; s3_key: string; url: string; media_url: string; sort_order: number }> } },
      { boardId: string; payload: { files: Array<{ file_uuid: string; file_type: string }> } }
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
  }),
  overrideExisting: false,
});

export const {
  useGetBoardroomShapersQuery,
  useGetFeaturedShaperBoardsNearQuery,
  useGetShaperBoardsQuery,
  useGetShapersFromFollowingQuery,
  useCreateMyBoardMutation,
  useUpdateMyBoardMutation,
  useDeleteMyBoardMutation,
  useCreateMyBoardPhotosMutation,
  useDeleteMyBoardPhotoMutation,
} = boardroomApi;
export { boardroomApi };
