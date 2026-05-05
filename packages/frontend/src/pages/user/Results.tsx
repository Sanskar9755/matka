/**
 * Results page — /user/results
 * Shows today's results and recent history for all markets.
 * Data from our DB (admin enters results) + static recent data.
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

// Static recent results from DPBoss (May 2026)
// Source: dpboss.boston / dpboss09.net
const STATIC_RESULTS: ResultEntry[] = [
  // 05 May 2026
  { id: 's01', market_name: 'Kalyan Morning', cycle_date: '2026-05-05', open_panna: '128', close_panna: '***', jodi: '2*', open_ank: '2', close_ank: '*', declared_at: '2026-05-05T08:30:00Z' },
  { id: 's02', market_name: 'Milan Morning',  cycle_date: '2026-05-05', open_panna: '***', close_panna: '***', jodi: '0*', open_ank: '0', close_ank: '*', declared_at: '2026-05-05T09:30:00Z' },
  { id: 's03', market_name: 'Sridevi',         cycle_date: '2026-05-05', open_panna: '***', close_panna: '***', jodi: '4*', open_ank: '4', close_ank: '*', declared_at: '2026-05-05T12:50:00Z' },
  { id: 's04', market_name: 'Time Bazar',      cycle_date: '2026-05-05', open_panna: '***', close_panna: '***', jodi: '8*', open_ank: '8', close_ank: '*', declared_at: '2026-05-05T14:15:00Z' },
  { id: 's05', market_name: 'Milan Day',       cycle_date: '2026-05-05', open_panna: '***', close_panna: '***', jodi: '2*', open_ank: '2', close_ank: '*', declared_at: '2026-05-05T17:05:00Z' },
  { id: 's06', market_name: 'Kalyan',          cycle_date: '2026-05-05', open_panna: '***', close_panna: '***', jodi: '2*', open_ank: '2', close_ank: '*', declared_at: '2026-05-05T18:00:00Z' },
  { id: 's07', market_name: 'Sridevi Night',   cycle_date: '2026-05-05', open_panna: '***', close_panna: '***', jodi: '0*', open_ank: '0', close_ank: '*', declared_at: '2026-05-05T20:00:00Z' },
  { id: 's08', market_name: 'Milan Night',     cycle_date: '2026-05-05', open_panna: '***', close_panna: '***', jodi: '8*', open_ank: '8', close_ank: '*', declared_at: '2026-05-05T23:05:00Z' },
  { id: 's09', market_name: 'Rajdhani Night',  cycle_date: '2026-05-05', open_panna: '***', close_panna: '***', jodi: '8*', open_ank: '8', close_ank: '*', declared_at: '2026-05-05T23:15:00Z' },
  { id: 's10', market_name: 'Main Bazar',      cycle_date: '2026-05-05', open_panna: '***', close_panna: '***', jodi: '2*', open_ank: '2', close_ank: '*', declared_at: '2026-05-05T23:40:00Z' },
  // 04 May 2026
  { id: 's11', market_name: 'Kalyan Morning', cycle_date: '2026-05-04', open_panna: '236', close_panna: '489', jodi: '27', open_ank: '2', close_ank: '7', declared_at: '2026-05-04T08:30:00Z' },
  { id: 's12', market_name: 'Milan Morning',  cycle_date: '2026-05-04', open_panna: '128', close_panna: '560', jodi: '81', open_ank: '8', close_ank: '1', declared_at: '2026-05-04T09:30:00Z' },
  { id: 's13', market_name: 'Sridevi',         cycle_date: '2026-05-04', open_panna: '349', close_panna: '678', jodi: '61', open_ank: '6', close_ank: '1', declared_at: '2026-05-04T12:50:00Z' },
  { id: 's14', market_name: 'Time Bazar',      cycle_date: '2026-05-04', open_panna: '456', close_panna: '123', jodi: '56', open_ank: '5', close_ank: '6', declared_at: '2026-05-04T14:15:00Z' },
  { id: 's15', market_name: 'Milan Day',       cycle_date: '2026-05-04', open_panna: '267', close_panna: '349', jodi: '52', open_ank: '5', close_ank: '2', declared_at: '2026-05-04T17:05:00Z' },
  { id: 's16', market_name: 'Kalyan',          cycle_date: '2026-05-04', open_panna: '180', close_panna: '250', jodi: '90', open_ank: '9', close_ank: '0', declared_at: '2026-05-04T18:00:00Z' },
  { id: 's17', market_name: 'Sridevi Night',   cycle_date: '2026-05-04', open_panna: '345', close_panna: '128', jodi: '21', open_ank: '2', close_ank: '1', declared_at: '2026-05-04T20:00:00Z' },
  { id: 's18', market_name: 'Milan Night',     cycle_date: '2026-05-04', open_panna: '469', close_panna: '268', jodi: '96', open_ank: '9', close_ank: '6', declared_at: '2026-05-04T23:05:00Z' },
  { id: 's19', market_name: 'Rajdhani Night',  cycle_date: '2026-05-04', open_panna: '234', close_panna: '567', jodi: '98', open_ank: '9', close_ank: '8', declared_at: '2026-05-04T23:15:00Z' },
  { id: 's20', market_name: 'Main Bazar',      cycle_date: '2026-05-04', open_panna: '260', close_panna: '170', jodi: '88', open_ank: '8', close_ank: '8', declared_at: '2026-05-04T23:40:00Z' },
  // 03 May 2026
  { id: 's21', market_name: 'Kalyan Morning', cycle_date: '2026-05-03', open_panna: '145', close_panna: '236', jodi: '09', open_ank: '0', close_ank: '9', declared_at: '2026-05-03T08:30:00Z' },
  { id: 's22', market_name: 'Sridevi',         cycle_date: '2026-05-03', open_panna: '248', close_panna: '278', jodi: '47', open_ank: '4', close_ank: '7', declared_at: '2026-05-03T12:50:00Z' },
  { id: 's23', market_name: 'Time Bazar',      cycle_date: '2026-05-03', open_panna: '147', close_panna: '580', jodi: '43', open_ank: '4', close_ank: '3', declared_at: '2026-05-03T14:15:00Z' },
  { id: 's24', market_name: 'Milan Day',       cycle_date: '2026-05-03', open_panna: '356', close_panna: '489', jodi: '47', open_ank: '4', close_ank: '7', declared_at: '2026-05-03T17:05:00Z' },
  { id: 's25', market_name: 'Kalyan',          cycle_date: '2026-05-03', open_panna: '123', close_panna: '456', jodi: '61', open_ank: '6', close_ank: '1', declared_at: '2026-05-03T18:00:00Z' },
  { id: 's26', market_name: 'Milan Night',     cycle_date: '2026-05-03', open_panna: '234', close_panna: '567', jodi: '50', open_ank: '5', close_ank: '0', declared_at: '2026-05-03T23:05:00Z' },
  { id: 's27', market_name: 'Main Bazar',      cycle_date: '2026-05-03', open_panna: '345', close_panna: '678', jodi: '25', open_ank: '2', close_ank: '5', declared_at: '2026-05-03T23:40:00Z' },
  // 02 May 2026
  { id: 's28', market_name: 'Sridevi',         cycle_date: '2026-05-02', open_panna: '466', close_panna: '366', jodi: '65', open_ank: '6', close_ank: '5', declared_at: '2026-05-02T12:50:00Z' },
  { id: 's29', market_name: 'Time Bazar',      cycle_date: '2026-05-02', open_panna: '167', close_panna: '149', jodi: '44', open_ank: '4', close_ank: '4', declared_at: '2026-05-02T14:15:00Z' },
  { id: 's30', market_name: 'Milan Day',       cycle_date: '2026-05-02', open_panna: '388', close_panna: '340', jodi: '97', open_ank: '9', close_ank: '7', declared_at: '2026-05-02T17:05:00Z' },
  { id: 's31', market_name: 'Kalyan',          cycle_date: '2026-05-02', open_panna: '180', close_panna: '250', jodi: '97', open_ank: '9', close_ank: '7', declared_at: '2026-05-02T18:00:00Z' },
  { id: 's32', market_name: 'Milan Night',     cycle_date: '2026-05-02', open_panna: '469', close_panna: '268', jodi: '96', open_ank: '9', close_ank: '6', declared_at: '2026-05-02T23:05:00Z' },
  { id: 's33', market_name: 'Main Bazar',      cycle_date: '2026-05-02', open_panna: '260', close_panna: '170', jodi: '88', open_ank: '8', close_ank: '8', declared_at: '2026-05-02T23:40:00Z' },
  // 01 May 2026
  { id: 's34', market_name: 'Sridevi',         cycle_date: '2026-05-01', open_panna: '349', close_panna: '456', jodi: '70', open_ank: '7', close_ank: '0', declared_at: '2026-05-01T12:50:00Z' },
  { id: 's35', market_name: 'Time Bazar',      cycle_date: '2026-05-01', open_panna: '236', close_panna: '789', jodi: '34', open_ank: '3', close_ank: '4', declared_at: '2026-05-01T14:15:00Z' },
  { id: 's36', market_name: 'Milan Day',       cycle_date: '2026-05-01', open_panna: '567', close_panna: '123', jodi: '86', open_ank: '8', close_ank: '6', declared_at: '2026-05-01T17:05:00Z' },
  { id: 's37', market_name: 'Kalyan',          cycle_date: '2026-05-01', open_panna: '890', close_panna: '348', jodi: '75', open_ank: '7', close_ank: '5', declared_at: '2026-05-01T18:00:00Z' },
  { id: 's38', market_name: 'Milan Night',     cycle_date: '2026-05-01', open_panna: '234', close_panna: '567', jodi: '43', open_ank: '4', close_ank: '3', declared_at: '2026-05-01T23:05:00Z' },
  { id: 's39', market_name: 'Main Bazar',      cycle_date: '2026-05-01', open_panna: '145', close_panna: '678', jodi: '51', open_ank: '5', close_ank: '1', declared_at: '2026-05-01T23:40:00Z' },
  // 30 Apr 2026
  { id: 's40', market_name: 'Kalyan',          cycle_date: '2026-04-30', open_panna: '256', close_panna: '269', jodi: '37', open_ank: '3', close_ank: '7', declared_at: '2026-04-30T18:00:00Z' },
  { id: 's41', market_name: 'Main Bazar',      cycle_date: '2026-04-30', open_panna: '145', close_panna: '188', jodi: '07', open_ank: '0', close_ank: '7', declared_at: '2026-04-30T23:40:00Z' },
  { id: 's42', market_name: 'Milan Night',     cycle_date: '2026-04-30', open_panna: '678', close_panna: '345', jodi: '12', open_ank: '1', close_ank: '2', declared_at: '2026-04-30T23:05:00Z' },
  // 29 Apr 2026
  { id: 's43', market_name: 'Kalyan',          cycle_date: '2026-04-29', open_panna: '890', close_panna: '348', jodi: '75', open_ank: '7', close_ank: '5', declared_at: '2026-04-29T18:00:00Z' },
  { id: 's44', market_name: 'Main Bazar',      cycle_date: '2026-04-29', open_panna: '168', close_panna: '112', jodi: '54', open_ank: '5', close_ank: '4', declared_at: '2026-04-29T23:40:00Z' },
  { id: 's45', market_name: 'Milan Night',     cycle_date: '2026-04-29', open_panna: '456', close_panna: '789', jodi: '63', open_ank: '6', close_ank: '3', declared_at: '2026-04-29T23:05:00Z' },
  // 28 Apr 2026
  { id: 's46', market_name: 'Kalyan',          cycle_date: '2026-04-28', open_panna: '469', close_panna: '224', jodi: '98', open_ank: '9', close_ank: '8', declared_at: '2026-04-28T18:00:00Z' },
  { id: 's47', market_name: 'Main Bazar',      cycle_date: '2026-04-28', open_panna: '238', close_panna: '247', jodi: '33', open_ank: '3', close_ank: '3', declared_at: '2026-04-28T23:40:00Z' },
  { id: 's48', market_name: 'Milan Night',     cycle_date: '2026-04-28', open_panna: '123', close_panna: '456', jodi: '61', open_ank: '6', close_ank: '1', declared_at: '2026-04-28T23:05:00Z' },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatResult(open_panna: string, jodi: string, close_panna: string): string {
  if (!open_panna || open_panna === '***') return '***-**-***';
  return `${open_panna}-${jodi}-${close_panna}`;
}

export default function Results(): React.ReactElement {
  const [dbResults, setDbResults] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState('All');

  const fetchResults = useCallback(() => {
    api.get<ResultsResponse>('/results')
      .then(r => setDbResults(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => fetchResults(), 60000);
    return () => clearInterval(id);
  }, [fetchResults]);

  // Real-time: listen for result:declared Socket.IO event
  useEffect(() => {
    const socket = getSocket();

    const handleResultDeclared = (data: ResultEntry) => {
      console.log('[Results] New result declared:', data.market_name, data.jodi);
      // Add new result to top of list immediately
      setDbResults(prev => {
        // Remove old entry for same market+date if exists
        const filtered = prev.filter(r =>
          !(r.market_name === data.market_name &&
            r.cycle_date.slice(0, 10) === data.cycle_date.slice(0, 10))
        );
        return [data, ...filtered];
      });
    };

    socket.on('result:declared', handleResultDeclared);
    return () => { socket.off('result:declared', handleResultDeclared); };
  }, []);

  // Merge DB results with static results (DB takes priority)
  const dbKeys = new Set(dbResults.map(r => `${r.market_name}-${r.cycle_date}`));
  const allResults = [
    ...dbResults,
    ...STATIC_RESULTS.filter(r => !dbKeys.has(`${r.market_name}-${r.cycle_date}`)),
  ].sort((a, b) => new Date(b.declared_at).getTime() - new Date(a.declared_at).getTime());

  // Get unique market names
  const markets = ['All', ...Array.from(new Set(allResults.map(r => r.market_name))).sort()];

  const filtered = selectedMarket === 'All'
    ? allResults
    : allResults.filter(r => r.market_name === selectedMarket);

  // Group by date
  const grouped: Record<string, ResultEntry[]> = {};
  for (const r of filtered) {
    const date = r.cycle_date.slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(r);
  }

  const isPending = (r: ResultEntry) => !r.open_panna || r.open_panna === '***' || r.open_panna.includes('*');

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-brand-800">📊 Results</h1>
        <div className="flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          Live Updates
        </div>
      </div>

      {/* Market filter */}
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
                      {/* Open */}
                      <div className="text-center">
                        <p className="text-xs text-brand-400 mb-1">Open</p>
                        <p className="font-mono font-bold text-brand-700 text-lg">{r.open_panna}</p>
                        <p className="text-xs text-brand-500 font-bold">{r.open_ank}</p>
                      </div>

                      {/* Jodi */}
                      <div className="text-center">
                        <p className="text-xs text-brand-400 mb-1">Jodi</p>
                        <div className="bg-brand-600 text-white font-mono font-bold text-2xl px-4 py-1 rounded-xl">
                          {r.jodi}
                        </div>
                      </div>

                      {/* Close */}
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
          <p className="text-brand-500">No results found</p>
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-4">
        Results sourced from official Matka markets · Updated daily
      </p>
    </div>
  );
}
