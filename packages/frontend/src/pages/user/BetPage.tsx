/**
 * Bet placement page — /user/bet/:marketId
 *
 * 7 bet type tabs, selection input, points input with validation.
 * Submits via POST /api/bets.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

type BetType = 'single' | 'jodi' | 'single_panna' | 'double_panna' | 'triple_panna' | 'half_sangam' | 'full_sangam';

const BET_TYPES: { value: BetType; label: string; placeholder: string; hint: string }[] = [
  { value: 'single', label: 'Single', placeholder: '0–9', hint: 'One digit (0–9)' },
  { value: 'jodi', label: 'Jodi', placeholder: '00–99', hint: 'Two digits (00–99)' },
  { value: 'single_panna', label: 'SP', placeholder: '123', hint: 'Three-digit panna (all different)' },
  { value: 'double_panna', label: 'DP', placeholder: '112', hint: 'Three-digit panna (two same)' },
  { value: 'triple_panna', label: 'TP', placeholder: '111', hint: 'Three-digit panna (all same)' },
  { value: 'half_sangam', label: 'Half Sangam', placeholder: '123-5', hint: 'Panna-Ank (e.g. 123-5)' },
  { value: 'full_sangam', label: 'Full Sangam', placeholder: '123-456', hint: 'Open-Close panna (e.g. 123-456)' },
];

interface AdminLimits {
  min_bet_points: number;
  max_bet_points: number;
}

interface BetResponse {
  data: { bet: { id: string } };
}

export default function BetPage(): React.ReactElement {
  const { marketId } = useParams<{ marketId: string }>();
  const navigate = useNavigate();

  const [betType, setBetType] = useState<BetType>('single');
  const [selection, setSelection] = useState('');
  const [points, setPoints] = useState('');
  const [limits, setLimits] = useState<AdminLimits>({ min_bet_points: 10, max_bet_points: 10000 });
  const [loading, setLoading] = useState(false);
  const [limitsLoading, setLimitsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch admin bet limits from wallet balance endpoint (includes admin info)
  useEffect(() => {
    // We'll try to get limits from the admin settings endpoint
    // For now, use defaults — the server will validate anyway
    setLimitsLoading(false);
  }, []);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const pointsNum = parseInt(points, 10);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      setError('Please enter a valid points amount.');
      return;
    }
    if (pointsNum < limits.min_bet_points) {
      setError(`Minimum bet is ${limits.min_bet_points} points.`);
      return;
    }
    if (pointsNum > limits.max_bet_points) {
      setError(`Maximum bet is ${limits.max_bet_points} points.`);
      return;
    }
    if (!selection.trim()) {
      setError('Please enter your selection.');
      return;
    }

    setLoading(true);
    try {
      await api.post<BetResponse>('/bets', {
        marketId,
        betType,
        selection: selection.trim(),
        points: pointsNum,
      });
      setSuccess(true);
      setSelection('');
      setPoints('');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message ?? 'Failed to place bet. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const currentBetType = BET_TYPES.find((b) => b.value === betType)!;

  if (limitsLoading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/user/lobby')}
          className="text-indigo-600 dark:text-indigo-400 min-h-[44px] min-w-[44px] flex items-center"
          aria-label="Back to lobby"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Place Bet</h1>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-200 rounded-lg px-4 py-3 text-sm">
          Bet placed successfully!
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Bet type tabs */}
      <div className="flex overflow-x-auto gap-2 pb-2 mb-6 scrollbar-hide">
        {BET_TYPES.map((bt) => (
          <button
            key={bt.value}
            onClick={() => {
              setBetType(bt.value);
              setSelection('');
              setError(null);
            }}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[44px] ${
              betType === bt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {bt.label}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {/* Selection input */}
        <div>
          <label htmlFor="selection" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Selection
            <span className="ml-2 text-xs text-gray-400">({currentBetType.hint})</span>
          </label>
          <input
            id="selection"
            type="text"
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            placeholder={currentBetType.placeholder}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Points input */}
        <div>
          <label htmlFor="points" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Points
            <span className="ml-2 text-xs text-gray-400">
              (min {limits.min_bet_points} – max {limits.max_bet_points})
            </span>
          </label>
          <input
            id="points"
            type="number"
            min={limits.min_bet_points}
            max={limits.max_bet_points}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder={`${limits.min_bet_points}–${limits.max_bet_points}`}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-3 text-sm transition-colors min-h-[44px]"
        >
          {loading ? 'Placing bet…' : 'Place Bet'}
        </button>
      </form>
    </div>
  );
}
