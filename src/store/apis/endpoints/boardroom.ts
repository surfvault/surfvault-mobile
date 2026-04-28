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
  }),
  overrideExisting: false,
});

export const {
  useGetBoardroomShapersQuery,
  useGetFeaturedShaperBoardsNearQuery,
  useGetShaperBoardsQuery,
} = boardroomApi;
export { boardroomApi };
