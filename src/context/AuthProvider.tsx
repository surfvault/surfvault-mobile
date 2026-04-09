import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Auth0, { useAuth0 } from 'react-native-auth0';
import Constants from 'expo-constants';
import { saveAuthToken, clearAuthToken, getAuthToken, setTokenRefresher } from '../store/apis/customBaseQuery';
import { store } from '../store';
import { rootApi } from '../store/apis/rootApi';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  token: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    authorize,
    clearSession,
    getCredentials,
    isLoading: auth0Loading,
    error,
  } = useAuth0();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  const refreshToken = useCallback(async () => {
    try {
      const credentials = await getCredentials();
      if (credentials?.accessToken) {
        await saveAuthToken(credentials.accessToken);
        setToken(credentials.accessToken);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      // No valid session
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, [getCredentials]);

  useEffect(() => {
    if (!auth0Loading) {
      refreshToken();

      // Register token refresher for customBaseQuery to use on 401
      setTokenRefresher(async () => {
        try {
          const credentials = await getCredentials();
          return credentials?.accessToken ?? null;
        } catch {
          return null;
        }
      });
    }
  }, [auth0Loading, refreshToken, getCredentials]);

  const login = useCallback(async () => {
    try {
      const audience = Constants.expoConfig?.extra?.auth0Audience;
      await authorize({
        audience,
        scope: 'openid profile email offline_access',
        additionalParameters: { prompt: 'login' },
      });
      await refreshToken();
    } catch (e) {
      console.error('Login failed:', e);
    }
  }, [authorize, refreshToken]);

  const logout = useCallback(async () => {
    try {
      // Clear push token before logging out
      const authToken = await getAuthToken();
      if (authToken) {
        const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl ?? '';
        fetch(`${apiBaseUrl}/user/clear-push-token`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        }).catch(() => {}); // fire and forget
      }

      // Skip clearSession entirely — just clear local tokens
      // clearSession opens a browser modal which we don't want
    } catch (e) {
      console.error('Logout failed:', e);
    } finally {
      // Always clear local state regardless of Auth0 session clear result
      await clearAuthToken();
      setToken(null);
      setIsAuthenticated(false);
      // Reset all RTK Query caches so stale user data is gone
      store.dispatch(rootApi.util.resetApiState());
    }
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        login,
        logout,
        token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
