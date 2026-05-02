import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import api from '../utils/api.js';

interface LoginResponse { data: { accessToken: string }; }

const ROLE_HOME: Record<string, string> = {
  user: '/user/lobby', admin: '/admin/dashboard', superadmin: '/superadmin/admins',
};

export default function Login(): React.ReactElement {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('Please enter username and password.'); return; }
    setError(null); setLoading(true);
    try {
      const res = await api.post<LoginResponse>('/auth/login', { username: username.trim(), password });
      const token = res.data.data.accessToken;
      login(token);
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1])) as { role: string };
      navigate(ROLE_HOME[payload.role] ?? '/login', { replace: true });
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e2.response?.data?.error?.message ?? 'Login failed.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #3c3787 0%, #4d40c2 40%, #6c6be9 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <span className="text-4xl">🎯</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Matka Platform</h1>
          <p className="text-white/60 text-sm mt-1">Sign in to continue</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

          <form onSubmit={e => void handleSubmit(e)} noValidate autoComplete="off">
            <div className="mb-4">
              <label className="block text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Username</label>
              <input id="login-username" name="login-username" type="text" autoComplete="off"
                value={username} onChange={e => setUsername(e.target.value)}
                className="w-full border-2 border-brand-100 rounded-xl px-4 py-3 text-sm bg-brand-50 text-brand-800 focus:outline-none focus:border-brand-500 transition-colors"
                placeholder="Enter username" />
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Password</label>
              <input id="login-password" name="login-password" type="password" autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border-2 border-brand-100 rounded-xl px-4 py-3 text-sm bg-brand-50 text-brand-800 focus:outline-none focus:border-brand-500 transition-colors"
                placeholder="Enter password" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full text-white font-bold rounded-xl py-3.5 text-sm transition-all shadow-lg disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #5b4fdc, #6c6be9)' }}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            New user?{' '}
            <Link to="/register" className="text-brand-600 hover:underline font-semibold">Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
