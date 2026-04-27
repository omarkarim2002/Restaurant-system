import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { RotaPage } from './pages/RotaPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/rota"
            element={<ProtectedRoute><RotaPage /></ProtectedRoute>}
          />
          {/* Phase 2: <Route path="/bookings" element={<ProtectedRoute><BookingsPage /></ProtectedRoute>} /> */}
          {/* Phase 3: <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} /> */}
          {/* Phase 4: <Route path="/ai" element={<ProtectedRoute><AIDashboard /></ProtectedRoute>} /> */}
          <Route path="*" element={<Navigate to="/rota" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// Minimal login page — replace with a proper component
function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { default: api } = await import('./api/index');
      const res = await api.post('/auth/login', { email, password });
      login(res.data.data.token, res.data.data.employee);
      window.location.href = '/rota';
    } catch {
      setError('Invalid credentials');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <form onSubmit={handleSubmit} style={{ width: '320px', padding: '2rem' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 500, marginBottom: '1.5rem' }}>RMS Login</h1>
        {error && <p style={{ color: 'var(--color-text-danger)', fontSize: '13px' }}>{error}</p>}
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', marginBottom: '0.75rem' }} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', marginBottom: '1rem' }} />
        <button type="submit" style={{ width: '100%' }}>Sign in</button>
      </form>
    </div>
  );
}
