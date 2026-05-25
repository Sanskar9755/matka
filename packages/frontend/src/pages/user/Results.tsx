/**
 * Results page — /user/results
 * Shows live results fetched from our backend.
 * Real-time updates via Socket.IO.
 *
 * LIVE LOADING SECTION:
 * - Markets that are "locked" (betting closed, result pending) appear at TOP
 *   with a pulsing "Loading..." animation.
 * - When result is declared → shows result at top for 10 minutes.
 * - After 10 minutes → card moves to its correct time-sorted position in the list.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';

interface ResultEntry {
  id: string;
  market_name: string;
  cycle_date: string;
  open_panna: string;
  close_panna: string;
  jodi: string;
  open_ank: string;
  close_ank: string;
  declared_at: string;
}

interface Market {
  id: string;
  name: string;
  open_time: string;
  close_time: string;
  result_time: string;
  computed_status: 'open' | 'locked' | 'closed';
  mins_until_lockout: number;
  is_open_yet: boolean;
}

interface ResultsResponse { data: ResultEntry[]; }
interface MarketsResponse { data: { markets: Market[] } | Market[]; }

// Tracks when a result was declared (for 10-min "stay at top" logic)
interface RecentlyDeclared {
  market_name: string;
  declared_at: number; // timestamp ms
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatResult(open_panna: string, jodi: string, close_panna: string): string {
  if (!open_panna || open_panna === '***') return '***-**-***';
  return `${open_panna}-${jodi}-${close_panna}`;
}

// Convert HH:MM to 12hr format
function to12hr(time: string): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr);
  const m = mStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// Parse HH:MM to minutes since midnight
function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// 10 minutes in ms
const STAY_AT_TOP_MS = 10 * 60 * 1000;

export default function Results(): React.ReactElement {
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState('All');
  const [recentlyDeclared, setRecentlyDeclared] = useState<RecentlyDeclared[]>([]);
  const [, forceUpdate] = useState(0); // for countdown re-renders
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchResults = useCallback(() => {
    api.get<ResultsResponse>('/results')
      .then(r => setResults(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchMarkets = useCallback(() => {
    api.get<MarketsResponse>('/markets')
      .then(res => {
        const raw = res.data.data;
        const list: Market[] = Array.isArray(raw) ? raw : (raw as { markets: Market[] }).markets ?? [];
        setMarkets(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchResults();
    fetchMarkets();
  }, [fetchResults, fetchMarkets]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => {
      fetchResults();
      fetchMarkets();
    }, 30000);
    return () => clearInterval(id);
  }, [fetchResults, fetchMarkets]);

  // Force re-render every second for live countdown + 10-min expiry check
  useEffect(() => {
    timerRef.current = setInterval(() => {
      forceUpdate(n => n + 1);
      // Clean up expired "recently declared" entries
      setRecentlyDeclared(prev =>
        prev.filter(rd => Date.now() - rd.declared_at < STAY_AT_TOP_MS)
      );
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Real-time Socket.IO updates
  useEffect(() => {
    const socket = getSocket();

    const handleResultDeclared = (data: ResultEntry) => {
      // Add to results list
      setResults(prev => {
        const filtered = prev.filter(r =>
          !(r.market_name === data.market_name &&
            r.cycle_date.slice(0, 10) === (data.cycle_date || '').slice(0, 10))
        );
        return [data, ...filtered];
      });
      // Mark as recently declared (stays at top for 10 min)
      setRecentlyDeclared(prev => {
        const filtered = prev.filter(rd => rd.market_name !== data.market_name);
        return [...filtered, { market_name: data.market_name, declared_at: Date.now() }];
      });
      // Refresh markets to update locked/closed status
      fetchMarkets();
    };

    const handleMarketLocked = () => { fetchMarkets(); };
    const handleMarketClosed = () => { fetchMarkets(); };

    socket.on('result:declared', handleResultDeclared);
    socket.on('market:locked', handleMarketLocked);
    socket.on('market:closed', handleMarketClosed);

    return () => {
      socket.off('result:declared', handleResultDeclared);
      socket.off('market:locked', handleMarketLocked);
      socket.off('market:closed', handleMarketClosed);
    };
  }, [fetchMarkets]);

  const isPending = (r: ResultEntry) =>
    !r.open_panna || r.open_panna === '***' || r.open_panna.includes('*');

  // Today's date string YYYY-MM-DD
  const todayStr = new Date().toISOString().slice(0, 10);

  // Markets that are currently LOCKED (betting closed, result not yet declared)
  // These show at top with "Loading..." animation
  const lockedMarkets = markets.filter(m => m.computed_status === 'locked');

  // Markets that were recently declared (within last 10 min) — stay at top
  const recentlyDeclaredNames = new Set(
    recentlyDeclared
      .filter(rd => Date.now() - rd.declared_at < STAY_AT_TOP_MS)
      .map(rd => rd.market_name)
  );

  // Today's results for recently declared markets (to show at top)
  const recentlyDeclaredResults = results.filter(r =>
    recentlyDeclaredNames.has(r.market_name) &&
    r.cycle_date.slice(0, 10) === todayStr &&
    !isPending(r)
  );

  // Names that are in the "live top section" (either loading or recently declared)
  const liveTopNames = new Set([
    ...lockedMarkets.map(m => m.name),
    ...recentlyDeclaredNames,
  ]);

  // Get unique market names for filter
  const marketNames = ['All', ...Array.from(new Set(results.map(r => r.market_name))).sort()];

  // Filter results for the main list
  const filtered = (selectedMarket === 'All' ? results : results.filter(r => r.market_name === selectedMarket))
    // Exclude markets currently in the live top section
    .filter(r => {
      if (r.cycle_date.slice(0, 10) !== todayStr) return true; // older dates always show in list
      return !liveTopNames.has(r.market_name); // today's live-top markets excluded from list
    });

  // Group by date
  const grouped: Record<string, ResultEntry[]> = {};
  for (const r of filtered) {
    const date = r.cycle_date.slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(r);
  }

  // Sort each group by result_time (using market data if available)
  const getResultTime = (marketName: string): number => {
    const m = markets.find(mk => mk.name === marketName);
    return m ? timeToMins(m.result_time) : 0;
  };
  for (const date of Object.keys(grouped)) {
    grouped[date].sort((a, b) => getResultTime(a.market_name) - getResultTime(b.market_name));
  }

  // Countdown to result time
  const getCountdown = (result_time: string): string => {
    const now = new Date();
    const [th, tm] = result_time.split(':').map(Number);
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), th, tm, 0);
    const diff = target.getTime() - now.getTime();
    if (diff <= 0) return 'Result any moment...';
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Time remaining in top section for recently declared
  const getTimeRemainingAtTop = (marketName: string): string => {
    const rd = recentlyDeclared.find(r => r.market_name === marketName);
    if (!rd) return '';
    const remaining = STAY_AT_TOP_MS - (Date.now() - rd.declared_at);
    if (remaining <= 0) return '';
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    return m > 0 ? `moves to list in ${m}m ${s}s` : `moves to list in ${s}s`;
  };

  if (loading) return <LoadingSpinner />;

  const hasLiveSection = lockedMarkets.length > 0 || recentlyDeclaredResults.length > 0;

  return (
    <div className="px-4 py-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-brand-800">📊 Results</h1>
        <div className="flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          Live
        </div>
      </div>

      {/* ── LIVE TOP SECTION ── */}
      {hasLiveSection && (
        <div className="mb-5">
          {/* Section header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>
            <h2 className="text-sm font-bold text-red-600 uppercase tracking-wider">
              🔴 Live Result
            </h2>
          </div>

          <div className="space-y-3">
            {/* Loading cards — locked markets awaiting result */}
            {lockedMarkets.map(market => (
              <div key={`loading-${market.id}`}
                className="rounded-2xl overflow-hidden shadow-lg border-2 border-red-400"
                style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }}>
                {/* Top bar */}
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ background: 'linear-gradient(90deg, #e11d48, #be123c)' }}>
                  <span className="text-white font-bold text-base">{market.name}</span>
                  <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                    ⏳ LOADING...
                  </span>
                </div>

                {/* Loading animation body */}
                <div className="px-4 py-4">
                  {/* Pulsing result placeholder */}
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <div className="text-center">
                      <p className="text-white/50 text-xs mb-1">Open</p>
                      <div className="bg-white/10 rounded-lg px-4 py-2 animate-pulse">
                        <p className="font-mono font-bold text-white/40 text-xl">***</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-white/50 text-xs mb-1">Jodi</p>
                      <div className="bg-white/10 rounded-xl px-5 py-2 animate-pulse">
                        <p className="font-mono font-bold text-white/40 text-2xl">**</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-white/50 text-xs mb-1">Close</p>
                      <div className="bg-white/10 rounded-lg px-4 py-2 animate-pulse">
                        <p className="font-mono font-bold text-white/40 text-xl">***</p>
                      </div>
                    </div>
                  </div>

                  {/* Countdown */}
                  <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-3 py-2 text-center">
                    <p className="text-red-300 text-xs font-medium">
                      🕐 Result Time: {to12hr(market.result_time)} &nbsp;·&nbsp;
                      <span className="text-yellow-300 font-bold">{getCountdown(market.result_time)}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Recently declared cards — show result, then move to list after 10 min */}
            {recentlyDeclaredResults.map(r => (
              <div key={`declared-${r.id}`}
                className="rounded-2xl overflow-hidden shadow-lg border-2 border-green-400"
                style={{ background: 'linear-gradient(135deg, #064e3b, #065f46)' }}>
                {/* Top bar */}
                <div className="px-4 py-2.5 flex items-center justify-between bg-green-600">
                  <span className="text-white font-bold text-base">{r.market_name}</span>
                  <span className="text-xs bg-green-400 text-green-900 px-2 py-0.5 rounded-full font-bold">
                    ✅ DECLARED
                  </span>
                </div>

                {/* Result body */}
                <div className="px-4 py-4">
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <div className="text-center">
                      <p className="text-white/60 text-xs mb-1">Open</p>
                      <div className="bg-white/10 rounded-lg px-4 py-2">
                        <p className="font-mono font-bold text-white text-xl">{r.open_panna}</p>
                        <p className="text-green-300 text-xs font-bold text-center">{r.open_ank}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-white/60 text-xs mb-1">Jodi</p>
                      <div className="bg-yellow-400 rounded-xl px-5 py-2">
                        <p className="font-mono font-bold text-gray-900 text-2xl">{r.jodi}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-white/60 text-xs mb-1">Close</p>
                      <div className="bg-white/10 rounded-lg px-4 py-2">
                        <p className="font-mono font-bold text-white text-xl">{r.close_panna}</p>
                        <p className="text-green-300 text-xs font-bold text-center">{r.close_ank}</p>
                      </div>
                    </div>
                  </div>

                  {/* Full result string */}
                  <div className="bg-white/10 rounded-xl px-3 py-2 text-center mb-2">
                    <p className="font-mono text-yellow-300 font-bold text-lg tracking-widest">
                      {formatResult(r.open_panna, r.jodi, r.close_panna)}
                    </p>
                  </div>

                  {/* Countdown to move to list */}
                  <p className="text-center text-white/40 text-xs">
                    ⬇ {getTimeRemainingAtTop(r.market_name)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market filter */}
      {marketNames.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {marketNames.map(m => (
            <button key={m} onClick={() => setSelectedMarket(m)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                selectedMarket === m
                  ? 'bg-brand-600 text-white'
                  : 'bg-brand-50 text-brand-600 border border-brand-200'
              }`}>
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Results grouped by date */}
      {Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(date => (
        <div key={date} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-brand-100"></div>
            <span className="text-xs font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-200">
              📅 {formatDate(date)}
            </span>
            <div className="h-px flex-1 bg-brand-100"></div>
          </div>

          <div className="space-y-2">
            {grouped[date].map(r => (
              <div key={r.id}
                className={`rounded-2xl overflow-hidden shadow-sm border ${
                  isPending(r) ? 'border-gray-200 bg-gray-50' : 'border-brand-100 bg-white'
                }`}>
                <div className={`px-4 py-2 flex items-center justify-between ${
                  isPending(r) ? 'bg-gray-100' : 'bg-brand-600'
                }`}>
                  <span className={`font-bold text-sm ${isPending(r) ? 'text-gray-600' : 'text-white'}`}>
                    {r.market_name}
                  </span>
                  {isPending(r) ? (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                      ⏳ Pending
                    </span>
                  ) : (
                    <span className="text-xs bg-green-400 text-green-900 px-2 py-0.5 rounded-full font-bold">
                      ✓ Declared
                    </span>
                  )}
                </div>

                <div className="px-4 py-3">
                  {isPending(r) ? (
                    <p className="text-center text-gray-400 text-sm font-medium">Result not declared yet</p>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="text-center">
                        <p className="text-xs text-brand-400 mb-1">Open</p>
                        <p className="font-mono font-bold text-brand-700 text-lg">{r.open_panna}</p>
                        <p className="text-xs text-brand-500 font-bold">{r.open_ank}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-brand-400 mb-1">Jodi</p>
                        <div className="bg-brand-600 text-white font-mono font-bold text-2xl px-4 py-1 rounded-xl">
                          {r.jodi}
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-brand-400 mb-1">Close</p>
                        <p className="font-mono font-bold text-brand-700 text-lg">{r.close_panna}</p>
                        <p className="text-xs text-brand-500 font-bold">{r.close_ank}</p>
                      </div>
                    </div>
                  )}

                  {!isPending(r) && (
                    <div className="mt-2 bg-brand-50 rounded-xl px-3 py-1.5 text-center">
                      <p className="font-mono text-brand-700 font-bold text-sm">
                        {formatResult(r.open_panna, r.jodi, r.close_panna)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && !hasLiveSection && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-brand-500 font-medium">No results yet</p>
          <p className="text-brand-400 text-sm mt-1">Results will appear here as they are declared</p>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-4">
        Live results from official Matka markets · Auto-updates every 30s
      </p>
    </div>
  );
}
