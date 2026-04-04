import { useCallback } from 'react';
import { useAuth } from '../context/AuthProvider';

/**
 * Mobile equivalent of the web's `loginWithAuth0` pattern.
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *
 *   const onFollow = () => {
 *     if (!requireAuth()) return;
 *     // ... do the authenticated action
 *   };
 *
 * Returns a function that:
 * - Returns `true` if user is already authenticated
 * - Triggers Auth0 login if not, returns `false` (caller should bail)
 */
export const useRequireAuth = () => {
  const { isAuthenticated, login } = useAuth();

  const requireAuth = useCallback((): boolean => {
    if (isAuthenticated) return true;

    // Trigger login — the action won't proceed this time,
    // but once logged in the user can retry
    login();
    return false;
  }, [isAuthenticated, login]);

  return requireAuth;
};
