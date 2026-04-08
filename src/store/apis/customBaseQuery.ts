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

  // If 401 and we have a refresher, try refreshing the token
  if (result.error?.status === 401 && tokenRefresher) {
    const newToken = await tokenRefresher();
    if (newToken) {
      token = newToken;
      await saveAuthToken(newToken);
      // Retry with fresh token
      result = await makeQuery(newToken)(args, api, extraOptions);
    }
  }

  return result;
};
