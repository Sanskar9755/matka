/**
 * Layout wrapper for the User panel.
 * - Hamburger menu button (top-left) opens slide-out drawer
 * - Header shows username + wallet balance
 * - Bottom navigation for quick access
 */
import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav.js';
import { WalletBadge } from './WalletBadge.js';
import { DrawerNav } from './DrawerNav.js';
import { useAuth } from '../context/AuthContext.js';
import api from '../utils/api.js';

interface ProfileResponse {
  data: {
    username: string;
    admin_name: string;
  };
}

export default function Layout(): React.ReactElement {
  const { token } = useAuth();
  const [username, setUsername] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get<ProfileResponse>('/user/profile')
      .then((res) => setUsername(res.data.data.username))
      .catch(() => {});
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-red-800 px-4 py-3 flex items-center justify-between">
        {/* Hamburger button */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-white p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Open menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* App name + username */}
        <div className="text-center">
          <p className="text-white font-bold text-base leading-tight">Matka Platform</p>
          {username && <p className="text-white/70 text-xs">{username}</p>}
        </div>

        {/* Wallet badge */}
        <WalletBadge />
      </header>

      {/* Slide-out drawer */}
      <DrawerNav isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Page content */}
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
