/**
 * Authentication context.
 *
 * Provides { user, token, login, logout } to the entire app.
 * JWT is stored in localStorage under the key "matka_token".
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { jwtDecode } from '../utils/jwt.js';
import type { JwtPayload } from '@matka/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  userId: string;
  role: string;
  adminId?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: () => undefined,
  logout: () => undefined,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'matka_token';

function decodeToken(token: string): AuthUser | null {
  try {
    const payload = jwtDecode(token) as unknown as JwtPayload;
    return {
      userId: payload.userId,
      role: payload.role as string,
      adminId: payload.adminId,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });

  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    return stored ? decodeToken(stored) : null;
  });

  const login = useCallback((newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(decodeToken(newToken));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
