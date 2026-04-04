import { ApiTag, rootApi } from '../rootApi';

const reportsApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getLifetimeVaultStatistics: builder.query({
      providesTags: [ApiTag.Reports],
      query: () => ({
        url: '/reports/lifetime',
        method: 'GET',
      }),
    }),
    getSurfSessionViews: builder.query({
      providesTags: [ApiTag.Reports],
      query: ({ surfBreakId }: { surfBreakId: string }) => ({
        url: `/reports/session-views?surfBreakId=${surfBreakId}`,
        method: 'GET',
      }),
    }),
    getSurfSessionUploads: builder.query({
      providesTags: [ApiTag.Reports],
      query: ({ surfBreakId }: { surfBreakId: string }) => ({
        url: `/reports/session-uploads?surfBreakId=${surfBreakId}`,
        method: 'GET',
      }),
    }),
    getSurfSessionBookings: builder.query({
      providesTags: [ApiTag.Reports],
      query: ({
        limit,
        continuationToken,
      }: {
        limit: number;
        continuationToken?: string;
      }) => ({
        url: `/reports/session-bookings?limit=${limit}&continuationToken=${continuationToken ?? ''}`,
        method: 'GET',
      }),
    }),
    getBookingSearchContent: builder.query({
      providesTags: [ApiTag.Reports],
      query: ({
        searchType,
        searchTerm,
        limit,
        continuationToken,
      }: {
        searchType: string;
        searchTerm: string;
        limit: number;
        continuationToken?: string;
      }) => ({
        url: `/reports/booking-search/${searchType}?term=${searchTerm}&limit=${limit}&continuationToken=${continuationToken ?? ''}`,
        method: 'GET',
      }),
    }),
    createSurfSessionViewReport: builder.mutation({
      invalidatesTags: [ApiTag.Reports],
      query: ({ sessionId, viewerHash }: { sessionId: string; viewerHash: string }) => ({
        url: '/reports/session-view',
        method: 'POST',
        body: { sessionId, viewerHash },
      }),
    }),
    createSurfSessionBooking: builder.mutation({
      invalidatesTags: [ApiTag.Reports],
      query: ({
        userIds,
        surfBreakId,
        bookingDate,
        price,
      }: {
        userIds: string[];
        surfBreakId: string;
        bookingDate: string;
        price: number;
      }) => ({
        url: '/reports/session-booking',
        method: 'POST',
        body: { userIds, surfBreakId, bookingDate, price },
      }),
    }),
    deleteSurfSessionBooking: builder.mutation({
      invalidatesTags: [ApiTag.Reports],
      query: ({ bookingId }: { bookingId: string }) => ({
        url: `/reports/session-booking/${bookingId}`,
        method: 'DELETE',
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useCreateSurfSessionViewReportMutation,
  useGetLifetimeVaultStatisticsQuery,
  useGetSurfSessionViewsQuery,
  useGetBookingSearchContentQuery,
  useGetSurfSessionBookingsQuery,
  useCreateSurfSessionBookingMutation,
  useGetSurfSessionUploadsQuery,
  useDeleteSurfSessionBookingMutation,
} = reportsApi;

export { reportsApi };
