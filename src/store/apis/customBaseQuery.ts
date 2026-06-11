import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const AUTH_TOKEN_KEY = 'auth_token';

// Token refresh callback — set by AuthProvider
let tokenRefresher: (() => Promise<string | null>) | null = null;

export const setTokenRefresher = (fn: () => Promise<string | null>) => {
  tokenRefresher = fn;
};

// Dedupe concurrent refreshes. With refresh-token rotation enabled, firing the
// refresher N times in parallel (the home screen's feed + notifications +
// messages + unread queries all 401'ing at once on app resume) would rotate the
// token N times and invalidate all but one — the losers get invalid_grant, the
// account is marked expired, and the user is spuriously logged out. So a fleet
// of simultaneous 401s must share a SINGLE refresh. Mirrors the web base query.
let refreshInFlight: Promise<string | null> | null = null;

export const saveAuthToken = async (token: string): Promise<void> => {
  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
};

export const getAuthToken = async (): Promise<string | null> => {
  return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
};

export const clearAuthToken = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
};

const apiBaseUrl =
  Constants.expoConfig?.extra?.apiBaseUrl ?? 'https://dev-api.surf-vault.com';

export const customBaseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let token = await getAuthToken();

  const makeQuery = (t: string | null) => fetchBaseQuery({
    baseUrl: apiBaseUrl,
    prepareHeaders(headers) {
      if (t) {
        headers.set('Authorization', `Bearer ${t}`);
      }
      return headers;
    },
  });

  // First attempt
  let result = await makeQuery(token)(args, api, extraOptions);

  // If 401 and we have a refresher, try refreshing the token — but collapse
  // concurrent 401s into ONE refresh (see refreshInFlight above) so rotation
  // doesn't double-rotate the refresh token and expire the account.
  if (result.error?.status === 401 && tokenRefresher) {
    if (!refreshInFlight) {
      refreshInFlight = Promise.resolve(tokenRefresher()).finally(() => {
        refreshInFlight = null;
      });
    }
    const newToken = await refreshInFlight;
    if (newToken) {
      token = newToken;
      await saveAuthToken(newToken);
      // Retry with fresh token
      result = await makeQuery(newToken)(args, api, extraOptions);
    }
  }

  return result;
};
