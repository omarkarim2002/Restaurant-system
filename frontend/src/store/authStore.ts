import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  system_role: 'staff' | 'manager' | 'admin';
}

interface AuthState {
  token: string | null;
  employee: Employee | null;
  isAuthenticated: boolean;
  login: (token: string, employee: Employee) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      employee: null,
      isAuthenticated: false,
      login: (token, employee) => {
        localStorage.setItem('rms_token', token);
        set({ token, employee, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('rms_token');
        set({ token: null, employee: null, isAuthenticated: false });
      },
    }),
    { name: 'rms-auth' }
  )
);
