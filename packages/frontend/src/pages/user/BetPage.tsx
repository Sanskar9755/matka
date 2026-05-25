import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

type BetType = 'single' | 'jodi' | 'single_panna' | 'double_panna' | 'triple_panna' | 'half_sangam' | 'full_sangam';

// Convert HH:MM (24hr) to 12hr AM/PM
function to12hr(time: string): string {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
}

interface Market {
  id: string; name: string; open_time: string; close_time: string;
  result_time: string; open_result_time: string;
  computed_status: 'open' | 'locked' | 'closed';
  open_session_locked: boolean;
  mins_until_lockout: number; is_open_yet: boolean;
}

interface SelectedBet { id: string; selection: string; points: string; betType: BetType; session: 'open' | 'close'; }

// Exact official panna lists
const SP: Record<number, string[]> = {
  0: ['127','136','145','190','235','280','370','389','460','479','569','578'],
  1: ['128','137','146','236','245','290','380','470','489','560','579','678'],
  2: ['129','138','147','156','237','246','345','390','480','570','589','679'],
  3: ['120','139','148','157','238','247','256','346','490','580','670','689'],
  4: ['130','149','158','167','239','248','257','347','356','590','680','789'],
  5: ['140','159','168','230','249','258','267','348','357','456','690','780'],
  6: ['123','150','169','178','240','259','268','349','358','367','457','790'],
  7: ['124','160','179','250','269','278','340','359','368','458','467','890'],
  8: ['125','134','170','189','260','279','350','369','378','459','468','567'],
  9: ['126','135','180','234','270','289','360','379','450','469','478','568'],
};
const DP: Record<number, string[]> = {
  0: ['118','226','244','299','334','488','550','668','677'],
  1: ['100','119','155','227','335','344','399','588','669'],
  2: ['110','200','228','255','336','499','660','688','778'],
  3: ['166','229','300','337','355','445','599','779','788'],
  4: ['112','220','266','338','400','446','455','699','770'],
  5: ['113','122','177','339','366','447','500','799','889','555'],
  6: ['600','114','277','330','448','466','556','880','899'],
  7: ['115','133','188','223','377','449','557','566','700'],
  8: ['116','224','233','288','440','477','558','800','990'],
  9: ['117','144','199','225','388','559','577','667','900'],
};
const TP: Record<number, string[]> = {
  0:['000'],1:['777'],2:['444'],3:['111'],4:['888'],
  5:['555'],6:['222'],7:['999'],8:['666'],9:['333'],
};

const BET_TYPES = [
  { value: 'single' as BetType,       label: 'Single Ank',   short: 'Single Ank', hint: 'Digit 0-9',        mult: 9 },
  { value: 'jodi' as BetType,         label: 'Jodi',         short: 'Jodi',       hint: '00-99',             mult: 90 },
  { value: 'single_panna' as BetType, label: 'Single Panna', short: 'SP',         hint: 'All diff digits',   mult: 150 },
  { value: 'double_panna' as BetType, label: 'Double Panna', short: 'DP',         hint: '2 same digits',     mult: 300 },
  { value: 'triple_panna' as BetType, label: 'Triple Panna', short: 'TP',         hint: 'All same',          mult: 600 },
  { value: 'half_sangam' as BetType,  label: 'Half Sangam',  short: 'HS',         hint: 'e.g. 123-5',        mult: 1000 },
  { value: 'full_sangam' as BetType,  label: 'Full Sangam',  short: 'FS',         hint: 'e.g. 123-456',      mult: 10000 },
];

