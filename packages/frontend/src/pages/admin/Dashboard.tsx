/**
 * Admin live bet dashboard — /admin/dashboard/:marketId
 *
 * Two tabs:
 * 1. Live Bets — real-time bet list + running totals
 * 2. Bet Analysis — total per number/panna for each bet type
 */
import React, { useEffect, useState, useCallback } from 'react';
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
  username: string;
  market_name: string;
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

interface BetAnalysisEntry {
  selection: string;
  total_points: number;
  bet_count: number;
}

interface BetAnalysis {
  single: BetAnalysisEntry[];
  jodi: BetAnalysisEntry[];
  single_panna: BetAnalysisEntry[];
  double_panna: BetAnalysisEntry[];
  triple_panna: BetAnalysisEntry[];
  half_sangam: BetAnalysisEntry[];
  full_sangam: BetAnalysisEntry[];
  summary: { bet_type: string; total_points: number; bet_count: number }[];
}

interface DashboardResponse {
  data: { bets: BetEntry[]; totals: BetTypeTotals[] };
}

interface MarketsResponse {
  data: { markets: Market[] } | Market[];
}

interface AnalysisResponse {
  data: BetAnalysis;
}

const BET_TYPE_LABELS: Record<string, string> = {
  single: 'Single (0-9)',
  jodi: 'Jodi (00-99)',
  single_panna: 'Single Panna (SP)',
  double_panna: 'Double Panna (DP)',
  triple_panna: 'Triple Panna (TP)',
  half_sangam: 'Half Sangam',
  full_sangam: 'Full Sangam',
};

const BET_TYPE_COLORS: Record<string, string> = {
  single: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700',
  jodi: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700',
  single_panna: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700',
  double_panna: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700',
  triple_panna: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700',
  half_sangam: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700',
  full_sangam: 'bg-pink-50 dark:bg-pink-900/30 border-pink-200 dark:border-pink-700',
};

