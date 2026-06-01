/**
 * Bet history page — /user/history
 *
 * Chronological list of bets from GET /api/bets/my.
 * Shows smart status: pending / result_declared / win / loss
 * based on the declared result cycle data.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface ResultData {
  open_panna: string;
  close_panna: string;
  jodi: string;
  open_ank: string;
  close_ank: string;
  declared_at: string;
  calculation_done: boolean;
}

interface BetHistoryItem {
  id: string;
  market_name: string;
  bet_type: string;
  session: string;
  selection: string;
  points: number;
  outcome: 'pending' | 'win' | 'loss';
  winning_amount: number;
  placed_at: string;
  result: ResultData | null;
}

interface BetHistoryResponse {
  data: { bets: BetHistoryItem[] };
}

const BET_TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  jodi: 'Jodi',
  single_panna: 'SP',
  double_panna: 'DP',
  triple_panna: 'TP',
  half_sangam: 'Half Sangam',
  full_sangam: 'Full Sangam',
};

/**
 * Compute a display status for a bet:
 * - If DB outcome is win/loss → use that directly
 * - If DB outcome is pending AND result is declared → show "result_declared"
 * - Otherwise → "pending"
 */
function getDisplayStatus(bet: BetHistoryItem): 'pending' | 'result_declared' | 'win' | 'loss' {
  if (bet.outcome === 'win') return 'win';
  if (bet.outcome === 'loss') return 'loss';
  // outcome is pending — check if result has been declared for this session
  if (bet.result) return 'result_declared';
  return 'pending';
}

/**
 * Get the relevant result number to display for a bet based on session and type.
 */
function getResultDisplay(bet: BetHistoryItem): string | null {
  const r = bet.result;
  if (!r) return null;

  switch (bet.bet_type) {
    case 'single':
      return bet.session === 'open'
        ? `Open Ank: ${r.open_ank}`
        : `Close Ank: ${r.close_ank}`;
    case 'jodi':
      return `Jodi: ${r.jodi}`;
    case 'single_panna':
    case 'double_panna':
    case 'triple_panna':
      return bet.session === 'open'
        ? `Open Panna: ${r.open_panna}`
        : `Close Panna: ${r.close_panna}`;
    case 'half_sangam':
      return `${r.open_panna}-${r.close_ank} / ${r.close_panna}-${r.open_ank}`;
    case 'full_sangam':
      return `${r.open_panna}-${r.close_panna}`;
    default:
      return null;
  }
}

const STATUS_CONFIG = {
  pending: {
    label: '⏳ Pending',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  },
  result_declared: {
    label: '🔔 Result Out',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  },
  win: {
    label: '🏆 Win',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  loss: {
    label: '❌ Loss',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
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
        {bets.map((bet) => {
          const displayStatus = getDisplayStatus(bet);
          const statusCfg = STATUS_CONFIG[displayStatus];
          const resultDisplay = getResultDisplay(bet);

          return (
            <div
              key={bet.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                    {bet.market_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {new Date(bet.placed_at).toLocaleString()}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusCfg.className}`}>
                  {statusCfg.label}
                </span>
              </div>

              {/* Bet details row */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {BET_TYPE_LABELS[bet.bet_type] ?? bet.bet_type}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  bet.session === 'open'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                }`}>
                  {bet.session === 'open' ? '🟢 Open' : '🔴 Close'}
                </span>
                <span>
                  Selection: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{bet.selection}</span>
                </span>
                <span>
                  Points: <span className="font-semibold text-gray-900 dark:text-gray-100">{Number(bet.points).toLocaleString()}</span>
                </span>
                {displayStatus === 'win' && (
                  <span className="text-green-600 dark:text-green-400 font-bold">
                    +{Number(bet.winning_amount).toLocaleString()} won
                  </span>
                )}
              </div>

              {/* Result row — shown when result is declared */}
              {resultDisplay && (
                <div className={`mt-2 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  displayStatus === 'win'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : displayStatus === 'loss'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                }`}>
                  <span>📋 Result:</span>
                  <span className="font-mono font-bold">{resultDisplay}</span>
                  {bet.result && (
                    <span className="ml-auto text-gray-400 dark:text-gray-500 font-normal">
                      {new Date(bet.result.declared_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
