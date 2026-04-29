/**
 * Bet history page — /user/history
 *
 * Chronological list of bets from GET /api/bets/my.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface BetHistoryItem {
  id: string;
  market_name: string;
  bet_type: string;
  selection: string;
  points: number;
  outcome: 'pending' | 'win' | 'loss';
  winning_amount: number;
  placed_at: string;
}

interface BetHistoryResponse {
  data: { bets: BetHistoryItem[] };
}

const OUTCOME_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  win: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  loss: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const BET_TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  jodi: 'Jodi',
  single_panna: 'SP',
  double_panna: 'DP',
  triple_panna: 'TP',
  half_sangam: 'Half Sangam',
  full_sangam: 'Full Sangam',
};

export default function History(): React.ReactElement {
  const [bets, setBets] = useState<BetHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<BetHistoryResponse>('/bets/my')
      .then((res) => {
        setBets(res.data.data.bets);
      })
      .catch(() => {
        setError('Failed to load bet history.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Bet History</h1>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {bets.length === 0 && !error && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">
          No bets placed yet.
        </p>
      )}

      <div className="space-y-3">
        {bets.map((bet) => (
          <div
            key={bet.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                  {bet.market_name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {new Date(bet.placed_at).toLocaleString()}
                </p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${OUTCOME_STYLES[bet.outcome] ?? ''}`}
              >
                {bet.outcome}
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {BET_TYPE_LABELS[bet.bet_type] ?? bet.bet_type}
                </span>
              </span>
              <span>Selection: <span className="font-mono font-medium">{bet.selection}</span></span>
              <span>Points: <span className="font-medium">{bet.points}</span></span>
              {bet.outcome === 'win' && (
                <span className="text-green-600 dark:text-green-400 font-semibold">
                  +{bet.winning_amount}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
