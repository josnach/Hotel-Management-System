// src/lib/roomTypeFormat.ts
export const naira = (n: number | string) =>
  '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
