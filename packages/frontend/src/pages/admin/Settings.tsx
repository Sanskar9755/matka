/**
 * Admin settings page — /admin/settings
 *
 * Shows admin's referral link (copy button).
 * Min/max bet points form → PUT /api/admin/settings/bet-limits
 */
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import api from '../../utils/api.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

export default function AdminSettings(): React.ReactElement {
  const { user } = useAuth();
  const [minBet, setMinBet] = useState('10');
  const [maxBet, setMaxBet] = useState('10000');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const referralLink = user
    ? `${window.location.origin}/register?ref=${user.adminId ?? user.userId}`
    : '';

  async function copyReferralLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const input = document.createElement('input');
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const min = parseInt(minBet, 10);
    const max = parseInt(maxBet, 10);

    if (isNaN(min) || min <= 0) {
      setError('Minimum bet must be a positive number.');
      return;
    }
    if (isNaN(max) || max <= 0) {
      setError('Maximum bet must be a positive number.');
      return;
    }
    if (min > max) {
      setError('Minimum bet cannot exceed maximum bet.');
      return;
    }

    setLoading(true);
    try {
      await api.put('/admin/settings/bet-limits', {
        min_bet_points: min,
        max_bet_points: max,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message ?? 'Failed to update bet limits.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>

      {/* Referral link */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Referral Link</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Share this link with users to register under your account.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none"
          />
          <button
            onClick={() => void copyReferralLink()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors min-h-[44px]"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Bet limits form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Bet Limits</h2>

        {success && (
          <p className="text-sm text-green-600 dark:text-green-400 mb-3">
            Bet limits updated successfully.
          </p>
        )}
        {error && (
          <div className="mb-3">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="minBet" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Minimum Bet (points)
            </label>
            <input
              id="minBet"
              type="number"
              min={1}
              value={minBet}
              onChange={(e) => setMinBet(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="maxBet" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Maximum Bet (points)
            </label>
            <input
              id="maxBet"
              type="number"
              min={1}
              value={maxBet}
              onChange={(e) => setMaxBet(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-3 text-sm transition-colors min-h-[44px]"
          >
            {loading ? 'Saving…' : 'Save Limits'}
          </button>
        </form>
      </div>
    </div>
  );
}
