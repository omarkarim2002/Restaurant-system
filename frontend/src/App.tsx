import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { RotaPage } from './pages/RotaPage';
import { RotaConfigPage } from './pages/RotaConfigPage';
import { StaffPage } from './pages/StaffPage';
import { TimeOffPage } from './pages/TimeOffPage';
import { WageRatesPage } from './pages/WageRatesPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Layout>{children}</Layout> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/rota" element={<ProtectedRoute><RotaPage /></ProtectedRoute>} />
          <Route path="/rota-config" element={<ProtectedRoute><RotaConfigPage /></ProtectedRoute>} />
          <Route path="/staff" element={<ProtectedRoute><StaffPage /></ProtectedRoute>} />
          <Route path="/time-off" element={<ProtectedRoute><TimeOffPage /></ProtectedRoute>} />
          <Route path="/wages" element={<ProtectedRoute><WageRatesPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { default: api } = await import('./api/index');
      const res = await api.post('/auth/login', { email, password });
      login(res.data.data.token, res.data.data.employee);
      window.location.href = '/';
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#1a1a18' }}>
      <div style={{ width: '440px', margin: 'auto', background: 'white', borderRadius: '16px', padding: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#C41E3A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 500 }}>Restaurant MS</div>
            <div style={{ fontSize: '11px', color: '#888' }}>Staff management platform</div>
          </div>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 500, marginBottom: '0.4rem' }}>Sign in</h2>
        <p style={{ fontSize: '13px', color: '#5f5e5a', marginBottom: '1.5rem' }}>Enter your credentials to continue</p>
        {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '12px', fontWeight: 500, color: '#5f5e5a', display: 'block', marginBottom: '5px' }}>Email</label>
            <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '12px', fontWeight: 500, color: '#5f5e5a', display: 'block', marginBottom: '5px' }}>Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '10px', fontSize: '14px' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in →'}
          </button>
        </form>
      </div>
    </div>
  );
}
