import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { colorScheme as nativewindColorScheme } from 'nativewind';
import { useUserPreferences } from '../helpers/preferences';

/**
 * Applies the user's theme preference to BOTH styling systems in the app:
 *  - NativeWind `dark:` className variants (tab screens) via nativewind's
 *    colorScheme store, and
 *  - React Native's `useColorScheme()` (StyleSheet-based top-level routes) via
 *    `Appearance.setColorScheme`.
 *
 * 'system' clears the override so both fall back to the OS appearance. Renders
 * nothing; must live under UserProvider (reads preferences off the user).
 */
export function ThemeSync() {
  const { theme } = useUserPreferences();

  useEffect(() => {
    nativewindColorScheme.set(theme);
    Appearance.setColorScheme(theme === 'system' ? null : theme);
  }, [theme]);

  return null;
}

export default ThemeSync;
