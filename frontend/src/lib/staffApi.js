// src/lib/staffApi.ts   (next to your existing '@/lib/api')
import { api } from '@/lib/api';
export const EMPLOYMENT_LABELS = {
    FULL_TIME: 'Full time', PART_TIME: 'Part time', CONTRACT: 'Contract', INTERN: 'Intern',
};
// ADJUST: use your hotel's departments
export const DEPARTMENTS = ['Management', 'Guest Services', 'Support services', 'Accounting', 'Front Office', 'Housekeeping', 'Food & Beverage', 'Kitchen', 'Maintenance', 'Security', 'Human Resources'];
export class ApiError extends Error {
    fieldErrors;
    constructor(message, fieldErrors = {}) {
        super(message);
        this.fieldErrors = fieldErrors;
    }
}
/** Wraps your api client so the form can show per-field errors from the server. ADJUST the lookups if your api client shapes errors differently. */
async function call(p) {
    try {
        return (await p);
    }
    catch (e) {
        const body = e?.data ?? e?.body ?? e?.response?.data ?? {};
        throw new ApiError(body.error ?? e?.message ?? 'Something went wrong. Try again.', body.errors ?? {});
    }
}
export const staffApi = {
    list: (f) => {
        const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
        return call(api.get(`/staff${qs ? `?${qs}` : ''}`));
    },
    get: (id) => call(api.get(`/staff/${id}`)),
    create: (d) => call(api.post('/staff', d)),
    update: (id, d) => call(api.put(`/staff/${id}`, d)),
    remove: (id) => call(api.delete(`/staff/${id}`)),
};
