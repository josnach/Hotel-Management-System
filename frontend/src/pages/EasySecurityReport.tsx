import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BedDouble, Contact, Edit, Eye, FileDown, FileText, Globe, User, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Loading } from '@/components/common';

type Sec = 'PENDING' | 'VERIFIED' | 'FLAGGED';

interface GuestRow {
  id: string;
  name: string;
  phone: string;
  stayStatus: 'CHECKED_IN' | 'CHECKED_OUT' | null;
  stayDate: string | null;
  room: string | null;
  group: string | null;
  hasId: boolean;
  txCount: number;
  txTotal: string | number;
  balance: string | number;
  securityStatus: Sec;
  securityNote: string | null;
}
interface HighValueRow {
  id: string;
  guestName: string;
  idNumber: string;
  amount: string | number;
  description: string;
  date: string;
  folioNo: string;
}
interface Report {
  range: { start: string; end: string };
  generatedAt: string;
  generatedBy: string;
  stats: { totalGuests: number; currentlyCheckedIn: number; foreignGuests: number; withoutId: number };
  suspicious: { guestsWithoutId: { id: string; name: string }[] };
  highValue: { threshold: number; rows: HighValueRow[] };
  guests: GuestRow[];
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const defaults = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { start: ymd(start), end: ymd(end), guestStatus: '', securityStatus: '' };
};

const naira = (n: string | number) =>
  `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
const shortTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const longStamp = (d: string) =>
  `${new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} ${shortTime(d)}`;

const SEC_LABEL: Record<Sec, string> = { PENDING: 'Pending', VERIFIED: 'Reviewed', FLAGGED: 'Flagged' };
const SEC_STYLE: Record<Sec, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  VERIFIED: 'bg-green-100 text-green-800',
  FLAGGED: 'bg-red-100 text-red-800',
};

const field = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const lbl = 'mb-1 block text-sm font-medium text-gray-700';
const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/* ───────────── PDF export (browser-side) ───────────── */
async function exportPdf(d: Report) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // The built-in PDF fonts have no ₦ glyph, so amounts are written as "NGN".
  const ngn = (n: string | number) =>
    `NGN ${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const doc = new jsPDF({ orientation: 'landscape' });
  const range = `${d.range.start.slice(0, 10)} to ${d.range.end.slice(0, 10)}`;

  doc.setFontSize(16);
  doc.text('Easy-Security Report', 14, 16);
  doc.setFontSize(10);
  doc.text(`Date range: ${range}   |   Generated: ${longStamp(d.generatedAt)}   |   By: ${d.generatedBy}`, 14, 23);
  doc.text(
    `Total guests: ${d.stats.totalGuests}   Checked-in: ${d.stats.currentlyCheckedIn}   Foreign: ${d.stats.foreignGuests}   Without ID: ${d.stats.withoutId}`,
    14, 29,
  );

  autoTable(doc, {
    startY: 34,
    head: [['Guest', 'Phone', 'Room', 'Identification', 'Transactions', 'Security status']],
    body: d.guests.map((g) => [
      g.name, g.phone, g.room ? `Room ${g.room}` : '-', g.hasId ? 'ID on file' : 'ID missing',
      `${ngn(g.txTotal)} (${g.txCount})`, SEC_LABEL[g.securityStatus],
    ]),
    headStyles: { fillColor: [37, 99, 235] },
  });

  const y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 34) + 10;
  doc.setFontSize(12);
  doc.text(`High-Value Transactions (${ngn(d.highValue.threshold)}+)`, 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [['Guest', 'Amount', 'Description', 'Date', 'Folio']],
    body: d.highValue.rows.map((r) => [
      r.guestName, ngn(r.amount), r.description, `${shortDate(r.date)} ${shortTime(r.date)}`, r.folioNo,
    ]),
    headStyles: { fillColor: [37, 99, 235] },
  });

  doc.save(`easy-security-report-${d.range.start.slice(0, 10)}-to-${d.range.end.slice(0, 10)}.pdf`);
}

