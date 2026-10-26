import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

const ngn = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 });
export const money = (v: unknown) => ngn.format(Number(v ?? 0)).replace('NGN', '₦').replace(/\s/g, '');
export const num = (v: unknown, d = 2) => Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: d, maximumFractionDigits: d });
export const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString('en-NG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const d = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10); };
export const initials = (n: string) => n.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