export default function BetPage(): React.ReactElement {
  const { marketId } = useParams<{ marketId: string }>();
  const navigate = useNavigate();

  const [market, setMarket] = useState<Market | null>(null);
  const [balance, setBalance] = useState(0);
  const [multipliers, setMultipliers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [betType, setBetType] = useState<BetType>('single');
  const [session, setSession] = useState<'open' | 'close'>('open');
  const [currentSel, setCurrentSel] = useState('');
  const [currentPts, setCurrentPts] = useState('');
  const [bets, setBets] = useState<SelectedBet[]>([]);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!marketId) return;
    setLoading(true);
    Promise.all([
      api.get<{ data: { markets?: Market[] } | Market[] }>('/markets'),
      api.get<{ data: { balance_points: number } }>('/wallet/balance'),
      api.get<{ data: { winning_multipliers: Record<string, number> } }>('/public/rates').catch(() => null),
    ]).then(([mRes, wRes, cRes]) => {
      const raw = mRes.data.data;
      const list: Market[] = Array.isArray(raw) ? raw : (raw as { markets: Market[] }).markets ?? [];
      setMarket(list.find(m => m.id === marketId) ?? null);
      setBalance(wRes.data.data.balance_points);
      // Config may return 403 for non-superadmin — use defaults in that case
      if (cRes && cRes.data?.data?.winning_multipliers) {
        setMultipliers(cRes.data.data.winning_multipliers);
      }
    }).catch(() => setError('Failed to load.')).finally(() => setLoading(false));
  }, [marketId]);

  // Countdown to lockout (result_time - 15 min)
  useEffect(() => {
    if (!market) return;
    const tick = () => {
      const now = new Date();
      const [rh, rm] = market.result_time.split(':').map(Number);
      const lockoutMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), rh, rm - 15, 0).getTime();
      const diff = lockoutMs - now.getTime();
      if (diff <= 0) { setCountdown('Closing soon!'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [market]);

  const getMult = useCallback((t: BetType): number => {
    // Use DB multipliers if available, else fallback to hardcoded defaults
    if (multipliers && Object.keys(multipliers).length > 0) {
      const val = multipliers[t];
      if (val !== undefined && val > 0) return val;
    }
    // Hardcoded fallback (official Matka rates)
    const defaults: Record<BetType, number> = {
      single: 9,
      jodi: 90,
      single_panna: 150,
      double_panna: 300,
      triple_panna: 600,
      half_sangam: 1000,
      full_sangam: 10000,
    };
    return defaults[t] ?? 1;
  }, [multipliers]);

  const isLocked = market?.computed_status === 'locked';
  const isClosed = market?.computed_status === 'closed';
  const isOpenLocked = market?.open_session_locked ?? false; // open bets locked (open result declared)
  const canBet = !isLocked && !isClosed;
  const canOpenBet = canBet && !isOpenLocked;
  const canCloseBet = canBet;

  // Auto-switch to close session when open gets locked
  useEffect(() => {
    if (isOpenLocked && session === 'open') {
      setSession('close');
    }
  }, [isOpenLocked, session]);

  const showPanaGrid = ['single_panna','double_panna','triple_panna'].includes(betType);
  const pannaData = betType === 'single_panna' ? SP : betType === 'double_panna' ? DP : TP;

  function addBet() {
    if (!currentSel.trim() || !currentPts.trim() || parseInt(currentPts) <= 0) return;
    setBets(p => [...p, { id: Date.now().toString(), selection: currentSel.trim(), points: currentPts, betType, session }]);
    setCurrentSel('');
    setCurrentPts('');
  }

  const totalPts = bets.reduce((s, b) => s + (parseInt(b.points) || 0), 0);
  const insufficient = totalPts > balance;

  async function submitAll() {
    if (!bets.length || insufficient) return;
    setSubmitting(true); setError(null); setSuccessMsg(null);
    let ok = 0, fail = 0;
    for (const bet of bets) {
      const pts = parseInt(bet.points);
      if (!pts || pts <= 0) continue;
      try {
        await api.post('/bets', { marketId, betType: bet.betType, selection: bet.selection, points: pts, session: bet.session });
        ok++;
      } catch { fail++; }
    }
    api.get<{ data: { balance_points: number } }>('/wallet/balance').then(r => setBalance(r.data.data.balance_points)).catch(() => {});
    if (ok > 0) { setSuccessMsg(`✅ ${ok} bet${ok > 1 ? 's' : ''} placed!${fail ? ` (${fail} failed)` : ''}`); setBets([]); }
    else setError('All bets failed. Please try again.');
    setSubmitting(false);
  }

  if (loading) return <LoadingSpinner />;
  if (!market) return (
    <div className="px-4 py-8 text-center">
      <p className="text-brand-600">Market not found.</p>
      <button onClick={() => navigate('/user/lobby')} className="mt-4 text-brand-600 underline">Back</button>
    </div>
  );

  const mult = getMult(betType);
  const previewWin = parseInt(currentPts) > 0 ? parseInt(currentPts) * mult : 0;
  return (
    <div className="px-4 py-4 max-w-lg mx-auto pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/user/lobby')}
          className="w-10 h-10 bg-brand-100 text-brand-700 rounded-xl flex items-center justify-center font-bold text-lg">←</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-brand-800">{market.name}</h1>
          <p className="text-xs text-brand-500">{to12hr(market.open_time)} – {to12hr(market.close_time)} · Result: {to12hr(market.result_time)}</p>
        </div>
        <div className={`text-xs font-bold px-3 py-1.5 rounded-full ${
          isClosed ? 'bg-gray-100 text-gray-600' :
          isLocked ? 'bg-orange-100 text-orange-700 animate-pulse' :
          'bg-green-100 text-green-700'
        }`}>
          {isClosed ? '🔒 Closed' : isLocked ? '⏰ Locked' : '● Open'}
        </div>
      </div>

      {/* Countdown */}
      {canBet && (
        <div className="bg-brand-600 text-white rounded-2xl px-4 py-3 mb-4 flex items-center justify-between shadow-lg">
          <span className="text-sm font-medium opacity-80">⏱ Result in</span>
          <span className="text-xl font-bold">{countdown}</span>
        </div>
      )}

      {/* Closed/Locked banners */}
      {isClosed && (
        <div className="bg-gray-100 border border-gray-200 rounded-2xl p-4 mb-4 text-center">
          <p className="text-gray-700 font-bold text-lg">🔒 Market Closed for Today</p>
          <p className="text-gray-500 text-sm mt-1">Reopens tomorrow at {market.open_time}</p>
        </div>
      )}
      {isLocked && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4 text-center">
          <p className="text-orange-700 font-bold text-lg">⏰ Betting Closed</p>
          <p className="text-orange-500 text-sm mt-1">Result declaring soon</p>
        </div>
      )}

      {/* Balance */}
      <div className="bg-white rounded-2xl border border-brand-100 px-4 py-3 mb-4 flex items-center justify-between shadow-sm">
        <span className="text-sm text-brand-600 font-medium">Your Balance</span>
        <span className="font-bold text-lg text-brand-700">₹ {balance.toLocaleString()}</span>
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      {successMsg && <div className="mb-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-green-700 font-medium text-sm">{successMsg}</div>}

      {canBet && (
        <>
          {/* Open / Close session */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => canOpenBet && setSession('open')}
              disabled={!canOpenBet}
              className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${
                !canOpenBet ? 'bg-gray-200 text-gray-400 cursor-not-allowed' :
                session === 'open' ? 'bg-brand-600 text-white shadow-md' : 'bg-brand-50 text-brand-600 border border-brand-200'
              }`}>
              {!canOpenBet ? '🔒 Open Locked' : '🟢 Open Bet'}
            </button>
            <button onClick={() => setSession('close')}
              className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${session === 'close' ? 'bg-red-600 text-white shadow-md' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              🔴 Close Bet
            </button>
          </div>

          {/* Open session locked banner */}
          {isOpenLocked && canCloseBet && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 mb-4 text-center">
              <p className="text-orange-700 font-bold text-sm">🔒 Open Result Declared — Only Close Bets Accepted</p>
            </div>
          )}

          {/* Bet type */}
          <div className="mb-4">
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Bet Type</p>
            <div className="grid grid-cols-3 gap-2">
              {BET_TYPES.map(bt => (
                <button key={bt.value} type="button"
                  onClick={() => { setBetType(bt.value); setCurrentSel(''); }}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border-2 transition-all ${
                    betType === bt.value ? 'border-brand-600 bg-brand-600 text-white' : 'border-brand-100 bg-white text-brand-700'
                  }`}>
                  <div className="text-sm">{bt.short}</div>
                  <div className="text-green-500 font-normal text-xs">{getMult(bt.value)}x</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-brand-400 mt-1">{BET_TYPES.find(b => b.value === betType)?.hint}</p>
          </div>

          {/* Single digit grid */}
          {betType === 'single' && (
            <div className="mb-4">
              <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Select Digit</p>
              <div className="grid grid-cols-5 gap-2">
                {['0','1','2','3','4','5','6','7','8','9'].map(d => (
                  <button key={d} type="button" onClick={() => setCurrentSel(d)}
                    className={`py-3 rounded-xl text-lg font-bold transition-all ${
                      currentSel === d ? 'bg-brand-600 text-white shadow-md scale-105' : 'bg-white text-brand-700 border-2 border-brand-100'
                    }`}>{d}</button>
                ))}
              </div>
            </div>
          )}

          {/* Pana grid */}
          {showPanaGrid && (
            <div className="mb-4">
              <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">
                Select {betType === 'single_panna' ? 'SP' : betType === 'double_panna' ? 'DP' : 'TP'} Panna
              </p>
              <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-hide">
                {[0,1,2,3,4,5,6,7,8,9].map(digit => {
                  const pannas = pannaData[digit];
                  if (!pannas?.length) return null;
                  return (
                    <div key={digit} className="bg-brand-50 rounded-xl p-2">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 bg-brand-600 text-white rounded-full flex items-center justify-center text-xs font-bold">{digit}</span>
                        <span className="text-xs text-brand-400">{pannas.length} pannas</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {pannas.map(pana => (
                          <button key={pana} type="button" onClick={() => setCurrentSel(pana)}
                            className={`py-2 rounded-lg text-sm font-bold transition-all ${
                              currentSel === pana ? 'bg-brand-600 text-white shadow-md scale-105' : 'bg-white text-brand-700 border border-brand-100'
                            }`}>{pana}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual input */}
          {['jodi','half_sangam','full_sangam'].includes(betType) && (
            <div className="mb-4">
              <label className="text-xs font-bold text-brand-700 uppercase tracking-wider block mb-1">Enter Selection</label>
              <input type="text" value={currentSel} onChange={e => setCurrentSel(e.target.value)}
                placeholder={betType === 'jodi' ? 'e.g. 56' : betType === 'half_sangam' ? 'e.g. 123-5' : 'e.g. 123-456'}
                className="w-full border-2 border-brand-200 rounded-xl px-4 py-3 text-lg font-mono bg-white text-brand-800 focus:outline-none focus:border-brand-500" />
            </div>
          )}

          {/* Points + Add */}
          {currentSel && (
            <div className="mb-4 bg-brand-50 border border-brand-200 rounded-2xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono font-bold text-brand-700 text-lg">{currentSel}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${session === 'open' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {session === 'open' ? '🟢 Open' : '🔴 Close'}
                </span>
              </div>
              <div className="flex gap-2">
                <input type="number" min={1} value={currentPts} onChange={e => setCurrentPts(e.target.value)}
                  placeholder="Points"
                  className="flex-1 border-2 border-brand-200 rounded-xl px-3 py-2 text-base bg-white text-brand-800 focus:outline-none focus:border-brand-500" />
                <button type="button" onClick={addBet} disabled={!currentPts || parseInt(currentPts) <= 0}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2 text-sm">
                  + Add
                </button>
              </div>
              {previewWin > 0 && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-green-600">Potential Win</span>
                    <span className="text-lg font-bold text-green-600">+{previewWin.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-green-500 mt-0.5">
                    {currentPts} pts × {getMult(betType)}x ({BET_TYPES.find(b => b.value === betType)?.label}) = {previewWin.toLocaleString()} pts
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Bets list — grouped by bet type */}
          {bets.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Your Bets ({bets.length})</p>

              {/* Group bets by betType */}
              {BET_TYPES.filter(bt => bets.some(b => b.betType === bt.value)).map(bt => {
                const groupBets = bets.filter(b => b.betType === bt.value);
                const groupTotal = groupBets.reduce((s, b) => s + (parseInt(b.points) || 0), 0);
                const groupWin = groupBets.reduce((s, b) => s + (parseInt(b.points) || 0) * getMult(bt.value), 0);

                return (
                  <div key={bt.value} className="mb-3 bg-white rounded-2xl border border-brand-100 overflow-hidden shadow-sm">
                    {/* Group header */}
                    <div className="bg-brand-600 px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm">{bt.label}</span>
                        <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">{getMult(bt.value)}x</span>
                        <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">{groupBets.length} bets</span>
                      </div>
                      <div className="text-right">
                        <p className="text-white/70 text-xs">{groupTotal} pts</p>
                        <p className="text-green-300 text-xs font-bold">+{groupWin.toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Bets in this group */}
                    <div className="divide-y divide-brand-50">
                      {groupBets.map(bet => {
                        const pts = parseInt(bet.points) || 0;
                        const winAmt = pts * getMult(bet.betType);
                        return (
                          <div key={bet.id} className="px-3 py-2 flex items-center gap-2">
                            <span className="font-mono font-bold text-brand-700 text-base w-14 flex-shrink-0">{bet.selection}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${bet.session === 'open' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {bet.session === 'open' ? 'Open' : 'Close'}
                            </span>
                            <input type="number" min={1} value={bet.points}
                              onChange={e => setBets(p => p.map(b => b.id === bet.id ? { ...b, points: e.target.value } : b))}
                              className="flex-1 border border-brand-200 rounded-lg px-2 py-1.5 text-sm bg-brand-50 text-brand-800 focus:outline-none focus:border-brand-500" />
                            <div className="text-right w-20 flex-shrink-0">
                              <p className="text-sm font-bold text-green-600">+{winAmt.toLocaleString()}</p>
                              <p className="text-xs text-gray-400">{pts}×{getMult(bet.betType)}</p>
                            </div>
                            <button type="button" onClick={() => setBets(p => p.filter(b => b.id !== bet.id))}
                              className="text-red-400 hover:text-red-600 text-xl font-bold w-6 flex-shrink-0 flex items-center justify-center">×</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Grand total */}
              <div className="bg-brand-700 rounded-xl px-4 py-3 text-white">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold opacity-80">Total Bet Amount</span>
                  <span className={`font-bold text-lg ${insufficient ? 'text-red-300' : 'text-white'}`}>
                    {totalPts.toLocaleString()} pts
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs opacity-70">Total Potential Win</span>
                  <span className="text-sm font-bold text-green-300">
                    +{bets.reduce((s, b) => s + (parseInt(b.points) || 0) * getMult(b.betType), 0).toLocaleString()} pts
                  </span>
                </div>
              </div>
              {insufficient && <p className="text-red-500 text-sm mt-1 font-medium text-center">⚠️ Insufficient Balance</p>}

              <button type="button" onClick={() => void submitAll()}
                disabled={insufficient || submitting || !bets.length}
                className="w-full mt-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-2xl py-4 text-base transition-all shadow-lg">
                {submitting ? 'Placing Bets…' : `🎯 Place ${bets.length} Bet${bets.length > 1 ? 's' : ''} · ${totalPts} pts`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
