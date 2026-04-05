import React, { createContext, useContext, useState } from 'react';

interface TabBarContextType {
  tabBarVisible: boolean;
  setTabBarVisible: (visible: boolean) => void;
}

const TabBarContext = createContext<TabBarContextType>({
  tabBarVisible: true,
  setTabBarVisible: () => {},
});

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const [tabBarVisible, setTabBarVisible] = useState(true);

  return (
    <TabBarContext.Provider value={{ tabBarVisible, setTabBarVisible }}>
      {children}
    </TabBarContext.Provider>
  );
}

export const useTabBar = () => useContext(TabBarContext);
