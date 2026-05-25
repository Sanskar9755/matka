/**
 * SuperAdmin admin management page — /superadmin/admins
 *
 * Lists all admins. Create admin form. Activate/deactivate toggle.
 * Reset password. Delete admin. Allocate points to admin.
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

interface AdminBalance {
  id: string;
  username: string;
  allocated_points: number;
  used_points: number;
  available_points: number;
}

interface AllocationRecord {
  id: string;
  admin_id: string;
  admin_username: string;
  amount: number;
  note: string | null;
  created_at: string;
}

interface AdminsResponse { data: { admins: Admin[] }; }
interface AdminBalancesResponse { data: { admins: AdminBalance[] }; }
interface PointHistoryResponse { data: { allocations: AllocationRecord[] }; }

export default function SuperAdminAdmins(): React.ReactElement {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset password modal
  const [resetAdmin, setResetAdmin] = useState<Admin | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Delete confirm
  const [deleteAdmin, setDeleteAdmin] = useState<Admin | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Allocate points
  const [allocateAdmin, setAllocateAdmin] = useState<Admin | null>(null);
  const [allocateAmount, setAllocateAmount] = useState('');
  const [allocateNote, setAllocateNote] = useState('');
  const [allocateLoading, setAllocateLoading] = useState(false);
  const [allocateError, setAllocateError] = useState<string | null>(null);

  // Point history
  const [showPointHistory, setShowPointHistory] = useState(false);
  const [pointHistory, setPointHistory] = useState<AllocationRecord[]>([]);
  const [adminBalances, setAdminBalances] = useState<AdminBalance[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  function fetchAdmins(): void {
    api
      .get<AdminsResponse>('/superadmin/admins')
      .then((res) => { setAdmins(res.data.data.admins); })
      .catch(() => { setError('Failed to load admins.'); })
      .finally(() => { setLoading(false); });
  }

  useEffect(() => { fetchAdmins(); }, []);

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
      await api.post('/superadmin/admins', { username: newUsername.trim(), password: newPassword });
      setNewUsername(''); setNewPassword(''); setShowCreate(false);
      fetchAdmins();
      setSuccessMsg('Admin created successfully!');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setCreateError(axiosErr.response?.data?.error?.message ?? 'Failed to create admin.');
    } finally {
      setCreateLoading(false);
    }
  }

  async function toggleStatus(admin: Admin): Promise<void> {
    try {
      await api.patch(`/superadmin/admins/${admin.id}/status`, { is_active: !admin.is_active });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, is_active: !a.is_active } : a)));
    } catch {
      setError('Failed to update admin status.');
    }
  }

  async function handleResetPassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!resetAdmin) return;
    setResetError(null);
    if (resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    setResetLoading(true);
    try {
      await api.put(`/superadmin/admins/${resetAdmin.id}`, { password: resetPassword });
      setResetAdmin(null); setResetPassword('');
      setSuccessMsg(`Password reset for ${resetAdmin.username}!`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setResetError(axiosErr.response?.data?.error?.message ?? 'Failed to reset password.');
    } finally {
      setResetLoading(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteAdmin) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/superadmin/admins/${deleteAdmin.id}`);
      setAdmins((prev) => prev.filter((a) => a.id !== deleteAdmin.id));
      setDeleteAdmin(null);
      setSuccessMsg(`Admin "${deleteAdmin.username}" deleted.`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message ?? 'Failed to delete admin.');
      setDeleteAdmin(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleAllocatePoints(): Promise<void> {
    if (!allocateAdmin) return;
    const amount = parseInt(allocateAmount);
    if (!amount || amount <= 0) { setAllocateError('Enter a valid amount.'); return; }
    setAllocateLoading(true);
    try {
      await api.post(`/superadmin/admins/${allocateAdmin.id}/allocate-points`, { amount, note: allocateNote || undefined });
      setSuccessMsg(`✅ ${amount} points allocated to ${allocateAdmin.username}`);
      setAllocateAdmin(null);
      setAllocateAmount('');
      setAllocateNote('');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setAllocateError(axiosErr.response?.data?.error?.message ?? 'Failed to allocate points.');
    } finally {
      setAllocateLoading(false);
    }
  }

  function openPointHistory(): void {
    setShowPointHistory(true);
    setHistoryLoading(true);
    Promise.all([
      api.get<PointHistoryResponse>('/superadmin/admin-point-history'),
      api.get<AdminBalancesResponse>('/superadmin/admin-balances'),
    ]).then(([histRes, balRes]) => {
      setPointHistory(histRes.data.data.allocations);
      setAdminBalances(balRes.data.data.admins);
    }).catch(() => setError('Failed to load point history.'))
      .finally(() => setHistoryLoading(false));
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Admins</h1>
        <div className="flex gap-2">
          <button
            onClick={openPointHistory}
            className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-sm font-medium rounded-lg px-3 py-2 transition-colors min-h-[44px]"
          >
            💰 Point History
          </button>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors min-h-[44px]"
          >
            {showCreate ? 'Cancel' : '+ New Admin'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm font-medium flex items-center justify-between">
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-green-500 font-bold ml-2">×</button>
        </div>
      )}

      {/* Create admin form */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Create Admin</h2>
          {createError && <div className="mb-3"><ErrorBanner message={createError} onDismiss={() => setCreateError(null)} /></div>}
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
              <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Admin username" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Min. 8 characters" />
            </div>
            <button type="submit" disabled={createLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition-colors min-h-[44px]">
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
          <div key={admin.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{admin.username}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Referral: <span className="font-mono">{admin.referral_code}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Bet limits: {admin.min_bet_points}–{admin.max_bet_points} pts
                </p>
              </div>
              <button onClick={() => void toggleStatus(admin)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors min-h-[36px] ${
                  admin.is_active
                    ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                    : 'bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700'
                }`}>
                {admin.is_active ? '✅ Active' : '❌ Inactive'}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => { setAllocateAdmin(admin); setAllocateAmount(''); setAllocateNote(''); setAllocateError(null); }}
                className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold rounded-lg py-2 px-3 transition-colors">
                💰 Allocate Points
              </button>
              <button
                onClick={() => { setResetAdmin(admin); setResetPassword(''); setResetError(null); }}
                className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg py-2 px-3 transition-colors">
                🔑 Reset Password
              </button>
              {admin.username !== 'superadmin' && (
                <button
                  onClick={() => setDeleteAdmin(admin)}
                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg py-2 px-3 transition-colors">
                  🗑️ Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reset Password Modal */}
      {resetAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Reset Password</h2>
            <p className="text-sm text-gray-500 mb-4">Admin: <span className="font-semibold text-gray-700">{resetAdmin.username}</span></p>
            {resetError && <div className="mb-3"><ErrorBanner message={resetError} onDismiss={() => setResetError(null)} /></div>}
            <form onSubmit={(e) => void handleResetPassword(e)} className="space-y-3">
              <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="New password (min. 8 chars)" autoFocus />
              <div className="flex gap-2">
                <button type="button" onClick={() => setResetAdmin(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={resetLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm">
                  {resetLoading ? 'Saving…' : 'Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-red-600 mb-2">⚠️ Delete Admin</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Are you sure you want to delete <span className="font-bold">{deleteAdmin.username}</span>?
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteAdmin(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg py-2 text-sm">
                Cancel
              </button>
              <button onClick={() => void handleDelete()} disabled={deleteLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm">
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Allocate Points Modal */}
      {allocateAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Allocate Points</h2>
              <button onClick={() => setAllocateAdmin(null)} className="text-gray-400 hover:text-gray-600 text-xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Allocating points to admin: <span className="font-semibold text-indigo-600">{allocateAdmin.username}</span>
            </p>
            {allocateError && <div className="mb-3"><ErrorBanner message={allocateError} onDismiss={() => setAllocateError(null)} /></div>}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (Points)</label>
                <input
                  type="number"
                  value={allocateAmount}
                  onChange={(e) => setAllocateAmount(e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  min="1"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={allocateNote}
                  onChange={(e) => setAllocateNote(e.target.value)}
                  placeholder="e.g. Monthly allocation"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAllocateAdmin(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg py-2 text-sm">
                  Cancel
                </button>
                <button
                  onClick={() => void handleAllocatePoints()}
                  disabled={allocateLoading}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg py-2 text-sm transition-colors">
                  {allocateLoading ? 'Allocating...' : 'Allocate Points'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Point History Modal */}
      {showPointHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Point Allocation History</h2>
              <button onClick={() => setShowPointHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
            </div>

            {historyLoading ? <LoadingSpinner /> : (
              <>
                {/* Admin balances summary */}
                {adminBalances.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Admin Balances</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                            <th className="pb-2">Admin</th>
                            <th className="pb-2 text-right">Allocated</th>
                            <th className="pb-2 text-right">Used</th>
                            <th className="pb-2 text-right">Available</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminBalances.map((a) => (
                            <tr key={a.id} className="border-b border-gray-100 last:border-0">
                              <td className="py-1.5 font-medium text-gray-900 dark:text-gray-100">{a.username}</td>
                              <td className="py-1.5 text-right text-blue-600 font-semibold">{Number(a.allocated_points).toLocaleString()}</td>
                              <td className="py-1.5 text-right text-orange-600">{Number(a.used_points).toLocaleString()}</td>
                              <td className="py-1.5 text-right text-green-600 font-bold">{Number(a.available_points).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Allocation history */}
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Allocation History</p>
                <div className="overflow-y-auto flex-1">
                  {pointHistory.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No allocations yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white dark:bg-gray-800">
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                          <th className="pb-2">Admin</th>
                          <th className="pb-2 text-right">Amount</th>
                          <th className="pb-2">Note</th>
                          <th className="pb-2 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pointHistory.map((a) => (
                          <tr key={a.id} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{a.admin_username}</td>
                            <td className="py-2 text-right font-bold text-green-600">+{Number(a.amount).toLocaleString()}</td>
                            <td className="py-2 text-xs text-gray-400">{a.note ?? '-'}</td>
                            <td className="py-2 text-right text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
