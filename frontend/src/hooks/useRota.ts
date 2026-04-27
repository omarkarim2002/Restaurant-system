import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulesApi, employeesApi, timeOffApi } from '../api/index';

// ─── Schedules ────────────────────────────────────────────────────────────────

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: () => schedulesApi.list().then((r) => r.data.data),
  });
}

export function useSchedule(id: string) {
  return useQuery({
    queryKey: ['schedules', id],
    queryFn: () => schedulesApi.get(id).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useScheduleAdvisory(id: string) {
  return useQuery({
    queryKey: ['schedules', id, 'advisory'],
    queryFn: () => schedulesApi.getAdvisory(id).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { week_start: string; notes?: string }) => schedulesApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });
}

export function useAddAssignment(scheduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { employee_id: string; shift_id: string; shift_date: string; notes?: string }) =>
      schedulesApi.addAssignment(scheduleId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules', scheduleId] });
      qc.invalidateQueries({ queryKey: ['schedules', scheduleId, 'advisory'] });
    },
  });
}

export function useRemoveAssignment(scheduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => schedulesApi.removeAssignment(scheduleId, assignmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules', scheduleId] });
      qc.invalidateQueries({ queryKey: ['schedules', scheduleId, 'advisory'] });
    },
  });
}

export function usePublishSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) => schedulesApi.publish(scheduleId),
    onSuccess: (_data, scheduleId) => qc.invalidateQueries({ queryKey: ['schedules', scheduleId] }),
  });
}

// ─── Employees ────────────────────────────────────────────────────────────────

export function useEmployees(params?: { active?: boolean; role_id?: string }) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: () => employeesApi.list(params).then((r) => r.data.data),
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: ['employees', id],
    queryFn: () => employeesApi.get(id).then((r) => r.data.data),
    enabled: !!id,
  });
}

// ─── Time-Off ─────────────────────────────────────────────────────────────────

export function useTimeOffRequests(params?: { status?: string }) {
  return useQuery({
    queryKey: ['time-off', params],
    queryFn: () => timeOffApi.list(params).then((r) => r.data.data),
  });
}

export function useReviewTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      review_notes,
    }: {
      id: string;
      status: 'approved' | 'rejected';
      review_notes?: string;
    }) => timeOffApi.review(id, { status, review_notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time-off'] }),
  });
}
