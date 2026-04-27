import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('rms_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── Typed API Calls ──────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ data: { token: string; employee: any } }>('/auth/login', { email, password }),
};

export const employeesApi = {
  list: (params?: { active?: boolean; role_id?: string }) =>
    api.get<{ data: any[] }>('/employees', { params }),
  get: (id: string) => api.get<{ data: any }>(`/employees/${id}`),
  create: (body: any) => api.post<{ data: any }>('/employees', body),
  update: (id: string, body: any) => api.patch<{ data: any }>(`/employees/${id}`, body),
  deactivate: (id: string) => api.delete(`/employees/${id}`),
  getAvailability: (id: string) => api.get<{ data: any[] }>(`/employees/${id}/availability`),
  updateAvailability: (id: string, rows: any[]) =>
    api.put<{ data: any[] }>(`/employees/${id}/availability`, rows),
};

export const schedulesApi = {
  list: () => api.get<{ data: any[] }>('/schedules'),
  get: (id: string) => api.get<{ data: any }>(`/schedules/${id}`),
  create: (body: { week_start: string; notes?: string }) =>
    api.post<{ data: any }>('/schedules', body),
  addAssignment: (scheduleId: string, body: any) =>
    api.post<{ data: any }>(`/schedules/${scheduleId}/assignments`, body),
  removeAssignment: (scheduleId: string, assignmentId: string) =>
    api.delete(`/schedules/${scheduleId}/assignments/${assignmentId}`),
  publish: (scheduleId: string) =>
    api.post<{ data: any }>(`/schedules/${scheduleId}/publish`),
  getAdvisory: (scheduleId: string) =>
    api.get<{ data: any }>(`/schedules/${scheduleId}/advisory`),
};

export const timeOffApi = {
  list: (params?: { status?: string }) => api.get<{ data: any[] }>('/time-off', { params }),
  create: (body: any) => api.post<{ data: any }>('/time-off', body),
  review: (id: string, body: { status: 'approved' | 'rejected'; review_notes?: string }) =>
    api.patch(`/time-off/${id}/review`, body),
};
