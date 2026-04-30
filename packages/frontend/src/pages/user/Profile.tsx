/**
 * User Profile page — /user/profile
 * Shows user's account details, wallet, and stats.
 */
import React, { useEffect, useState } from 'react';
import api from '../../utils/api.js';
import { LoadingSpinner } from '../../components/LoadingSpinner.js';
import { ErrorBanner } from '../../components/ErrorBanner.js';
import { useAuth } from '../../context/AuthContext.js';
import { useNavigate } from 'react-router-dom';

interface UserProfile {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  admin_name: string;
  wallet: {
    balance_points: number;
    held_points: number;
    available_points: number;
  };
  stats: {
    total_bets: number;
    total_bet_amount: number;
    total_winnings: number;
  };
}

interface ProfileResponse {
  data: UserProfile;
}

export default function Profile(): React.ReactElement {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ProfileResponse>('/user/profile')
      .then((res) => setProfile(res.data.data))
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  function handleLogout(): void {
    logout();
    navigate('/login', { replace: true });
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {profile && (
        <div className="space-y-4">
          {/* Profile card */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl font-bold">
                {profile.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{profile.username}</h1>
                <p className="text-indigo-200 text-sm capitalize">{profile.role} Account</p>
                <p className="text-indigo-200 text-xs">
                  {profile.is_active ? '✅ Active' : '❌ Inactive'}
                </p>
              </div>
            </div>
            <div className="border-t border-white/20 pt-3">
              <p className="text-indigo-200 text-xs">Under Admin</p>
              <p className="font-semibold">{profile.admin_name}</p>
            </div>
            <div className="border-t border-white/20 pt-3 mt-3">
              <p className="text-indigo-200 text-xs">Member Since</p>
              <p className="font-semibold">{new Date(profile.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>

          {/* Wallet card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">💰 Wallet</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Total Balance</p>
                <p className="text-xl font-bold text-indigo-600">{profile.wallet.balance_points.toLocaleString()}</p>
                <p className="text-xs text-gray-400">pts</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Held</p>
                <p className="text-xl font-bold text-orange-500">{profile.wallet.held_points.toLocaleString()}</p>
                <p className="text-xs text-gray-400">pts</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Available</p>
                <p className="text-xl font-bold text-green-600">{profile.wallet.available_points.toLocaleString()}</p>
                <p className="text-xs text-gray-400">pts</p>
              </div>
            </div>
          </div>

          {/* Stats card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">📊 Stats</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Bets Placed</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{profile.stats.total_bets}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Amount Bet</span>
                <span className="font-bold text-red-500">{profile.stats.total_bet_amount.toLocaleString()} pts</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Winnings</span>
                <span className="font-bold text-green-600">{profile.stats.total_winnings.toLocaleString()} pts</span>
              </div>
              <div className="flex justify-between items-center border-t pt-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Net P&L</span>
                <span className={`font-bold text-lg ${profile.stats.total_winnings - profile.stats.total_bet_amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {profile.stats.total_winnings - profile.stats.total_bet_amount >= 0 ? '+' : ''}
                  {(profile.stats.total_winnings - profile.stats.total_bet_amount).toLocaleString()} pts
                </span>
              </div>
            </div>
          </div>

          {/* Account ID */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">🔑 Account ID</h2>
            <p className="font-mono text-xs text-gray-500 break-all">{profile.id}</p>
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors min-h-[44px]"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
