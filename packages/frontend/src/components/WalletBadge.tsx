/**
 * WalletBadge — shows current balance, always visible when authenticated.
 */
import React, { useEffect, useState } from 'react';
import api from '../utils/api.js';

interface WalletData {
  balance_points: number;
  held_points: number;
}

export function WalletBadge(): React.ReactElement {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<{ data: WalletData }>('/wallet/balance')
      .then((res) => {
        setBalance(res.data.data.balance_points);
      })
      .catch(() => {
        // Silently fail — badge just won't show a value
      });
  }, []);

  return (
    <div className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded-full px-3 py-1 text-sm font-semibold">
      <span>₹</span>
      <span>{balance !== null ? balance.toLocaleString() : '—'}</span>
    </div>
  );
}
