/**
 * Register page.
 * Username + password + referral code form with inline validation.
 */
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import api from '../utils/api.js';

interface RegisterResponse {
  data: {
    accessToken: string;
  };
}

interface FieldErrors {
  username?: string;
  password?: string;
  referralCode?: string;
}

export default function Register(): React.ReactElement {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const errors: FieldErrors = {};

    if (!username.trim()) {
      errors.username = 'Username is required.';
    } else if (username.length < 3) {
      errors.username = 'Username must be at least 3 characters.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }

    if (!referralCode.trim()) {
      errors.referralCode = 'Referral code is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setLoading(true);
    try {
      const res = await api.post<RegisterResponse>('/auth/register', {
        username,
        password,
        referralCode,
      });
      const token = res.data.data.accessToken;
      login(token);
      navigate('/user/lobby', { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setServerError(
        axiosErr.response?.data?.error?.message ?? 'Registration failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 to-indigo-800 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-center text-indigo-700 dark:text-indigo-400 mb-6">
          Create Account
        </h1>

        {serverError && (
          <div className="mb-4">
            <ErrorBanner message={serverError} onDismiss={() => setServerError(null)} />
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          {/* Username */}
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) setFieldErrors((p) => ({ ...p, username: undefined }));
              }}
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                fieldErrors.username ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="Choose a username"
            />
            {fieldErrors.username && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.username}</p>
            )}
          </div>

          {/* Password */}
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
              }}
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                fieldErrors.password ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="Min. 8 characters"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            )}
          </div>

          {/* Referral code */}
          <div className="mb-6">
            <label htmlFor="referralCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Referral Code
            </label>
            <input
              id="referralCode"
              type="text"
              value={referralCode}
              onChange={(e) => {
                setReferralCode(e.target.value);
                if (fieldErrors.referralCode) setFieldErrors((p) => ({ ...p, referralCode: undefined }));
              }}
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                fieldErrors.referralCode ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="Enter referral code"
            />
            {fieldErrors.referralCode && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.referralCode}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-3 text-sm transition-colors min-h-[44px]"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-600 hover:underline font-medium">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
