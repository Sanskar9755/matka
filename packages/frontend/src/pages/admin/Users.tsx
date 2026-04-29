/**
 * Admin user management page — /admin/users
 *
 * Lists users under this admin. Click to view profile.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface UserSummary {
  id: string;
  username: string;
  is_active: boolean;
  created_at: string;
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

  useEffect(() => {
    api
      .get<UsersResponse>('/admin/users')
      .then((res) => {
        setUsers(res.data.data.users);
      })
      .catch(() => {
        setError('Failed to load users.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

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

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Users</h1>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
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
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={selectedUser.is_active ? 'text-green-600' : 'text-red-600'}>
                  {selectedUser.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Joined</span>
                <span>{new Date(selectedUser.created_at).toLocaleDateString()}</span>
              </div>
              {selectedUser.wallet && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Balance</span>
                    <span className="font-semibold">{selectedUser.wallet.balance_points.toLocaleString()} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Available</span>
                    <span>{selectedUser.wallet.available_points.toLocaleString()} pts</span>
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

      <div className="space-y-2">
        {users.map((user) => (
          <button
            key={user.id}
            onClick={() => void viewProfile(user.id)}
            disabled={profileLoading}
            className="w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between hover:shadow-sm transition-shadow min-h-[44px]"
          >
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{user.username}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Joined {new Date(user.created_at).toLocaleDateString()}
              </p>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                user.is_active
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
              }`}
            >
              {user.is_active ? 'Active' : 'Inactive'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
