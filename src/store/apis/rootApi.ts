import { createApi } from '@reduxjs/toolkit/query/react';
import { customBaseQuery } from './customBaseQuery';

export const ApiTag = {
  SurfBreak: 'SurfBreak',
  Session: 'Session',
  Country: 'Country',
  User: 'User',
  Conversation: 'Conversation',
  Notification: 'Notification',
  Map: 'Map',
  Subscription: 'Subscription',
  Reports: 'Reports',
  Favorite: 'Favorite',
  Follow: 'Follow',
  Media: 'Media',
  AdPartners: 'AdPartners',
  AccessRequest: 'AccessRequest',
  Boardroom: 'Boardroom',
  LinkedAccount: 'LinkedAccount',
} as const;

export type ApiTagType = (typeof ApiTag)[keyof typeof ApiTag];

export const rootApi = createApi({
  baseQuery: customBaseQuery,
  reducerPath: 'rootApiSlice',
  tagTypes: Object.values(ApiTag),
  endpoints: () => ({}),
});
