/**
 * Admin live bet dashboard — /admin/dashboard/:marketId
 *
 * Market selector, snapshot from GET /api/admin/dashboard/:marketId,
 * real-time updates via bet:new and bet:totals Socket.IO events.
 */
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface Market {
  id: string;
  name: string;
  status: string;
}

interface BetEntry {
  id: string;
  user_id: string;
  bet_type: string;
  selection: string;
  points: number;
  placed_at: string;
}

interface BetTypeTotals {
  bet_type: string;
  total_points: number;
  count: number;
}

interface DashboardResponse {
  data: { bets: BetEntry[]; totals: BetTypeTotals[] };
}

interface MarketsResponse {
  data: { markets: Market[] } | Market[];
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

export default function AdminDashboard(): React.ReactElement {
  const { marketId: paramMarketId } = useParams<{ marketId?: string }>();
  const navigate = useNavigate();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<string>(paramMarketId ?? '');
  const [bets, setBets] = useState<BetEntry[]>([]);
  const [totals, setTotals] = useState<BetTypeTotals[]>([]);
  const [loading, setLoading] = useState(false);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch markets for selector
  useEffect(() => {
    api
      .get<MarketsResponse>('/markets')
      .then((res) => {
        // Handle both { markets: [...] } and direct array responses
        const raw = res.data.data;
        const list: Market[] = Array.isArray(raw) ? raw : (raw as { markets: Market[] }).markets ?? [];
        setMarkets(list);
        if (!selectedMarketId && list.length > 0) {
          setSelectedMarketId(list[0].id);
        }
      })
      .catch(() => {
        setError('Failed to load markets.');
      })
      .finally(() => {
        setMarketsLoading(false);
      });
  }, []);

  // Fetch dashboard snapshot when market changes
  useEffect(() => {
    if (!selectedMarketId) return;

    setLoading(true);
    api
      .get<DashboardResponse>(`/admin/dashboard/${selectedMarketId}`)
      .then((res) => {
        setBets(res.data.data.bets);
        setTotals(res.data.data.totals);
      })
      .catch(() => {
        setError('Failed to load dashboard data.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedMarketId]);

  // Socket.IO real-time updates
  useEffect(() => {
    const socket = getSocket();
    socket.emit('join:admin-dashboard');

    const handleBetNew = (data: { marketId: string; betId: string; userRef: string; betType: string; points: number }) => {
      if (data.marketId !== selectedMarketId) return;
      setBets((prev) => [
        {
          id: data.betId,
          user_id: data.userRef,
          bet_type: data.betType,
          selection: '',
          points: data.points,
          placed_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    };

    const handleBetTotals = (data: { marketId: string; totals: Record<string, number> }) => {
      if (data.marketId !== selectedMarketId) return;
      const newTotals: BetTypeTotals[] = Object.entries(data.totals).map(([bet_type, total_points]) => ({
        bet_type,
        total_points,
        count: 0,
      }));
      setTotals(newTotals);
    };

    socket.on('bet:new', handleBetNew);
    socket.on('bet:totals', handleBetTotals);

    return () => {
      socket.off('bet:new', handleBetNew);
      socket.off('bet:totals', handleBetTotals);
    };
  }, [selectedMarketId]);

  if (marketsLoading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Live Dashboard</h1>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Market selector */}
      <div className="mb-6">
        <label htmlFor="marketSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Select Market
        </label>
        <select
          id="marketSelect"
          value={selectedMarketId}
          onChange={(e) => {
            setSelectedMarketId(e.target.value);
            navigate(`/admin/dashboard/${e.target.value}`, { replace: true });
          }}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">-- Select a market --</option>
          {markets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <LoadingSpinner />}

      {!loading && selectedMarketId && (
        <>
          {/* Running totals table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Running Totals</h2>
            {totals.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No bets yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-2 font-medium">Bet Type</th>
                      <th className="pb-2 font-medium text-right">Total Points</th>
                      <th className="pb-2 font-medium text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.map((t) => (
                      <tr key={t.bet_type} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <td className="py-2 text-gray-900 dark:text-gray-100">
                          {BET_TYPE_LABELS[t.bet_type] ?? t.bet_type}
                        </td>
                        <td className="py-2 text-right font-semibold text-gray-900 dark:text-gray-100">
                          {t.total_points.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-gray-600 dark:text-gray-400">
                          {t.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bet list */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Bets ({bets.length})
            </h2>
            {bets.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No bets placed yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {bets.map((bet) => (
                  <div
                    key={bet.id}
                    className="flex items-center gap-3 text-sm py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <span className="text-gray-500 dark:text-gray-400 font-mono text-xs truncate max-w-[80px]">
                      {bet.user_id.slice(0, 8)}…
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {BET_TYPE_LABELS[bet.bet_type] ?? bet.bet_type}
                    </span>
                    {bet.selection && (
                      <span className="font-mono text-gray-600 dark:text-gray-400">{bet.selection}</span>
                    )}
                    <span className="ml-auto font-semibold text-indigo-600 dark:text-indigo-400">
                      {bet.points.toLocaleString()} pts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
