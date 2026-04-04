import { ApiTag, rootApi } from '../rootApi';

const countryApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getCountries: builder.query({
      providesTags: [ApiTag.Country],
      query: ({ country }: { country: string }) => ({
        url: `/country?country=${country}&type=surf`,
        method: 'GET',
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetCountriesQuery } = countryApi;

export { countryApi };
