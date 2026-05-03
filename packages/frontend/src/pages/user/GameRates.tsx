/**
 * Game Rates page — /user/game-rates
 * Shows winning multipliers for each bet type.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';

interface ConfigResponse {
  data: {
    winning_multipliers: Record<string, number>;
    upi_details: string;
  };
}

const BET_LABELS: { key: string; label: string; desc: string }[] = [
  { key: 'single', label: 'Single', desc: '0 to 9' },
  { key: 'jodi', label: 'Jodi', desc: '00 to 99' },
  { key: 'single_panna', label: 'Single Panna', desc: '3 different digits' },
  { key: 'double_panna', label: 'Double Panna', desc: '2 same digits' },
  { key: 'triple_panna', label: 'Triple Panna', desc: 'All 3 same digits' },
  { key: 'half_sangam', label: 'Half Sangam', desc: 'Panna + Ank' },
  { key: 'full_sangam', label: 'Full Sangam', desc: 'Open + Close Panna' },
];

export default function GameRates(): React.ReactElement {
  const [multipliers, setMultipliers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ConfigResponse>('/public/rates')
      .then((res) => setMultipliers(res.data.data.winning_multipliers))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Game Rates</h1>
      <p className="text-sm text-gray-500 mb-6">Winning multipliers for each bet type</p>

      <div className="space-y-3">
        {BET_LABELS.map((item, idx) => (
          <div key={item.key} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full flex items-center justify-center text-sm font-bold">{idx + 1}</span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-green-600">{multipliers[item.key] ?? '—'}</p>
              <p className="text-xs text-gray-400">× per point</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4">
        <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Example</p>
        <p className="text-xs text-yellow-700 dark:text-yellow-400">
          If you bet 100 pts on Single and win → 100 × {multipliers['single'] ?? 9} = <strong>{(multipliers['single'] ?? 9) * 100} pts</strong>
        </p>
      </div>
    </div>
  );
}
