/**
 * Game Lobby page — /user/lobby
 *
 * Fetches all active markets and displays them as cards.
 * Subscribes to market:locked Socket.IO events to update status in real time.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface Market {
  id: string;
  name: string;
  open_time: string;
  close_time: string;
  result_time: string;
  status: 'open' | 'locked' | 'closed';
  is_active: boolean;
}

interface MarketsResponse {
  data: { markets: Market[] } | Market[];
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  locked: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  closed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function Lobby(): React.ReactElement {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<MarketsResponse>('/markets')
      .then((res) => {
        const raw = res.data.data;
        const list: Market[] = Array.isArray(raw) ? raw : (raw as { markets: Market[] }).markets ?? [];
        setMarkets(list);
      })
      .catch(() => {
        setError('Failed to load markets. Please try again.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Subscribe to market:locked events via Socket.IO
  useEffect(() => {
    const socket = getSocket();

    // Join each market room
    markets.forEach((m) => {
      socket.emit('join:market', m.id);
    });

    const handleMarketLocked = (data: { marketId: string }) => {
      setMarkets((prev) =>
        prev.map((m) => (m.id === data.marketId ? { ...m, status: 'locked' } : m)),
      );
    };

    socket.on('market:locked', handleMarketLocked);

    return () => {
      socket.off('market:locked', handleMarketLocked);
    };
  }, [markets]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Markets</h1>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {markets.length === 0 && !error && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">
          No active markets available.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {markets.map((market) => (
          <button
            key={market.id}
            onClick={() => navigate(`/user/bet/${market.id}`)}
            disabled={market.status !== 'open'}
            className="text-left bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]"
          >
            <div className="flex items-start justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                {market.name}
              </h2>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_STYLES[market.status] ?? ''}`}
              >
                {market.status}
              </span>
            </div>

            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Opens</span>
                <span className="font-medium">{market.open_time}</span>
              </div>
              <div className="flex justify-between">
                <span>Closes</span>
                <span className="font-medium">{market.close_time}</span>
              </div>
              <div className="flex justify-between">
                <span>Result</span>
                <span className="font-medium">{market.result_time}</span>
              </div>
            </div>

            {market.status === 'open' && (
              <div className="mt-3 text-center text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                Tap to place bet →
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
