import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/index';

export function useRotaConfig() {
  return useQuery({
    queryKey: ['rota-config'],
    queryFn: () => api.get('/rota-config').then(r => r.data.data),
  });
}

export function useSaveRotaConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post('/rota-config', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rota-config'] }),
  });
}

export function useClosedDays(from?: string, to?: string) {
  return useQuery({
    queryKey: ['closed-days', from, to],
    queryFn: () => api.get('/rota-config/closed-days', { params: { from, to } }).then(r => r.data.data),
  });
}

export function useAddClosedDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { closed_date: string; reason?: string }) =>
      api.post('/rota-config/closed-days', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closed-days'] }),
  });
}

export function useRemoveClosedDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.delete(`/rota-config/closed-days/${date}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closed-days'] }),
  });
}

export function useGenerateRota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { mode: 'week' | 'month'; start_date: string }) =>
      api.post('/rota-config/generate', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });
}
