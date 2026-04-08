import React, { createContext, useContext, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';

interface NavigationContextType {
  lastActiveTab: React.MutableRefObject<string>;
  setActiveTab: (tab: string) => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextType>({
  lastActiveTab: { current: '/(tabs)' },
  setActiveTab: () => {},
  goBack: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const lastActiveTab = useRef('/(tabs)');

  const setActiveTab = useCallback((tab: string) => {
    lastActiveTab.current = tab;
  }, []);

  // goBack is a no-op here — it gets overridden in the hook
  const goBack = useCallback(() => {}, []);

  return (
    <NavigationContext.Provider value={{ lastActiveTab, setActiveTab, goBack }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useActiveTab() {
  const { lastActiveTab, setActiveTab } = useContext(NavigationContext);
  return { lastActiveTab, setActiveTab };
}

/**
 * Smart back navigation for top-level routes.
 * Falls back to the last active tab when router.back() would
 * go to the wrong place.
 */
export function useSmartBack() {
  const router = useRouter();
  const { lastActiveTab } = useContext(NavigationContext);

  return useCallback(() => {
    // Try to go back normally first
    if (router.canGoBack()) {
      router.back();
    } else {
      // Fallback to last known tab
      router.replace(lastActiveTab.current as any);
    }
  }, [router, lastActiveTab]);
}
