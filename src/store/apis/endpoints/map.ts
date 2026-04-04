import { ApiTag, rootApi } from '../rootApi';

const mapApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getMapSearchContent: builder.query({
      providesTags: [ApiTag.Map],
      query: ({
        search,
        type,
        tags,
      }: {
        search: string;
        type?: string;
        tags?: string[];
      }) => ({
        url: `/map/search?term=${search}&type=${type ?? 'all'}&tags=${(tags ?? []).join(',')}`,
        method: 'GET',
      }),
    }),
    getNearbySurfBreaks: builder.query({
      providesTags: [ApiTag.Map],
      query: ({ lat, long }: { lat: number; long: number }) => ({
        url: `/map/nearby-breaks?lat=${lat}&long=${long}`,
        method: 'GET',
      }),
    }),
    getNearbyPhotographers: builder.query({
      providesTags: [ApiTag.Map],
      query: ({ lat, long }: { lat: number; long: number }) => ({
        url: `/map/nearby-photographers?lat=${lat}&long=${long}`,
        method: 'GET',
      }),
    }),
    getMapSurfBreaks: builder.query({
      providesTags: [ApiTag.Map],
      query: ({
        continent,
        minLat,
        maxLat,
        minLon,
        maxLon,
        viewerId,
        favorites,
        mine,
      }: {
        continent: string;
        minLat: number;
        maxLat: number;
        minLon: number;
        maxLon: number;
        viewerId?: string;
        favorites: boolean;
        mine: boolean;
      }) => ({
        url: `/map/surf-breaks?continent=${continent}&minLat=${minLat}&maxLat=${maxLat}&minLon=${minLon}&maxLon=${maxLon}&favorites=${favorites}&mine=${mine}&viewerId=${viewerId ?? ''}`,
        method: 'GET',
      }),
      keepUnusedDataFor: 60,
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetMapSearchContentQuery,
  useGetNearbySurfBreaksQuery,
  useGetNearbyPhotographersQuery,
  useGetMapSurfBreaksQuery,
} = mapApi;

export { mapApi };
