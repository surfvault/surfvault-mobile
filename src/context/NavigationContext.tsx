import React, { createContext, useContext, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';

interface NavigationContextType {
  lastActiveTab: React.MutableRefObject<string>;
  depth: React.MutableRefObject<number>;
  setActiveTab: (tab: string) => void;
  incrementDepth: () => void;
  decrementDepth: () => void;
}

const NavigationContext = createContext<NavigationContextType>({
  lastActiveTab: { current: '/(tabs)' },
  depth: { current: 0 },
  setActiveTab: () => {},
  incrementDepth: () => {},
  decrementDepth: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const lastActiveTab = useRef('/(tabs)');
  const depth = useRef(0);

  const setActiveTab = useCallback((tab: string) => {
    lastActiveTab.current = tab;
    // Reset depth when returning to tabs
    depth.current = 0;
  }, []);

  const incrementDepth = useCallback(() => {
    depth.current += 1;
  }, []);

  const decrementDepth = useCallback(() => {
    depth.current = Math.max(0, depth.current - 1);
  }, []);

  return (
    <NavigationContext.Provider value={{ lastActiveTab, depth, setActiveTab, incrementDepth, decrementDepth }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useActiveTab() {
  const { lastActiveTab, setActiveTab } = useContext(NavigationContext);
  return { lastActiveTab, setActiveTab };
}

/**
 * Smart back: if we're the first screen above tabs (depth 1),
 * replace back to the tab. Otherwise use router.back().
 */
export function useSmartBack() {
  const router = useRouter();
  const { lastActiveTab, depth, decrementDepth } = useContext(NavigationContext);

  return useCallback(() => {
    if (depth.current <= 1) {
      // First screen above tabs — go back to the tab
      depth.current = 0;
      router.replace(lastActiveTab.current as any);
    } else {
      // Stacked screen — normal back
      decrementDepth();
      router.back();
    }
  }, [router, lastActiveTab, depth, decrementDepth]);
}

/**
 * Push a top-level route and track depth.
 */
export function useTrackedPush() {
  const router = useRouter();
  const { incrementDepth } = useContext(NavigationContext);

  return useCallback((path: string) => {
    incrementDepth();
    router.push(path as any);
  }, [router, incrementDepth]);
}
