import { ApiTag, rootApi } from '../rootApi';

export interface BoardroomAd {
  id: string;
  media_url: string;
  hero_media_url: string | null;
  click_url: string | null;
  cta_label: string | null;
  cta_type: 'url' | 'tel' | null;
  headline: string | null;
  body: string | null;
}

export interface BoardroomShaper {
  id: string;
  company_name: string;
  contact_name: string | null;
  phone_number: string | null;
  logo_url: string | null;
  lat: number;
  lon: number;
  target_radius_km: number;
  distance_km: number;
  ads: BoardroomAd[];
}

/** Detail-page shape — same as feed shaper but no distance (no anchor point). */
export interface BoardroomShaperDetail extends Omit<BoardroomShaper, 'distance_km'> {}

const boardroomApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
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
    getBoardroomShaper: builder.query<
      { results: { shaper: BoardroomShaperDetail } },
      { id: string }
    >({
      providesTags: [ApiTag.Boardroom],
      query: ({ id }) => ({
        url: `/boardroom/shapers/${id}`,
        method: 'GET',
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetBoardroomShapersQuery, useGetBoardroomShaperQuery } = boardroomApi;
export { boardroomApi };
