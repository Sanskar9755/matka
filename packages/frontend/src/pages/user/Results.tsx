/**
 * Results page — /user/results
 * Shows live results fetched from matkaapi.com via our backend.
 * Real-time updates via Socket.IO.
 */
import React, { useEffect, useState, useCallback } from 'react';
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

interface ResultsResponse { data: ResultEntry[]; }

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatResult(open_panna: string, jodi: string, close_panna: string): string {
  if (!open_panna || open_panna === '***') return '***-**-***';
  return `${open_panna}-${jodi}-${close_panna}`;
}

export default function Results(): React.ReactElement {
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState('All');

  const fetchResults = useCallback(() => {
    api.get<ResultsResponse>('/results')
      .then(r => setResults(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => fetchResults(), 30000);
    return () => clearInterval(id);
  }, [fetchResults]);

  // Real-time Socket.IO updates
  useEffect(() => {
    const socket = getSocket();
    const handleResultDeclared = (data: ResultEntry) => {
      setResults(prev => {
        const filtered = prev.filter(r =>
          !(r.market_name === data.market_name &&
            r.cycle_date.slice(0, 10) === (data.cycle_date || '').slice(0, 10))
        );
        return [data, ...filtered];
      });
    };
    socket.on('result:declared', handleResultDeclared);
    return () => { socket.off('result:declared', handleResultDeclared); };
  }, []);

  const isPending = (r: ResultEntry) =>
    !r.open_panna || r.open_panna === '***' || r.open_panna.includes('*');

  // Get unique market names
  const markets = ['All', ...Array.from(new Set(results.map(r => r.market_name))).sort()];

  const filtered = selectedMarket === 'All'
    ? results
    : results.filter(r => r.market_name === selectedMarket);

  // Group by date
  const grouped: Record<string, ResultEntry[]> = {};
  for (const r of filtered) {
    const date = r.cycle_date.slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(r);
  }

  if (loading) return <LoadingSpinner />;

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

      {/* Market filter */}
      {markets.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {markets.map(m => (
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

      {filtered.length === 0 && (
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
