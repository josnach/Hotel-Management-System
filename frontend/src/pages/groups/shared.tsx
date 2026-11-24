import type { ReactNode } from 'react';

export const n = (v: unknown) => Number(v ?? 0) || 0;

export const balanceClass = (v: number) =>
  v < 0 ? 'text-red-600' : v > 0 ? 'text-green-600' : 'text-foreground';

export const fmtDateTime = (v: string | Date) =>
  new Date(v).toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

export const fmtDate = (v: string | Date | null) =>
  v ? new Date(v).toLocaleDateString('en-CA') : '—'; // 2026-07-16

export const fmtTime = (v: string | Date | null) =>
  v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20"
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function StatusPill({ checkedIn }: { checkedIn: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        checkedIn ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {checkedIn ? 'Checked In' : 'Not Checked In'}
    </span>
  );
}

export function TypePill({ type }: { type: 'Debit' | 'Credit' }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        type === 'Credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {type}
    </span>
  );
}