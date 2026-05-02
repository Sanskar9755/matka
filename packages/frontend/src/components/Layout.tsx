import React, { useEffect, useState, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav.js';
import { DrawerNav } from './DrawerNav.js';
import { useAuth } from '../context/AuthContext.js';
import api from '../utils/api.js';

interface ProfileResponse { data: { username: string; wallet: { balance_points: number } }; }
interface Notification { id: string; type: string; title: string; message: string; time: string; }
interface NotifResponse { data: { notifications: Notification[]; unread_count: number }; }

export default function Layout(): React.ReactElement {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    api.get<ProfileResponse>('/user/profile').then(r => {
      setUsername(r.data.data.username);
      setBalance(r.data.data.wallet.balance_points);
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      api.get<{ data: { balance_points: number } }>('/wallet/balance')
        .then(r => setBalance(r.data.data.balance_points)).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api.get<NotifResponse>('/user/notifications').then(r => {
      setNotifications(r.data.data.notifications);
      setUnreadCount(r.data.data.unread_count);
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-brand-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-brand-700 px-4 py-3 flex items-center justify-between shadow-lg">
        <button onClick={() => setDrawerOpen(true)}
          className="text-white p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <button onClick={() => navigate('/user/lobby')} className="text-center flex-1 mx-2">
          <p className="text-white font-bold text-base leading-tight tracking-wide">🎯 Matka Platform</p>
          {username && <p className="text-brand-200 text-xs">{username}</p>}
        </button>

        <div className="flex items-center gap-2">
          {balance !== null && (
            <div className="bg-brand-500 text-white text-xs font-bold px-3 py-1.5 rounded-full border border-brand-400">
              ₹ {balance.toLocaleString()}
            </div>
          )}
          <div className="relative" ref={notifRef}>
            <button onClick={() => setNotifOpen(v => !v)}
              className="text-white p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-yellow-400 text-gray-900 text-xs font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-brand-100 z-50 overflow-hidden">
                <div className="px-4 py-3 bg-brand-600 flex items-center justify-between">
                  <h3 className="font-bold text-white">Notifications</h3>
                  <button onClick={() => setNotifOpen(false)} className="text-white/70 hover:text-white text-lg">✕</button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-500 text-sm">No notifications yet</div>
                  ) : notifications.map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b border-gray-100 last:border-0 ${n.type === 'win' ? 'bg-green-50' : 'bg-red-50'}`}>
                      <p className="font-semibold text-sm text-gray-900">{n.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(n.time).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <DrawerNav isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
