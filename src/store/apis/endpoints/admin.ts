import { ApiTag, rootApi } from '../rootApi';

const adminApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminUsers: builder.query({
      providesTags: [],
      query: ({ term, page, limit }: { term: string; page: number; limit: number }) => ({
        url: `/admin/users?page=${page}&limit=${limit}&term=${term}`,
        method: 'GET',
      }),
    }),
    getAdminBreaks: builder.query({
      providesTags: [],
      query: ({ term, page, limit }: { term: string; page: number; limit: number }) => ({
        url: `/admin/surf-breaks?page=${page}&limit=${limit}&term=${term}`,
        method: 'GET',
      }),
    }),
    getAdminAdPartners: builder.query({
      providesTags: [ApiTag.AdPartners],
      query: ({ term, page, limit }: { term: string; page: number; limit: number }) => ({
        url: `/admin/ad-partners?page=${page}&limit=${limit}&term=${term}`,
        method: 'GET',
      }),
    }),
    createSurfBreak: builder.mutation({
      invalidatesTags: [ApiTag.SurfBreak, ApiTag.Map, ApiTag.Country],
      query: (payload: Record<string, unknown>) => ({
        url: '/admin/surf-break',
        method: 'POST',
        body: payload,
      }),
    }),
    createAdPartner: builder.mutation({
      invalidatesTags: [],
      query: (payload: Record<string, unknown>) => ({
        url: '/admin/ad-partner',
        method: 'POST',
        body: payload,
      }),
    }),
    createAdMediaPresignedUrls: builder.mutation({
      invalidatesTags: [],
      query: ({
        adPartnerId,
        payload,
      }: {
        adPartnerId: string;
        payload: Record<string, unknown>;
      }) => ({
        url: `/admin/ad-partner/${adPartnerId}/presigned-urls`,
        method: 'POST',
        body: payload,
      }),
    }),
    upsertAds: builder.mutation({
      invalidatesTags: [ApiTag.AdPartners],
      query: ({
        adPartnerId,
        payload,
      }: {
        adPartnerId: string;
        payload: Record<string, unknown>;
      }) => ({
        url: `/admin/ad-partner/${adPartnerId}/upsert`,
        method: 'POST',
        body: payload,
      }),
    }),
    updateAdPartner: builder.mutation({
      invalidatesTags: [ApiTag.AdPartners],
      query: ({
        adPartnerId,
        payload,
      }: {
        adPartnerId: string;
        payload: Record<string, unknown>;
      }) => ({
        url: `/admin/ad-partner/${adPartnerId}`,
        method: 'PATCH',
        body: payload,
      }),
    }),
    // Single-ad detail for the read-only review screen (opened from a
    // newCampaignSubmission notification). Returns the full ad with media[]
    // + targeting — same shape as the advertiser /campaigns rows so
    // CampaignUpload can render it in readOnly mode.
    getAdminAd: builder.query({
      providesTags: [ApiTag.AdPartners],
      query: ({ adId }: { adId: string }) => ({
        url: `/admin/ads/${adId}`,
        method: 'GET',
      }),
    }),
    // Campaign approvals (admin moderation queue) — same endpoints the web
    // admin Campaigns tab uses. Mobile only surfaces these via the inline
    // Approve/Reject actions on newCampaignSubmission notifications.
    approveAdminAd: builder.mutation({
      invalidatesTags: [ApiTag.AdPartners],
      query: ({ adId }: { adId: string }) => ({
        url: `/admin/ads/${adId}/approve`,
        method: 'POST',
      }),
    }),
    rejectAdminAd: builder.mutation({
      invalidatesTags: [ApiTag.AdPartners],
      query: ({ adId, rejectionReason }: { adId: string; rejectionReason: string }) => ({
        url: `/admin/ads/${adId}/reject`,
        method: 'POST',
        body: { rejection_reason: rejectionReason },
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetAdminBreaksQuery,
  useGetAdminUsersQuery,
  useGetAdminAdPartnersQuery,
  useCreateSurfBreakMutation,
  useCreateAdPartnerMutation,
  useCreateAdMediaPresignedUrlsMutation,
  useUpsertAdsMutation,
  useUpdateAdPartnerMutation,
  useGetAdminAdQuery,
  useApproveAdminAdMutation,
  useRejectAdminAdMutation,
} = adminApi;

export { adminApi };
