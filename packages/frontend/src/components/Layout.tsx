/**
 * Layout wrapper for the User panel.
 * Includes BottomNav and WalletBadge in the header.
 */
import React from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav.js';
import { WalletBadge } from './WalletBadge.js';

export default function Layout(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <span className="text-lg font-bold text-indigo-700 dark:text-indigo-400">Matka</span>
        <WalletBadge />
      </header>

      {/* Page content — padded to avoid overlap with BottomNav */}
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
