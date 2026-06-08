import { createContext, useContext, useMemo, useState } from 'react';
import { readSessionUser } from '../../services/storageService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readSessionUser());

  const value = useMemo(() => ({
    user,
    setUser,
    isAuthenticated: Boolean(user),
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
