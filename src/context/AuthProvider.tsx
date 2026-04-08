import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Auth0, { useAuth0 } from 'react-native-auth0';
import Constants from 'expo-constants';
import { saveAuthToken, clearAuthToken, getAuthToken, setTokenRefresher } from '../store/apis/customBaseQuery';

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
      });
      await refreshToken();
    } catch (e) {
      console.error('Login failed:', e);
    }
  }, [authorize, refreshToken]);

  const logout = useCallback(async () => {
    try {
      await clearSession();
      await clearAuthToken();
      setToken(null);
      setIsAuthenticated(false);
    } catch (e) {
      console.error('Logout failed:', e);
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
