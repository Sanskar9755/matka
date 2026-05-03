/**
 * ProtectedRoute component.
 *
 * - If no token → redirect to /login
 * - If token expired → clear token, redirect to /login
 * - If wrong role → redirect to correct panel
 * - If valid → render children (page refresh stays on same page)
 */

import React, { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

interface ProtectedRouteProps {
  requiredRole: string;
  children: React.ReactNode;
}

const ROLE_HOME: Record<string, string> = {
  user: '/user/lobby',
  admin: '/admin/dashboard',
  superadmin: '/superadmin/admins',
};

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1])) as { exp?: number };
    if (!payload.exp) return false;
    // Expired if current time > expiry time
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export function ProtectedRoute({ requiredRole, children }: ProtectedRouteProps): React.ReactElement {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  // Check token expiry every 5 minutes
  useEffect(() => {
    if (!token) return;
    const checkExpiry = () => {
      if (isTokenExpired(token)) {
        logout();
        navigate('/login', { replace: true });
      }
    };
    checkExpiry();
    const interval = setInterval(checkExpiry, 5 * 60_000); // every 5 min
    return () => clearInterval(interval);
  }, [token, logout, navigate]);

  // No token at all → go to login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Token expired → go to login
  if (isTokenExpired(token)) {
    logout();
    return <Navigate to="/login" replace />;
  }

  // No user decoded → go to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wrong role → redirect to correct panel
  if (user.role !== requiredRole) {
    const redirect = ROLE_HOME[user.role] ?? '/login';
    return <Navigate to={redirect} replace />;
  }

  // All good — render the page (refresh stays on same page)
  return <>{children}</>;
}
