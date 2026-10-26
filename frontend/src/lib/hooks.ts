import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';

export const useGet = <T = any>(path: string, params?: Record<string, unknown>, enabled = true) =>
  useQuery<T>({ queryKey: [path, params], queryFn: () => api.get<T>(path, params), enabled });

/** POST/PUT/PATCH/DELETE helper that toasts the result and invalidates queries. */
export function useAction<V = any>(fn: (v: V) => Promise<any>, opts?: { success?: string; invalidate?: string[]; onSuccess?: (r: any) => void }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => { if (opts?.success) toast.success(opts.success); opts?.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); qc.invalidateQueries({ queryKey: ['due-count'] }); qc.invalidateQueries({ queryKey: ['notifications'] }); opts?.onSuccess?.(r); },
    onError: (e: Error) => toast.error(e.message),
  });
}
