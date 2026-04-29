/**
 * Wallet page — /user/wallet
 *
 * Shows balance, held points, available points.
 * Deposit form (UPI ref + amount) and withdrawal form (amount).
 * Transaction history list.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface WalletBalance {
  balance_points: number;
  held_points: number;
  available_points: number;
}

interface Transaction {
  id: string;
  type: string;
  amount_points: number;
  status: string;
  upi_ref: string | null;
  created_at: string;
}

interface BalanceResponse {
  data: WalletBalance;
}

interface TransactionsResponse {
  data: { transactions: Transaction[] };
}

const TX_TYPE_LABELS: Record<string, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  bet_deduction: 'Bet',
  winning_credit: 'Winning',
};

const TX_STATUS_STYLES: Record<string, string> = {
  pending: 'text-yellow-600 dark:text-yellow-400',
  approved: 'text-green-600 dark:text-green-400',
  completed: 'text-green-600 dark:text-green-400',
  rejected: 'text-red-600 dark:text-red-400',
};

export default function Wallet(): React.ReactElement {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deposit form
  const [upiRef, setUpiRef] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Withdrawal form
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  function fetchData(): void {
    setLoading(true);
    Promise.all([
      api.get<BalanceResponse>('/wallet/balance'),
      api.get<TransactionsResponse>('/wallet/transactions'),
    ])
      .then(([balRes, txRes]) => {
        setBalance(balRes.data.data);
        setTransactions(txRes.data.data.transactions);
      })
      .catch(() => {
        setError('Failed to load wallet data.');
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleDeposit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setDepositError(null);
    setDepositSuccess(false);

    const amount = parseInt(depositAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setDepositError('Please enter a valid amount.');
      return;
    }
    if (!upiRef.trim()) {
      setDepositError('Please enter a UPI reference.');
      return;
    }

    setDepositLoading(true);
    try {
      await api.post('/wallet/deposit', { upiRef: upiRef.trim(), amountPoints: amount });
      setDepositSuccess(true);
      setUpiRef('');
      setDepositAmount('');
      fetchData();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setDepositError(axiosErr.response?.data?.error?.message ?? 'Deposit request failed.');
    } finally {
      setDepositLoading(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setWithdrawError(null);
    setWithdrawSuccess(false);

    const amount = parseInt(withdrawAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError('Please enter a valid amount.');
      return;
    }

    setWithdrawLoading(true);
    try {
      await api.post('/wallet/withdraw', { amountPoints: amount });
      setWithdrawSuccess(true);
      setWithdrawAmount('');
      fetchData();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setWithdrawError(axiosErr.response?.data?.error?.message ?? 'Withdrawal request failed.');
    } finally {
      setWithdrawLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Wallet</h1>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Balance cards */}
      {balance && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-indigo-50 dark:bg-indigo-900 rounded-xl p-3 text-center">
            <p className="text-xs text-indigo-600 dark:text-indigo-300 mb-1">Balance</p>
            <p className="text-lg font-bold text-indigo-800 dark:text-indigo-100">
              {balance.balance_points.toLocaleString()}
            </p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900 rounded-xl p-3 text-center">
            <p className="text-xs text-orange-600 dark:text-orange-300 mb-1">Held</p>
            <p className="text-lg font-bold text-orange-800 dark:text-orange-100">
              {balance.held_points.toLocaleString()}
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900 rounded-xl p-3 text-center">
            <p className="text-xs text-green-600 dark:text-green-300 mb-1">Available</p>
            <p className="text-lg font-bold text-green-800 dark:text-green-100">
              {balance.available_points.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Deposit form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Deposit</h2>

        {depositSuccess && (
          <p className="text-sm text-green-600 dark:text-green-400 mb-2">
            Deposit request submitted. Awaiting admin approval.
          </p>
        )}
        {depositError && (
          <div className="mb-2">
            <ErrorBanner message={depositError} onDismiss={() => setDepositError(null)} />
          </div>
        )}

        <form onSubmit={(e) => void handleDeposit(e)} className="space-y-3">
          <div>
            <label htmlFor="upiRef" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              UPI Reference
            </label>
            <input
              id="upiRef"
              type="text"
              value={upiRef}
              onChange={(e) => setUpiRef(e.target.value)}
              placeholder="Enter UPI transaction ID"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="depositAmount" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Amount (points)
            </label>
            <input
              id="depositAmount"
              type="number"
              min={1}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={depositLoading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition-colors min-h-[44px]"
          >
            {depositLoading ? 'Submitting…' : 'Request Deposit'}
          </button>
        </form>
      </div>

      {/* Withdrawal form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Withdraw</h2>

        {withdrawSuccess && (
          <p className="text-sm text-green-600 dark:text-green-400 mb-2">
            Withdrawal request submitted. Awaiting admin approval.
          </p>
        )}
        {withdrawError && (
          <div className="mb-2">
            <ErrorBanner message={withdrawError} onDismiss={() => setWithdrawError(null)} />
          </div>
        )}

        <form onSubmit={(e) => void handleWithdraw(e)} className="space-y-3">
          <div>
            <label htmlFor="withdrawAmount" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Amount (points)
            </label>
            <input
              id="withdrawAmount"
              type="number"
              min={1}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={withdrawLoading}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition-colors min-h-[44px]"
          >
            {withdrawLoading ? 'Submitting…' : 'Request Withdrawal'}
          </button>
        </form>
      </div>

      {/* Transaction history */}
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Transaction History</h2>

      {transactions.length === 0 && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">
          No transactions yet.
        </p>
      )}

      <div className="space-y-2">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {TX_TYPE_LABELS[tx.type] ?? tx.type}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(tx.created_at).toLocaleString()}
                {tx.upi_ref && ` · ${tx.upi_ref}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {tx.amount_points.toLocaleString()} pts
              </p>
              <p className={`text-xs capitalize ${TX_STATUS_STYLES[tx.status] ?? ''}`}>
                {tx.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
