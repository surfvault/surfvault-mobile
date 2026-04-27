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
  }),
  overrideExisting: false,
});

export const { useGetBoardroomShapersQuery } = boardroomApi;
export { boardroomApi };
