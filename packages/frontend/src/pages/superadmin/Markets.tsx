/**
 * SuperAdmin market management page — /superadmin/markets
 *
 * Lists all markets. Create/edit market form. Activate/deactivate toggle.
 * Manual result entry form per market.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface Market {
  id: string;
  name: string;
  open_time: string;
  close_time: string;
  result_time: string;
  status: string;
  is_active: boolean;
}

interface MarketsResponse {
  data: { markets: Market[] } | Market[];
}

interface MarketFormData {
  name: string;
  open_time: string;
  close_time: string;
  result_time: string;
}

const EMPTY_FORM: MarketFormData = {
  name: '',
  open_time: '',
  close_time: '',
  result_time: '',
};

export default function SuperAdminMarkets(): React.ReactElement {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create/edit form
  const [editingMarket, setEditingMarket] = useState<Market | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<MarketFormData>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Manual result entry
  const [resultMarketId, setResultMarketId] = useState<string | null>(null);
  const [resultData, setResultData] = useState({
    open_panna: '',
    close_panna: '',
    jodi: '',
    open_ank: '',
    close_ank: '',
  });
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  const [resultSuccess, setResultSuccess] = useState(false);

  function fetchMarkets(): void {
    api
      .get<MarketsResponse>('/markets')
      .then((res) => {
        const raw = res.data.data;
        const list: Market[] = Array.isArray(raw) ? raw : (raw as { markets: Market[] }).markets ?? [];
        setMarkets(list);
      })
      .catch(() => {
        setError('Failed to load markets.');
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchMarkets();
  }, []);

  function openCreate(): void {
    setEditingMarket(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(market: Market): void {
    setEditingMarket(market);
    setFormData({
      name: market.name,
      open_time: market.open_time,
      close_time: market.close_time,
      result_time: market.result_time,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleFormSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim() || !formData.open_time || !formData.close_time || !formData.result_time) {
      setFormError('All fields are required.');
      return;
    }

    setFormLoading(true);
    try {
      if (editingMarket) {
        await api.put(`/markets/${editingMarket.id}`, formData);
      } else {
        await api.post('/markets', formData);
      }
      setShowForm(false);
      setEditingMarket(null);
      fetchMarkets();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setFormError(axiosErr.response?.data?.error?.message ?? 'Failed to save market.');
    } finally {
      setFormLoading(false);
    }
  }

  async function toggleStatus(market: Market): Promise<void> {
    try {
      await api.patch(`/markets/${market.id}/status`, { is_active: !market.is_active });
      setMarkets((prev) =>
        prev.map((m) => (m.id === market.id ? { ...m, is_active: !m.is_active } : m)),
      );
    } catch {
      setError('Failed to update market status.');
    }
  }

  async function handleResultSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!resultMarketId) return;
    setResultError(null);
    setResultSuccess(false);
    setResultLoading(true);

    try {
      await api.post(`/superadmin/results/${resultMarketId}`, resultData);
      setResultSuccess(true);
      setResultData({ open_panna: '', close_panna: '', jodi: '', open_ank: '', close_ank: '' });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setResultError(axiosErr.response?.data?.error?.message ?? 'Failed to submit result.');
    } finally {
      setResultLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Markets</h1>
        <button
          onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors min-h-[44px]"
        >
          + New Market
        </button>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Create/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editingMarket ? 'Edit Market' : 'Create Market'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-3">
                <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />
              </div>
            )}

            <form onSubmit={(e) => void handleFormSubmit(e)} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Market Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Mumbai Morning"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Open Time (HH:MM)
                </label>
                <input
                  type="time"
                  value={formData.open_time}
                  onChange={(e) => setFormData((p) => ({ ...p, open_time: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Close Time (HH:MM)
                </label>
                <input
                  type="time"
                  value={formData.close_time}
                  onChange={(e) => setFormData((p) => ({ ...p, close_time: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Result Time (HH:MM)
                </label>
                <input
                  type="time"
                  value={formData.result_time}
                  onChange={(e) => setFormData((p) => ({ ...p, result_time: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={formLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition-colors min-h-[44px]"
              >
                {formLoading ? 'Saving…' : editingMarket ? 'Update Market' : 'Create Market'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Manual result entry modal */}
      {resultMarketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Enter Result</h2>
              <button
                onClick={() => { setResultMarketId(null); setResultSuccess(false); setResultError(null); }}
                className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {resultSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400 mb-3">Result submitted successfully.</p>
            )}
            {resultError && (
              <div className="mb-3">
                <ErrorBanner message={resultError} onDismiss={() => setResultError(null)} />
              </div>
            )}

            <form onSubmit={(e) => void handleResultSubmit(e)} className="space-y-3">
              {(['open_panna', 'close_panna', 'jodi', 'open_ank', 'close_ank'] as const).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 capitalize">
                    {field.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={resultData[field]}
                    onChange={(e) => setResultData((p) => ({ ...p, [field]: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={field.includes('panna') ? '123' : field === 'jodi' ? '56' : '5'}
                  />
                </div>
              ))}
              <button
                type="submit"
                disabled={resultLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition-colors min-h-[44px]"
              >
                {resultLoading ? 'Submitting…' : 'Submit Result'}
              </button>
            </form>
          </div>
        </div>
      )}

      {markets.length === 0 && !error && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">No markets found.</p>
      )}

      <div className="space-y-3">
        {markets.map((market) => (
          <div
            key={market.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{market.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {market.open_time} – {market.close_time} · Result: {market.result_time}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full capitalize ${
                  market.is_active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                }`}
              >
                {market.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => openEdit(market)}
                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg px-3 py-1.5 transition-colors min-h-[44px]"
              >
                Edit
              </button>
              <button
                onClick={() => void toggleStatus(market)}
                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg px-3 py-1.5 transition-colors min-h-[44px]"
              >
                {market.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => { setResultMarketId(market.id); setResultSuccess(false); setResultError(null); }}
                className="text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded-lg px-3 py-1.5 transition-colors min-h-[44px]"
              >
                Enter Result
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
