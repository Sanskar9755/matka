/**
 * Login page.
 * - Shows login form always (no auto-redirect)
 * - On successful login, redirects to role-specific panel
 * - Token expires in 30 min → user is redirected back here
 */
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import api from '../utils/api.js';

interface LoginResponse {
  data: {
    accessToken: string;
  };
}

const ROLE_HOME: Record<string, string> = {
  user: '/user/lobby',
  admin: '/admin/dashboard',
  superadmin: '/superadmin/admins',
};

export default function Login(): React.ReactElement {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.post<LoginResponse>('/auth/login', {
        username: username.trim(),
        password,
      });
      const token = res.data.data.accessToken;
      login(token);

      // Decode role from token for redirect
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1])) as { role: string };
      const dest = ROLE_HOME[payload.role] ?? '/login';
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(
        axiosErr.response?.data?.error?.message ?? 'Login failed. Please check your credentials.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 to-indigo-800 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-center text-indigo-700 dark:text-indigo-400 mb-2">
          Matka Platform
        </h1>
        <p className="text-center text-xs text-gray-400 mb-6">Session expires in 30 minutes</p>

        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} noValidate autoComplete="off">
          <div className="mb-4">
            <label htmlFor="login-username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <input
              id="login-username"
              name="login-username"
              type="text"
              autoComplete="off"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter username"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input
              id="login-password"
              name="login-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-3 text-sm transition-colors min-h-[44px]"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Don't have an account?{' '}
          <Link to="/register" className="text-indigo-600 hover:underline font-medium">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
