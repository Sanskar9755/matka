/**
 * Admin user management page — /admin/users
 *
 * Lists users under this admin with wallet balance.
 * Auto-refreshes every 10 seconds.
 */
import React, { useEffect, useState, useCallback } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface UserSummary {
  id: string;
  username: string;
  is_active: boolean;
  created_at: string;
  balance_points: number;
  held_points: number;
  available_points: number;
}

interface UserProfile {
  id: string;
  username: string;
  is_active: boolean;
  created_at: string;
  wallet: {
    balance_points: number;
    held_points: number;
    available_points: number;
  } | null;
}

interface UsersResponse {
  data: { users: UserSummary[] };
}

interface UserProfileResponse {
  data: { user: UserProfile };
}

export default function AdminUsers(): React.ReactElement {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchUsers = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api
      .get<UsersResponse>('/admin/users')
      .then((res) => {
        setUsers(res.data.data.users);
        setLastUpdated(new Date());
      })
      .catch(() => {
        if (!silent) setError('Failed to load users.');
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  // Initial load
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUsers(true); // silent refresh
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  async function viewProfile(userId: string): Promise<void> {
    setProfileLoading(true);
    try {
      const res = await api.get<UserProfileResponse>(`/admin/users/${userId}`);
      setSelectedUser(res.data.data.user);
    } catch {
      setError('Failed to load user profile.');
    } finally {
      setProfileLoading(false);
    }
  }

  // Total wallet balance across all users
  const totalBalance = users.reduce((sum, u) => sum + u.balance_points, 0);
  const totalAvailable = users.reduce((sum, u) => sum + u.available_points, 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Users</h1>
        <button
          onClick={() => fetchUsers()}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline min-h-[44px] px-2"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Last updated */}
      <p className="text-xs text-gray-400 mb-4">
        Last updated: {lastUpdated.toLocaleTimeString()} · Auto-refreshes every 10s
      </p>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Summary cards */}
      {users.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-indigo-50 dark:bg-indigo-900 rounded-xl p-3 text-center">
            <p className="text-xs text-indigo-600 dark:text-indigo-300 mb-1">Total Users</p>
            <p className="text-xl font-bold text-indigo-800 dark:text-indigo-100">{users.length}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900 rounded-xl p-3 text-center">
            <p className="text-xs text-green-600 dark:text-green-300 mb-1">Total Balance</p>
            <p className="text-xl font-bold text-green-800 dark:text-green-100">{totalBalance.toLocaleString()}</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900 rounded-xl p-3 text-center">
            <p className="text-xs text-blue-600 dark:text-blue-300 mb-1">Available</p>
            <p className="text-xl font-bold text-blue-800 dark:text-blue-100">{totalAvailable.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* User profile modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {selectedUser.username}
              </h2>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center text-xl"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={selectedUser.is_active ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {selectedUser.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Joined</span>
                <span>{new Date(selectedUser.created_at).toLocaleDateString()}</span>
              </div>
              {selectedUser.wallet && (
                <>
                  <div className="border-t pt-3 mt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Wallet</p>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total Balance</span>
                        <span className="font-bold text-indigo-600">{selectedUser.wallet.balance_points.toLocaleString()} pts</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Held (pending withdrawal)</span>
                        <span className="text-orange-500">{selectedUser.wallet.held_points.toLocaleString()} pts</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Available</span>
                        <span className="font-bold text-green-600">{selectedUser.wallet.available_points.toLocaleString()} pts</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {users.length === 0 && !error && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">No users found.</p>
      )}

      {/* Users table */}
      {users.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Available</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, idx) => (
                <tr
                  key={user.id}
                  onClick={() => void viewProfile(user.id)}
                  className={`cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors border-t border-gray-100 dark:border-gray-700 ${
                    idx === 0 ? 'border-t-0' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{user.username}</div>
                    <div className="text-xs text-gray-400">{new Date(user.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">
                      {user.balance_points.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">pts</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {user.available_points.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">pts</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      user.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {profileLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
}