/* ───────────── Pieces ───────────── */
function StatCard({ title, value, border, circle, icon }: { title: string; value: number; border: string; circle: string; icon: ReactNode }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border-l-4 bg-white p-5 shadow-md ${border}`}>
      <div>
        <div className="text-sm text-gray-700">{title}</div>
        <div className="mt-1 text-3xl font-bold text-gray-900">{value}</div>
      </div>
      <div className={`flex h-11 w-11 items-center justify-center rounded-full ${circle}`}>{icon}</div>
    </div>
  );
}

function NotesModal({ guest, onClose }: { guest: GuestRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(guest.securityNote ?? '');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`/security/guests/${guest.id}/report`, { status: guest.securityStatus, note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['easy-security'] });
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-32" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Security Notes"
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-6 py-4 text-base font-semibold text-gray-900">Security Notes</div>
        <div className="space-y-3 p-6">
          <label className={lbl}>Notes</label>
          <textarea
            className={field}
            rows={4}
            placeholder="Enter security notes or observations..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              Save Notes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Page ───────────── */
export default function EasySecurityReport() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const [notesFor, setNotesFor] = useState<GuestRow | null>(null);

  const q = useQuery({
    queryKey: ['easy-security', applied],
    queryFn: () => {
      const p = new URLSearchParams();
      Object.entries(applied).forEach(([k, v]) => v && p.set(k, v));
      return api.get(`/security/easy-report?${p.toString()}`) as Promise<Report>;
    },
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: Sec }) => api.post(`/security/guests/${v.id}/report`, { status: v.status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['easy-security'] }),
  });

  const d = q.data;
  const set = (k: keyof typeof draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Easy-Security Report</h1>
          <p className="mt-1 text-gray-600">Comprehensive security analysis of hotel guests and activities</p>
        </div>
        <button
          type="button"
          disabled={!d}
          onClick={() => d && void exportPdf(d)}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          <FileDown size={16} /> Export PDF
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-white p-5 shadow-md">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className={lbl}>Start Date</label>
            <input type="date" className={field} value={draft.start} onChange={set('start')} />
          </div>
          <div>
            <label className={lbl}>End Date</label>
            <input type="date" className={field} value={draft.end} onChange={set('end')} />
          </div>
          <div>
            <label className={lbl}>Guest Status</label>
            <select className={field} value={draft.guestStatus} onChange={set('guestStatus')}>
              <option value="">All Guests</option>
              <option value="CHECKED_IN">Checked-in Only</option>
              <option value="CHECKED_OUT">Checked-out Only</option>
            </select>
          </div>
          <div>
            <label className={lbl}>Security Status</label>
            <select className={field} value={draft.securityStatus} onChange={set('securityStatus')}>
              <option value="">All Statuses</option>
              <option value="PENDING">Pending Review</option>
              <option value="VERIFIED">Reviewed</option>
              <option value="FLAGGED">Flagged</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => { const x = defaults(); setDraft(x); setApplied(x); }}
          >
            Reset Filters
          </button>
          <button type="button" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" onClick={() => setApplied(draft)}>
            Apply Filters
          </button>
        </div>
      </div>

      {q.isLoading || !d ? (
        <Loading />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total Guests" value={d.stats.totalGuests} border="border-blue-500" circle="bg-blue-100 text-blue-600" icon={<Users size={20} />} />
            <StatCard title="Currently Checked-in" value={d.stats.currentlyCheckedIn} border="border-green-500" circle="bg-green-100 text-green-600" icon={<BedDouble size={20} />} />
            <StatCard title="Foreign Guests" value={d.stats.foreignGuests} border="border-yellow-500" circle="bg-yellow-100 text-yellow-600" icon={<Globe size={20} />} />
            <StatCard title="Without ID" value={d.stats.withoutId} border="border-red-500" circle="bg-red-100 text-red-600" icon={<Contact size={20} />} />
          </div>

          {/* Suspicious patterns */}
          {d.suspicious.guestsWithoutId.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
              <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-yellow-800">
                <AlertTriangle size={20} className="text-yellow-500" /> Suspicious Patterns Detected
              </div>
              <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-sm">
                <div className="mb-3 font-semibold text-gray-900">Guests Without Proper ID</div>
                {d.suspicious.guestsWithoutId.map((g) => (
                  <div key={g.id} className="flex items-center justify-between border-t border-gray-100 py-2 text-sm text-gray-700 first:border-t-0">
                    <span>{g.name}</span>
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">No ID</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* High-value transactions */}
          <div className="rounded-xl bg-white p-5 shadow-md">
            <h2 className="text-lg font-semibold text-gray-900">High-Value Transactions ({naira(d.highValue.threshold).replace('.00', '')}+)</h2>
            <p className="mb-4 text-sm text-gray-600">Large transactions requiring security review</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-3">Guest</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Folio</th>
                  </tr>
                </thead>
                <tbody>
                  {d.highValue.rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-gray-900">{r.guestName}</div>
                        <div className="text-gray-500">{r.idNumber}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="whitespace-nowrap rounded-full bg-green-100 px-2.5 py-0.5 text-sm font-medium text-green-700">{naira(r.amount)}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-900">{r.description}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-gray-700">
                        <div>{shortDate(r.date)}</div>
                        <div className="text-gray-500">{shortTime(r.date)}</div>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{r.folioNo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Guest security analysis */}
          <div className="rounded-xl bg-white shadow-md">
            <div className="p-5">
              <h2 className="text-lg font-semibold text-gray-900">Guest Security Analysis</h2>
              <p className="text-sm text-gray-600">
                Showing {d.guests.length ? 1 : 0} to {d.guests.length} of {d.guests.length} guests
              </p>
            </div>
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-3">Guest Information</th>
                    <th className="px-5 py-3">Room/Group</th>
                    <th className="px-5 py-3">Identification</th>
                    <th className="px-5 py-3">Transactions</th>
                    <th className="px-5 py-3">Security Status</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {d.guests.map((g) => (
                    <tr key={g.id} className="border-b border-gray-100">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                            <User size={18} />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{g.name}</div>
                            <div className="text-gray-600">{g.phone}</div>
                            {g.stayDate && (
                              <div className="text-xs text-gray-400">
                                Checked {g.stayStatus === 'CHECKED_IN' ? 'IN' : 'OUT'} • {shortDate(g.stayDate)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-gray-900">
                        {g.room ? `Room ${g.room}` : '—'} <span className="text-xs text-gray-500">({g.group ?? ''})</span>
                      </td>
                      <td className="px-5 py-4">
                        {g.hasId ? (
                          <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700">ID Verified</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                            <AlertTriangle size={12} /> ID Missing
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{naira(g.txTotal)}</div>
                        <div className="text-xs text-gray-600">{g.txCount} transaction(s)</div>
                        {Number(g.balance) !== 0 && (
                          <div className={`text-xs ${Number(g.balance) < 0 ? 'text-red-600' : 'text-green-600'}`}>Balance: {naira(g.balance)}</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          aria-label={`Security status for ${g.name}`}
                          className={`rounded px-2 py-0.5 text-xs font-medium ${SEC_STYLE[g.securityStatus]}`}
                          value={g.securityStatus}
                          disabled={setStatus.isPending}
                          onChange={(e) => setStatus.mutate({ id: g.id, status: e.target.value as Sec })}
                        >
                          {(Object.keys(SEC_LABEL) as Sec[]).map((s) => (
                            <option key={s} value={s}>{SEC_LABEL[s]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Link to={`/guests/${g.id}`} title="View Guest" className="text-blue-600 hover:text-blue-800"><Eye size={16} /></Link>
                          {/* Stand-in until Transaction Reversal History exists: opens the guest's history */}
                          <Link to={`/guests/${g.id}/history`} title="View Transactions" className="text-green-600 hover:text-green-800"><FileText size={16} /></Link>
                          <button type="button" title="Add Security Notes" className="text-gray-800 hover:text-black" onClick={() => setNotesFor(g)}><Edit size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Report summary */}
          <div className="rounded-xl bg-white p-6 shadow-md">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Report Summary</h2>
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <div><div className="font-semibold text-gray-900">Date Range</div><div className="text-gray-600">{d.range.start.slice(0, 10)} to {d.range.end.slice(0, 10)}</div></div>
              <div><div className="font-semibold text-gray-900">Generated On</div><div className="text-gray-600">{longStamp(d.generatedAt)}</div></div>
              <div><div className="font-semibold text-gray-900">Generated By</div><div className="text-gray-600">{d.generatedBy}</div></div>
              <div><div className="font-semibold text-gray-900">Total Records</div><div className="text-gray-600">{d.guests.length} guests analyzed</div></div>
            </div>
          </div>
        </>
      )}

      {notesFor && <NotesModal guest={notesFor} onClose={() => setNotesFor(null)} />}
    </div>
  );
}