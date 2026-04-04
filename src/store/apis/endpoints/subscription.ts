import { ApiTag, rootApi } from '../rootApi';

const subscriptionApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getSubscriptionPlans: builder.query({
      providesTags: [ApiTag.Subscription],
      query: () => ({
        url: '/subscriptions/plans',
        method: 'GET',
      }),
    }),
    manageSubscription: builder.mutation({
      query: ({ customerId }: { customerId: string }) => ({
        url: `/subscriptions/manage/${customerId}`,
        method: 'POST',
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetSubscriptionPlansQuery,
  useManageSubscriptionMutation,
} = subscriptionApi;

export { subscriptionApi };
