import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, getStoredUser } from '../services/api';

type User = {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'employee';
} | null;

type AuthContextType = {
  user: User;
  loading: boolean;
  login: (username: string, password: string, device_id?: string) => Promise<any>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStoredUser()
      .then(u => setUser(u))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string, device_id?: string) => {
    const u = await apiLogin(username, password, device_id);
    setUser(u);
    return u;
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
