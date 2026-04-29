/**
 * SuperAdmin admin management page — /superadmin/admins
 *
 * Lists all admins. Create admin form. Activate/deactivate toggle.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface Admin {
  id: string;
  username: string;
  referral_code: string;
  is_active: boolean;
  min_bet_points: number;
  max_bet_points: number;
  created_at: string;
}

interface AdminsResponse {
  data: { admins: Admin[] };
}

export default function SuperAdminAdmins(): React.ReactElement {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function fetchAdmins(): void {
    api
      .get<AdminsResponse>('/superadmin/admins')
      .then((res) => {
        setAdmins(res.data.data.admins);
      })
      .catch(() => {
        setError('Failed to load admins.');
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchAdmins();
  }, []);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setCreateError(null);

    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateError('Username and password are required.');
      return;
    }
    if (newPassword.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }

    setCreateLoading(true);
    try {
      await api.post('/superadmin/admins', {
        username: newUsername.trim(),
        password: newPassword,
      });
      setNewUsername('');
      setNewPassword('');
      setShowCreate(false);
      fetchAdmins();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setCreateError(axiosErr.response?.data?.error?.message ?? 'Failed to create admin.');
    } finally {
      setCreateLoading(false);
    }
  }

  async function toggleStatus(admin: Admin): Promise<void> {
    try {
      await api.patch(`/superadmin/admins/${admin.id}/status`, {
        is_active: !admin.is_active,
      });
      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, is_active: !a.is_active } : a)),
      );
    } catch {
      setError('Failed to update admin status.');
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Admins</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors min-h-[44px]"
        >
          {showCreate ? 'Cancel' : '+ New Admin'}
        </button>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Create admin form */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Create Admin</h2>

          {createError && (
            <div className="mb-3">
              <ErrorBanner message={createError} onDismiss={() => setCreateError(null)} />
            </div>
          )}

          <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
            <div>
              <label htmlFor="newUsername" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username
              </label>
              <input
                id="newUsername"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Admin username"
              />
            </div>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Min. 8 characters"
              />
            </div>
            <button
              type="submit"
              disabled={createLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition-colors min-h-[44px]"
            >
              {createLoading ? 'Creating…' : 'Create Admin'}
            </button>
          </form>
        </div>
      )}

      {admins.length === 0 && !error && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">No admins found.</p>
      )}

      <div className="space-y-3">
        {admins.map((admin) => (
          <div
            key={admin.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{admin.username}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Referral: <span className="font-mono">{admin.referral_code}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Bet limits: {admin.min_bet_points}–{admin.max_bet_points} pts
                </p>
              </div>
              <button
                onClick={() => void toggleStatus(admin)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors min-h-[44px] ${
                  admin.is_active
                    ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700 dark:bg-red-900 dark:text-red-300'
                }`}
              >
                {admin.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
