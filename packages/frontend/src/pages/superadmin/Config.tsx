/**
 * SuperAdmin platform config page — /superadmin/config
 *
 * Winning multipliers, UPI details, Result API endpoint, poll interval,
 * and feature toggles.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface PlatformConfig {
  winning_multipliers: Record<string, number>;
  result_api_endpoint: string;
  result_poll_interval_sec: number;
  upi_details: string;
  feature_flags: Record<string, boolean>;
}

interface ConfigResponse {
  data: PlatformConfig;
}

const BET_TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  jodi: 'Jodi',
  single_panna: 'Single Panna',
  double_panna: 'Double Panna',
  triple_panna: 'Triple Panna',
  half_sangam: 'Half Sangam',
  full_sangam: 'Full Sangam',
};

const DEFAULT_MULTIPLIERS: Record<string, number> = {
  single: 9,
  jodi: 90,
  single_panna: 150,
  double_panna: 300,
  triple_panna: 600,
  half_sangam: 1000,
  full_sangam: 10000,
};

export default function SuperAdminConfig(): React.ReactElement {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [multipliers, setMultipliers] = useState<Record<string, string>>({});
  const [resultApiEndpoint, setResultApiEndpoint] = useState('');
  const [pollInterval, setPollInterval] = useState('300');
  const [upiDetails, setUpiDetails] = useState('');
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api
      .get<ConfigResponse>('/superadmin/config')
      .then((res) => {
        const c = res.data.data;
        setConfig(c);
        // Populate form
        const mults: Record<string, string> = {};
        for (const [key, val] of Object.entries(c.winning_multipliers)) {
          mults[key] = String(val);
        }
        setMultipliers(mults);
        setResultApiEndpoint(c.result_api_endpoint);
        setPollInterval(String(c.result_poll_interval_sec));
        setUpiDetails(c.upi_details);
        setFeatureFlags({ ...c.feature_flags });
      })
      .catch(() => {
        setError('Failed to load config.');
        // Use defaults
        const mults: Record<string, string> = {};
        for (const [key, val] of Object.entries(DEFAULT_MULTIPLIERS)) {
          mults[key] = String(val);
        }
        setMultipliers(mults);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const parsedMultipliers: Record<string, number> = {};
      for (const [key, val] of Object.entries(multipliers)) {
        const num = parseFloat(val);
        if (isNaN(num) || num <= 0) {
          setError(`Invalid multiplier for ${BET_TYPE_LABELS[key] ?? key}.`);
          setSaving(false);
          return;
        }
        parsedMultipliers[key] = num;
      }

      await api.put('/superadmin/config', {
        winning_multipliers: parsedMultipliers,
        result_api_endpoint: resultApiEndpoint,
        result_poll_interval_sec: parseInt(pollInterval, 10),
        upi_details: upiDetails,
        feature_flags: featureFlags,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message ?? 'Failed to save config.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Platform Config</h1>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-200 rounded-lg px-4 py-3 text-sm">
          Configuration saved successfully.
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        {/* Winning multipliers */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Winning Multipliers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.keys(DEFAULT_MULTIPLIERS).map((key) => (
              <div key={key}>
                <label
                  htmlFor={`mult-${key}`}
                  className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                >
                  {BET_TYPE_LABELS[key] ?? key}
                </label>
                <input
                  id={`mult-${key}`}
                  type="number"
                  min={1}
                  step="0.01"
                  value={multipliers[key] ?? ''}
                  onChange={(e) => setMultipliers((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
        </div>

        {/* UPI details */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">UPI Details</h2>
          <textarea
            value={upiDetails}
            onChange={(e) => setUpiDetails(e.target.value)}
            rows={3}
            placeholder="UPI ID, QR code URL, or payment instructions"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Result API */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Result API</h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="resultApi" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Endpoint URL
              </label>
              <input
                id="resultApi"
                type="url"
                value={resultApiEndpoint}
                onChange={(e) => setResultApiEndpoint(e.target.value)}
                placeholder="https://api.example.com/results"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="pollInterval" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Poll Interval (seconds)
              </label>
              <input
                id="pollInterval"
                type="number"
                min={60}
                value={pollInterval}
                onChange={(e) => setPollInterval(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Feature toggles */}
        {Object.keys(featureFlags).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Feature Toggles</h2>
            <div className="space-y-3">
              {Object.entries(featureFlags).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFeatureFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[44px] ${
                      value ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    role="switch"
                    aria-checked={value}
                    aria-label={key}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        value ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-lg py-3 text-sm transition-colors min-h-[44px]"
        >
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </form>
    </div>
  );
}
