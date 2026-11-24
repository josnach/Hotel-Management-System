// src/lib/staffApi.ts   (next to your existing '@/lib/api')
import { api } from '@/lib/api';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full time', PART_TIME: 'Part time', CONTRACT: 'Contract', INTERN: 'Intern',
};
// ADJUST: use your hotel's departments
export const DEPARTMENTS = ['Management', 'Guest Services', 'Support Services', 'Accounting', 'Front Office', 'Housekeeping', 'Food & Beverage', 'Kitchen', 'Maintenance', 'Security', 'Human Resources'];

export interface StaffInput {
  firstName: string; middleName: string; lastName: string; email: string; phone: string; altPhone: string;
  dateOfBirth: string; gender: string; department: string; position: string; jobTitle: string;
  employmentType: EmploymentType | ''; hireDate: string; confirmationDate: string; supervisorId: string;
  status: 'Active' | 'Inactive';
  basicSalary: number; hourlyRate: number; mealAllowance: number; transportAllowance: number; housingAllowance: number; compLimit: number;
  bankName: string; accountNumber: string; accountName: string; tin: string;
  address: string; city: string; state: string; emergencyName: string; emergencyPhone: string; emergencyRelationship: string;
}
export interface Staff extends StaffInput {
  id: string; staffId: string; employeeNumber: string; fullName: string; compUsed: number; compRemaining: number;
  employmentType: EmploymentType;
}
export class ApiError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string> = {}) { super(message); }
}

/** Wraps your api client so the form can show per-field errors from the server. ADJUST the lookups if your api client shapes errors differently. */
async function call<T>(p: Promise<unknown>): Promise<T> {
  try { return (await p) as T; }
  catch (e: any) {
    const body = e?.data ?? e?.body ?? e?.response?.data ?? {};
    throw new ApiError(body.error ?? e?.message ?? 'Something went wrong. Try again.', body.errors ?? {});
  }
}

export const staffApi = {
  list: (f: { q?: string; department?: string; status?: string }) => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
    return call<Staff[]>(api.get(`/staff${qs ? `?${qs}` : ''}`));
  },
  get: (id: string) => call<Staff>(api.get(`/staff/${id}`)),
  create: (d: StaffInput) => call<Staff>(api.post('/staff', d)),
  update: (id: string, d: StaffInput) => call<Staff>(api.put(`/staff/${id}`, d)),
  remove: (id: string) => call<{ deleted: boolean; message: string }>(api.del(`/staff/${id}`)),
};