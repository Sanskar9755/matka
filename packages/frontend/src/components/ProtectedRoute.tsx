/**
 * ProtectedRoute component.
 *
 * Reads the JWT from localStorage, decodes the role, and:
 * - Redirects unauthenticated users to /login
 * - Redirects users with the wrong role to their correct panel
 * - Renders children if role matches
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

interface ProtectedRouteProps {
  /** The role required to access this route */
  requiredRole: string;
  children: React.ReactNode;
}

const ROLE_HOME: Record<string, string> = {
  user: '/user/lobby',
  admin: '/admin/dashboard',
  superadmin: '/superadmin/admins',
};

export function ProtectedRoute({ requiredRole, children }: ProtectedRouteProps): React.ReactElement {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== requiredRole) {
    const redirect = ROLE_HOME[user.role] ?? '/login';
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}