export default function AdminDashboard(): React.ReactElement {
  const { marketId: paramMarketId } = useParams<{ marketId?: string }>();
  const navigate = useNavigate();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<string>(paramMarketId ?? '');
  const [bets, setBets] = useState<BetEntry[]>([]);
  const [totals, setTotals] = useState<BetTypeTotals[]>([]);
  const [analysis, setAnalysis] = useState<BetAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'analysis'>('live');
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch markets
  useEffect(() => {
    api.get<MarketsResponse>('/markets').then((res) => {
      const raw = res.data.data;
      const list: Market[] = Array.isArray(raw) ? raw : (raw as { markets: Market[] }).markets ?? [];
      setMarkets(list);
      if (!selectedMarketId && list.length > 0) setSelectedMarketId(list[0].id);
    }).catch(() => setError('Failed to load markets.')).finally(() => setMarketsLoading(false));
  }, []);

  // Fetch live bets snapshot
  const fetchDashboard = useCallback((marketId: string) => {
    if (!marketId) return;
    setLoading(true);
    api.get<DashboardResponse>(`/admin/dashboard/${marketId}`)
      .then((res) => { setBets(res.data.data.bets); setTotals(res.data.data.totals); })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  // Fetch bet analysis
  const fetchAnalysis = useCallback((marketId: string) => {
    if (!marketId) return;
    setAnalysisLoading(true);
    api.get<AnalysisResponse>(`/admin/bet-analysis/${marketId}`)
      .then((res) => setAnalysis(res.data.data))
      .catch(() => setError('Failed to load bet analysis.'))
      .finally(() => setAnalysisLoading(false));
  }, []);

  useEffect(() => {
    if (selectedMarketId) {
      fetchDashboard(selectedMarketId);
      fetchAnalysis(selectedMarketId);
    }
  }, [selectedMarketId, fetchDashboard, fetchAnalysis]);

  // Auto-refresh analysis every 15 seconds
  useEffect(() => {
    if (!selectedMarketId) return;
    const interval = setInterval(() => {
      fetchDashboard(selectedMarketId);
      fetchAnalysis(selectedMarketId);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedMarketId, fetchDashboard, fetchAnalysis]);

  // Socket.IO real-time updates
  useEffect(() => {
    const socket = getSocket();
    socket.emit('join:admin-dashboard');

    const handleBetNew = (data: { marketId: string; betId: string; userRef: string; betType: string; points: number; username?: string; marketName?: string }) => {
      if (data.marketId !== selectedMarketId) return;
      setBets((prev) => [{
        id: data.betId,
        user_id: data.userRef,
        username: data.username ?? data.userRef.slice(0, 8),
        market_name: data.marketName ?? '',
        bet_type: data.betType,
        selection: '',
        points: data.points,
        placed_at: new Date().toISOString(),
      }, ...prev]);
      // Refresh analysis on new bet
      fetchAnalysis(selectedMarketId);
    };

    const handleBetTotals = (data: { marketId: string; totals: Record<string, number> }) => {
      if (data.marketId !== selectedMarketId) return;
      setTotals(Object.entries(data.totals).map(([bet_type, total_points]) => ({ bet_type, total_points, count: 0 })));
    };

    socket.on('bet:new', handleBetNew);
    socket.on('bet:totals', handleBetTotals);
    return () => { socket.off('bet:new', handleBetNew); socket.off('bet:totals', handleBetTotals); };
  }, [selectedMarketId, fetchAnalysis]);

  if (marketsLoading) return <LoadingSpinner />;

  const totalBetAmount = totals.reduce((s, t) => s + t.total_points, 0);

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Live Dashboard</h1>

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Market selector */}
      <div className="mb-4">
        <label htmlFor="marketSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Select Market
        </label>
        <select
          id="marketSelect"
          value={selectedMarketId}
          onChange={(e) => { setSelectedMarketId(e.target.value); navigate(`/admin/dashboard/${e.target.value}`, { replace: true }); }}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">-- Select a market --</option>
          {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {selectedMarketId && (
        <>
          {/* Total summary */}
          <div className="bg-indigo-600 text-white rounded-xl p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Total Bets Today</p>
              <p className="text-2xl font-bold">{totalBetAmount.toLocaleString()} pts</p>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-80">Total Entries</p>
              <p className="text-2xl font-bold">{bets.length}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('live')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'live' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              📋 Live Bets
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analysis' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              📊 Number Analysis
            </button>
          </div>

          {/* TAB 1: Live Bets */}
          {activeTab === 'live' && (
            <>
              {loading && <LoadingSpinner />}
              {!loading && (
                <>
                  {/* Running totals */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Running Totals by Bet Type</h2>
                    {totals.length === 0 ? (
                      <p className="text-sm text-gray-500">No bets yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {totals.map((t) => (
                          <div key={t.bet_type} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400">{BET_TYPE_LABELS[t.bet_type] ?? t.bet_type}</p>
                            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{t.total_points.toLocaleString()}</p>
                            <p className="text-xs text-gray-400">{t.count} bets</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bet list */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">All Bets ({bets.length})</h2>
                    {bets.length === 0 ? (
                      <p className="text-sm text-gray-500">No bets placed yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                              <th className="pb-2">User</th>
                              <th className="pb-2">Market</th>
                              <th className="pb-2">Type</th>
                              <th className="pb-2">Selection</th>
                              <th className="pb-2 text-right">Points</th>
                              <th className="pb-2 text-right">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bets.map((bet) => (
                              <tr key={bet.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                                <td className="py-2 font-semibold text-gray-800 dark:text-gray-200">{bet.username || bet.user_id.slice(0, 8)}</td>
                                <td className="py-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">{bet.market_name}</td>
                                <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{BET_TYPE_LABELS[bet.bet_type]?.split(' ')[0] ?? bet.bet_type}</td>
                                <td className="py-2 font-mono font-bold text-indigo-600">{bet.selection || '-'}</td>
                                <td className="py-2 text-right font-semibold">{bet.points.toLocaleString()}</td>
                                <td className="py-2 text-right text-xs text-gray-400">{new Date(bet.placed_at).toLocaleTimeString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* TAB 2: Number Analysis */}
          {activeTab === 'analysis' && (
            <>
              {analysisLoading && <LoadingSpinner />}
              {!analysisLoading && analysis && (
                <div className="space-y-4">
                  {/* Summary */}
                  {analysis.summary.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Summary</h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {analysis.summary.map((s) => (
                          <div key={s.bet_type} className={`rounded-lg p-3 border ${BET_TYPE_COLORS[s.bet_type] ?? ''}`}>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{BET_TYPE_LABELS[s.bet_type] ?? s.bet_type}</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{s.total_points.toLocaleString()} pts</p>
                            <p className="text-xs text-gray-500">{s.bet_count} bets</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Each bet type breakdown */}
                  {([
                    { key: 'single', data: analysis.single },
                    { key: 'jodi', data: analysis.jodi },
                    { key: 'single_panna', data: analysis.single_panna },
                    { key: 'double_panna', data: analysis.double_panna },
                    { key: 'triple_panna', data: analysis.triple_panna },
                    { key: 'half_sangam', data: analysis.half_sangam },
                    { key: 'full_sangam', data: analysis.full_sangam },
                  ] as { key: string; data: BetAnalysisEntry[] }[]).filter(({ data }) => data.length > 0).map(({ key, data }) => (
                    <div key={key} className={`rounded-xl border p-4 ${BET_TYPE_COLORS[key] ?? 'bg-white border-gray-200'}`}>
                      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        {BET_TYPE_LABELS[key]} — {data.length} numbers
                      </h2>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {data.map((entry) => (
                          <div
                            key={entry.selection}
                            className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center shadow-sm border border-gray-200 dark:border-gray-600"
                          >
                            <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300 font-mono">{entry.selection}</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{entry.total_points.toLocaleString()}</p>
                            <p className="text-xs text-gray-400">{entry.bet_count} bet{entry.bet_count > 1 ? 's' : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {analysis.summary.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-4xl mb-2">📊</p>
                      <p>No bets placed yet for this market today.</p>
                    </div>
                  )}

                  <button
                    onClick={() => fetchAnalysis(selectedMarketId)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg py-2 text-sm transition-colors"
                  >
                    ↻ Refresh Analysis
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
