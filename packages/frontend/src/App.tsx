/**
 * Root application component.
 *
 * Sets up React Router v6 with role-based routing and the AuthContext provider.
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { LoadingSpinner } from './components/LoadingSpinner.js';

// ---------------------------------------------------------------------------
// Lazy-loaded pages
// ---------------------------------------------------------------------------

// Auth
const Login = lazy(() => import('./pages/Login.js'));
const Register = lazy(() => import('./pages/Register.js'));

// User panel
const UserLayout = lazy(() => import('./components/Layout.js'));
const Lobby = lazy(() => import('./pages/user/Lobby.js'));
const BetPage = lazy(() => import('./pages/user/BetPage.js'));
const History = lazy(() => import('./pages/user/History.js'));
const Wallet = lazy(() => import('./pages/user/Wallet.js'));

// Admin panel
const AdminUsers = lazy(() => import('./pages/admin/Users.js'));
const AdminTransactions = lazy(() => import('./pages/admin/Transactions.js'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard.js'));
const AdminSettings = lazy(() => import('./pages/admin/Settings.js'));

// SuperAdmin panel
const SuperAdminAdmins = lazy(() => import('./pages/superadmin/Admins.js'));
const SuperAdminAnalytics = lazy(() => import('./pages/superadmin/Analytics.js'));
const SuperAdminConfig = lazy(() => import('./pages/superadmin/Config.js'));
const SuperAdminMarkets = lazy(() => import('./pages/superadmin/Markets.js'));

// ---------------------------------------------------------------------------
// Simple wrapper layouts for admin/superadmin panels
// ---------------------------------------------------------------------------

function AdminLayout(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <span className="text-lg font-bold text-indigo-700 dark:text-indigo-400">Matka Admin</span>
      </header>
      <main className="p-0">
        <Outlet />
      </main>
    </div>
  );
}

function SuperAdminLayout(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <span className="text-lg font-bold text-purple-700 dark:text-purple-400">Matka SuperAdmin</span>
      </header>
      <main className="p-0">
        <Outlet />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App(): React.ReactElement {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* User panel */}
            <Route
              path="/user"
              element={
                <ProtectedRoute requiredRole="user">
                  <UserLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="lobby" replace />} />
              <Route path="lobby" element={<Lobby />} />
              <Route path="bet/:marketId" element={<BetPage />} />
              <Route path="history" element={<History />} />
              <Route path="wallet" element={<Wallet />} />
            </Route>

            {/* Admin panel */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="transactions" element={<AdminTransactions />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="dashboard/:marketId" element={<AdminDashboard />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            {/* SuperAdmin panel */}
            <Route
              path="/superadmin"
              element={
                <ProtectedRoute requiredRole="superadmin">
                  <SuperAdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="admins" replace />} />
              <Route path="admins" element={<SuperAdminAdmins />} />
              <Route path="analytics" element={<SuperAdminAnalytics />} />
              <Route path="config" element={<SuperAdminConfig />} />
              <Route path="markets" element={<SuperAdminMarkets />} />
            </Route>

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
