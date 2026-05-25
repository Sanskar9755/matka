/**
 * Admin user management page — /admin/users
 *
 * Lists users under this admin with wallet balance.
 * Admin can directly add points to users from their allocated balance.
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

interface PointCreditRecord {
  id: string;
  user_id: string;
  username: string;
  amount: number;
  note: string | null;
  created_at: string;
}

interface UsersResponse {
  data: { users: UserSummary[] };
}

interface PointCreditHistoryResponse {
  data: {
    credits: PointCreditRecord[];
    admin_allocated: number;
    admin_used: number;
    admin_available: number;
  };
}

export default function AdminUsers(): React.ReactElement {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Point credit state
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditUserId, setCreditUserId] = useState('');
  const [creditUsername, setCreditUsername] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [creditLoading, setCreditLoading] = useState(false);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<PointCreditRecord[]>([]);
  const [adminAllocated, setAdminAllocated] = useState(0);
  const [adminUsed, setAdminUsed] = useState(0);
  const [adminAvailable, setAdminAvailable] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchUsers = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.get<UsersResponse>('/admin/users')
      .then((res) => { setUsers(res.data.data.users); setLastUpdated(new Date()); })
      .catch(() => { if (!silent) setError('Failed to load users.'); })
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  const fetchHistory = useCallback(() => {
    setHistoryLoading(true);
    api.get<PointCreditHistoryResponse>('/admin/point-credits')
      .then((res) => {
        setHistory(res.data.data.credits);
        setAdminAllocated(Number(res.data.data.admin_allocated));
        setAdminUsed(Number(res.data.data.admin_used));
        setAdminAvailable(Number(res.data.data.admin_available));
      })
      .catch(() => setError('Failed to load history.'))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { const id = setInterval(() => fetchUsers(true), 10000); return () => clearInterval(id); }, [fetchUsers]);

  function openCreditModal(userId: string, username: string): void {
    setCreditUserId(userId);
    setCreditUsername(username);
    setCreditAmount('');
    setCreditNote('');
    setShowCreditModal(true);
  }

  async function handleCreditPoints(): Promise<void> {
    const amount = parseInt(creditAmount);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    setCreditLoading(true);
    try {
      await api.post(`/admin/users/${creditUserId}/credit-points`, { amount, note: creditNote || undefined });
      setSuccess(`✅ ${amount} points added to ${creditUsername}`);
      setShowCreditModal(false);
      fetchUsers(true);
      if (showHistory) fetchHistory();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err?.response?.data?.error?.message ?? 'Failed to credit points.');
    } finally {
      setCreditLoading(false);
    }
  }

  function openHistory(): void {
    setShowHistory(true);
    fetchHistory();
  }

  const totalBalance = users.reduce((s, u) => s + u.balance_points, 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Users</h1>
        <div className="flex gap-2">
          <button onClick={openHistory} className="text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg font-medium min-h-[36px]">
            📋 Point History
          </button>
          <button onClick={() => fetchUsers()} className="text-xs text-indigo-600 hover:underline min-h-[36px] px-2">
            ↻ Refresh
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">Last updated: {lastUpdated.toLocaleTimeString()}</p>

      {error && <div className="mb-3"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      {success && (
        <div className="mb-3 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm flex justify-between">
          {success}
          <button onClick={() => setSuccess(null)} className="text-green-500 ml-2">✕</button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-indigo-50 dark:bg-indigo-900 rounded-xl p-3 text-center">
          <p className="text-xs text-indigo-600 dark:text-indigo-300 mb-1">Total Users</p>
          <p className="text-xl font-bold text-indigo-800 dark:text-indigo-100">{users.length}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900 rounded-xl p-3 text-center">
          <p className="text-xs text-green-600 dark:text-green-300 mb-1">Total Balance</p>
          <p className="text-xl font-bold text-green-800 dark:text-green-100">{totalBalance.toLocaleString()}</p>
        </div>
      </div>

      {/* Users list */}
      {users.length === 0 ? (
        <p className="text-center text-gray-500 py-12">No users found.</p>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{user.username}</p>
                  <p className="text-xs text-gray-400">Joined {new Date(user.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Balance</p>
                    <p className="font-bold text-indigo-600">{user.balance_points.toLocaleString()} pts</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Available</p>
                    <p className="font-semibold text-green-600">{user.available_points.toLocaleString()} pts</p>
                  </div>
                </div>
                <button
                  onClick={() => openCreditModal(user.id, user.username)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg min-h-[36px] transition-colors"
                >
                  + Add Points
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Credit Points Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add Points</h2>
              <button onClick={() => setShowCreditModal(false)} className="text-gray-400 hover:text-gray-600 text-xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Adding points to <span className="font-semibold text-indigo-600">{creditUsername}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (Points)</label>
                <input
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  placeholder="e.g. Deposit via UPI"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={() => void handleCreditPoints()}
                disabled={creditLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
              >
                {creditLoading ? 'Adding...' : 'Add Points'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Point Credit History</h2>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
            </div>

            {/* Admin balance summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <p className="text-xs text-blue-600">Allocated</p>
                <p className="font-bold text-blue-800">{adminAllocated.toLocaleString()}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-2 text-center">
                <p className="text-xs text-orange-600">Used</p>
                <p className="font-bold text-orange-800">{adminUsed.toLocaleString()}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2 text-center">
                <p className="text-xs text-green-600">Available</p>
                <p className="font-bold text-green-800">{adminAvailable.toLocaleString()}</p>
              </div>
            </div>

            {historyLoading ? <LoadingSpinner /> : (
              <div className="overflow-y-auto flex-1">
                {history.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No point credits yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white dark:bg-gray-800">
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                        <th className="pb-2">User</th>
                        <th className="pb-2 text-right">Amount</th>
                        <th className="pb-2">Note</th>
                        <th className="pb-2 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((c) => (
                        <tr key={c.id} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{c.username}</td>
                          <td className="py-2 text-right font-bold text-indigo-600">+{Number(c.amount).toLocaleString()}</td>
                          <td className="py-2 text-xs text-gray-400">{c.note ?? '-'}</td>
                          <td className="py-2 text-right text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
