import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface Market {
  id: string; name: string; open_time: string; close_time: string;
  result_time: string; computed_status: 'open' | 'locked' | 'closed';
  mins_until_lockout: number; is_open_yet: boolean;
}

// Convert HH:MM (24hr) to 12hr AM/PM format
function to12hr(time: string): string {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr);
  const m = mStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// Weekly off schedule (frontend display)
const WEEKLY_OFF: Record<string, number[]> = {
  'Main Bazar': [0, 6],
  'Milan Day': [0], 'Milan Night': [0], 'Milan Morning': [0],
  'Rajdhani Day': [0], 'Rajdhani Night': [0],
  'Time Bazar': [0], 'Time Bazar Morning': [0],
  'Madhur Day': [0], 'Madhur Night': [0], 'Madhur Morning': [0],
  'Kalyan': [0], 'Kalyan Morning': [0], 'Kalyan Night': [0],
  'Sridevi': [0], 'Sridevi Morning': [0], 'Sridevi Night': [0],
  'Supreme Day': [0], 'Supreme Night': [0],
};

interface MarketsResponse { data: { markets: Market[] } | Market[]; }

// Countdown timer hook — counts down to a target HH:MM time today
function useCountdown(targetTime: string): string {
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const [th, tm] = targetTime.split(':').map(Number);
      // lockout = 15 min before result
      const lockoutMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), th, tm - 15, 0).getTime();
      const diff = lockoutMs - now.getTime();
      if (diff <= 0) { setCountdown('Closing soon'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime]);
  return countdown;
}

export default function Lobby(): React.ReactElement {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.get<MarketsResponse>('/markets').then(res => {
      const raw = res.data.data;
      const list: Market[] = Array.isArray(raw) ? raw : (raw as { markets: Market[] }).markets ?? [];
      setMarkets(list);
    }).catch(() => { if (!silent) setError('Failed to load markets.'); })
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => { fetchMarkets(); }, [fetchMarkets]);
  useEffect(() => {
    const id = setInterval(() => fetchMarkets(true), 30000);
    return () => clearInterval(id);
  }, [fetchMarkets]);

  useEffect(() => {
    const socket = getSocket();
    markets.forEach(m => socket.emit('join:market', m.id));
    const onLocked = (d: { marketId: string }) =>
      setMarkets(p => p.map(m => m.id === d.marketId ? { ...m, computed_status: 'locked' } : m));
    const onClosed = (d: { marketId: string }) =>
      setMarkets(p => p.map(m => m.id === d.marketId ? { ...m, computed_status: 'closed' } : m));
    socket.on('market:locked', onLocked);
    socket.on('market:closed', onClosed);
    return () => { socket.off('market:locked', onLocked); socket.off('market:closed', onClosed); };
  }, [markets]);

  if (loading) return <LoadingSpinner />;

  const openMarkets = markets.filter(m => m.computed_status === 'open');
  const lockedMarkets = markets.filter(m => m.computed_status === 'locked');
  const closedMarkets = markets.filter(m => m.computed_status === 'closed');

  const MarketCard = ({ market }: { market: Market }) => {
    const isOpen = market.computed_status === 'open';
    const isLocked = market.computed_status === 'locked';
    const isClosed = market.computed_status === 'closed';
    const countdown = useCountdown(market.result_time);

    return (
      <div
        onClick={() => !isClosed && !isLocked && navigate(`/user/bet/${market.id}`)}
        className={`rounded-2xl overflow-hidden shadow-md transition-all ${isClosed || isLocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
        style={{ background: isOpen ? 'linear-gradient(135deg, #5b4fdc, #6c6be9)' : isLocked ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #6b7280, #4b5563)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-white font-bold text-base">{market.name}</span>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${isOpen ? 'bg-green-400 text-green-900' : isLocked ? 'bg-yellow-200 text-yellow-900' : 'bg-gray-300 text-gray-700'}`}>
            {isOpen ? '● OPEN' : isLocked ? '⏰ BET CLOSED' : '🔒 CLOSED'}
          </span>
        </div>
        <div className="bg-white/10 px-4 py-3">
          <div className="grid grid-cols-3 gap-2 text-center mb-2">
            <div>
              <p className="text-white/60 text-xs">Open</p>
              <p className="text-white font-bold text-sm">{to12hr(market.open_time)}</p>
            </div>
            <div>
              <p className="text-white/60 text-xs">Close</p>
              <p className="text-white font-bold text-sm">{to12hr(market.close_time)}</p>
            </div>
            <div>
              <p className="text-white/60 text-xs">Result</p>
              <p className="text-white font-bold text-sm">{to12hr(market.result_time)}</p>
            </div>
          </div>
          {isOpen && countdown && (
            <div className="bg-yellow-400/20 rounded-lg px-3 py-1.5 text-center mb-2">
              <p className="text-yellow-200 text-xs font-medium">⏱ Bet closes in {countdown}</p>
            </div>
          )}
          {isOpen && (
            <div className="bg-white/20 text-white text-center rounded-xl py-2 text-sm font-bold">
              🎯 Play Now
            </div>
          )}
          {isLocked && (
            <div className="bg-yellow-400/20 text-yellow-200 text-center rounded-xl py-2 text-sm font-bold">
              ⏰ Betting Closed
            </div>
          )}
          {isClosed && (
            <div className="bg-white/10 text-white/60 text-center rounded-xl py-2 text-sm">
              🔒 Closed for Today
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-4 pb-24">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {openMarkets.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-brand-700 mb-3 flex items-center gap-2 uppercase tracking-wider">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Live Markets ({openMarkets.length})
          </h2>
          <div className="space-y-3">{openMarkets.map(m => <MarketCard key={m.id} market={m} />)}</div>
        </div>
      )}

      {lockedMarkets.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-brand-700 mb-3 flex items-center gap-2 uppercase tracking-wider">
            <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
            Bet Closed ({lockedMarkets.length})
          </h2>
          <div className="space-y-3">{lockedMarkets.map(m => <MarketCard key={m.id} market={m} />)}</div>
        </div>
      )}

      {closedMarkets.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-brand-700 mb-3 flex items-center gap-2 uppercase tracking-wider">
            <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
            Closed Today ({closedMarkets.length})
          </h2>
          <div className="space-y-3">{closedMarkets.map(m => <MarketCard key={m.id} market={m} />)}</div>
        </div>
      )}

      {markets.length === 0 && !error && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-brand-600 font-medium">No markets available</p>
        </div>
      )}
    </div>
  );
}
