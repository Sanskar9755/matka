import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/user/lobby', label: 'Home', icon: '🏠' },
  { to: '/user/history', label: 'Bets', icon: '📋' },
  { to: '/user/wallet', label: 'Wallet', icon: '💰' },
  { to: '/user/history', label: 'Results', icon: '🏆' },
  { to: '/user/profile', label: 'Profile', icon: '👤' },
];

export function BottomNav(): React.ReactElement {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-brand-100 shadow-lg safe-area-inset-bottom">
      <ul className="flex items-stretch justify-around">
        {navItems.map(item => (
          <li key={item.label} className="flex-1">
            <NavLink to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center min-h-[56px] gap-0.5 text-xs font-semibold transition-colors ${
                  isActive ? 'text-brand-600' : 'text-gray-400'
                }`
              }>
              {({ isActive }) => (
                <>
                  <span className={`text-xl transition-transform ${isActive ? 'scale-110' : ''}`}>{item.icon}</span>
                  <span className={isActive ? 'text-brand-600' : 'text-gray-400'}>{item.label}</span>
                  {isActive && <span className="w-1 h-1 bg-brand-600 rounded-full"></span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
