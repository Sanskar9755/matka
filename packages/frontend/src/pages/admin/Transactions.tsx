/**
 * Admin transaction approval page — /admin/transactions
 *
 * Lists pending transactions. Approve/Reject with optimistic UI update.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface PendingTransaction {
  id: string;
  user_id: string;
  username: string;
  type: string;
  amount_points: number;
  status: string;
  upi_ref: string | null;
  created_at: string;
}

interface TransactionsResponse {
  data: { transactions: PendingTransaction[] };
}

const TX_TYPE_LABELS: Record<string, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
};

export default function AdminTransactions(): React.ReactElement {
  const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TransactionsResponse>('/admin/transactions/pending')
      .then((res) => {
        setTransactions(res.data.data.transactions);
      })
      .catch(() => {
        setError('Failed to load transactions.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function handleAction(txId: string, action: 'approve' | 'reject'): Promise<void> {
    setActionLoading(txId);

    // Optimistic update — remove from list immediately
    setTransactions((prev) => prev.filter((t) => t.id !== txId));

    try {
      await api.post(`/admin/transactions/${txId}/${action}`);
    } catch (err: unknown) {
      // Revert optimistic update on failure
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message ?? `Failed to ${action} transaction.`);
      // Re-fetch to restore correct state
      api
        .get<TransactionsResponse>('/admin/transactions/pending')
        .then((res) => setTransactions(res.data.data.transactions))
        .catch(() => undefined);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        Pending Transactions
      </h1>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {transactions.length === 0 && !error && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">
          No pending transactions.
        </p>
      )}

      <div className="space-y-3">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {tx.username}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(tx.created_at).toLocaleString()}
                </p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  tx.type === 'deposit'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                }`}
              >
                {TX_TYPE_LABELS[tx.type] ?? tx.type}
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
              <span>
                Amount: <span className="font-semibold text-gray-900 dark:text-gray-100">{tx.amount_points.toLocaleString()} pts</span>
              </span>
              {tx.upi_ref && (
                <span>
                  UPI: <span className="font-mono">{tx.upi_ref}</span>
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void handleAction(tx.id, 'approve')}
                disabled={actionLoading === tx.id}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition-colors min-h-[44px]"
              >
                Approve
              </button>
              <button
                onClick={() => void handleAction(tx.id, 'reject')}
                disabled={actionLoading === tx.id}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition-colors min-h-[44px]"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
