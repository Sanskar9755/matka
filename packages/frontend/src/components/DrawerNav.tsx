/**
 * DrawerNav — Slide-out navigation drawer for User panel.
 * Opens from left side, shows profile + all menu items.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import api from '../utils/api.js';

interface ProfileResponse {
  data: {
    username: string;
    admin_name: string;
    wallet: { balance_points: number };
  };
}

interface DrawerNavProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { icon: '🏠', label: 'Home', path: '/user/lobby' },
  { icon: '💰', label: 'Funds', path: '/user/wallet' },
  { icon: '📖', label: 'Passbook', path: '/user/history' },
  { icon: '🎯', label: 'Bid History', path: '/user/history' },
  { icon: '🏆', label: 'Winning History', path: '/user/history' },
  { icon: '📊', label: 'Game Rates', path: '/user/game-rates' },
  { icon: '📋', label: 'Notice Board/Rules', path: '/user/notice-board' },
  { icon: '▶️', label: 'How to Play', path: '/user/how-to-play' },
  { icon: '👤', label: 'Profile', path: '/user/profile' },
];

export function DrawerNav({ isOpen, onClose }: DrawerNavProps): React.ReactElement {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [profile, setProfile] = useState<{ username: string; admin_name: string; balance: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    api.get<ProfileResponse>('/user/profile')
      .then((res) => {
        setProfile({
          username: res.data.data.username,
          admin_name: res.data.data.admin_name,
          balance: res.data.data.wallet.balance_points,
        });
      })
      .catch(() => {});
  }, [isOpen]);

  function handleNav(path: string): void {
    navigate(path);
    onClose();
  }

  function handleLogout(): void {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 h-full w-72 z-50 bg-white dark:bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Profile header — dark red like screenshot */}
        <div className="px-5 py-6 relative" style={{ background: 'linear-gradient(135deg, #4d40c2 0%, #6c6be9 100%)' }}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-white/70 hover:text-white text-xl w-8 h-8 flex items-center justify-center"
            aria-label="Close menu"
          >
            ✕
          </button>

          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-lg">{profile?.username ?? '...'}</p>
              <p className="text-white/70 text-sm">Admin: {profile?.admin_name ?? '...'}</p>
              <p className="text-white/90 text-sm font-semibold mt-0.5">
                💰 {profile?.balance?.toLocaleString() ?? '0'} pts
              </p>
            </div>
          </div>
        </div>

        {/* Menu items */}
        <div className="flex-1 overflow-y-auto py-2">
          {menuItems.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleNav(item.path)}
              className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="text-xl w-7 text-center">{item.icon}</span>
              <span className="text-gray-800 dark:text-gray-200 font-medium">{item.label}</span>
            </button>
          ))}

          <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

          {/* Share with Friends */}
          <button
            onClick={() => {
              if (navigator.share) {
                void navigator.share({ title: 'Matka Platform', text: 'Join me on Matka Platform!', url: window.location.origin });
              }
              onClose();
            }}
            className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-xl w-7 text-center">🔗</span>
            <span className="text-gray-800 dark:text-gray-200 font-medium">Share with Friends</span>
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <span className="text-xl w-7 text-center">🚪</span>
            <span className="text-red-600 font-medium">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
}
