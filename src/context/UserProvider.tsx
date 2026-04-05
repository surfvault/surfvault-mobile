import React, { createContext, useContext, useEffect, useState } from 'react';

interface User {
  id: string;
  handle: string;
  name?: string;
  bio?: string;
  picture?: string;
  type?: string;
  access?: string;
  active?: boolean;
  onboarded?: boolean;
  status_note?: string;
  status_note_set_at?: string;
  chargebee_customer_id?: string;
  current_storage?: number;
  storage_limit?: number;
  verified?: boolean;
  coordinates?: { lat: number; lon: number };
  tags?: string[];
  instagram?: string;
  youtube?: string;
  website?: string;
  favorites?: Array<{ id: string; name: string }>;
  my_spots?: Array<{ id: string; name: string }>;
  following_count?: number;
  follower_count?: number;
  recentSearches?: Array<{
    itemType: string;
    surfBreak?: { id: string; name: string; region?: string; country_code?: string; surf_break_identifier?: string };
    user?: { id: string; handle: string; name?: string; picture?: string };
  }>;
  [key: string]: unknown;
}

interface UserContextType {
  user: User | null;
  setCurrentUser: (user: User | null) => void;
}

const UsersContext = createContext<UserContextType>({
  user: null,
  setCurrentUser: () => {},
});

export function UserProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User | null;
}) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  return (
    <UsersContext.Provider value={{ user: currentUser, setCurrentUser }}>
      {children}
    </UsersContext.Provider>
  );
}

export const useUser = () => useContext(UsersContext);

export default UsersContext;
