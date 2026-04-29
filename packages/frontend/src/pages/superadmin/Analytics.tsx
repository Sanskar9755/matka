/**
 * SuperAdmin analytics page — /superadmin/analytics
 *
 * Displays total users, total deposited, total withdrawn, platform revenue.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';

interface Analytics {
  total_users: number;
  total_deposited: number;
  total_withdrawn: number;
  platform_revenue: number;
}

interface AnalyticsResponse {
  data: Analytics;
}

interface StatCardProps {
  label: string;
  value: string | number;
  color: string;
}

function StatCard({ label, value, color }: StatCardProps): React.ReactElement {
  return (
    <div className={`rounded-xl p-5 ${color}`}>
      <p className="text-sm font-medium opacity-80 mb-1">{label}</p>
      <p className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    </div>
  );
}

export default function SuperAdminAnalytics(): React.ReactElement {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AnalyticsResponse>('/superadmin/analytics')
      .then((res) => {
        setAnalytics(res.data.data);
      })
      .catch(() => {
        setError('Failed to load analytics.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Analytics</h1>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            label="Total Users"
            value={analytics.total_users}
            color="bg-indigo-50 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-100"
          />
          <StatCard
            label="Total Deposited"
            value={`${analytics.total_deposited.toLocaleString()} pts`}
            color="bg-green-50 dark:bg-green-900 text-green-800 dark:text-green-100"
          />
          <StatCard
            label="Total Withdrawn"
            value={`${analytics.total_withdrawn.toLocaleString()} pts`}
            color="bg-orange-50 dark:bg-orange-900 text-orange-800 dark:text-orange-100"
          />
          <StatCard
            label="Platform Revenue"
            value={`${analytics.platform_revenue.toLocaleString()} pts`}
            color="bg-purple-50 dark:bg-purple-900 text-purple-800 dark:text-purple-100"
          />
        </div>
      )}
    </div>
  );
}
