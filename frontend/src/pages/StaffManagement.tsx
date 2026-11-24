// src/pages/StaffManagement.tsx   (route: /staff)
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { DEPARTMENTS, EMPLOYMENT_LABELS, Staff, staffApi } from '@/lib/staffApi';

const naira = (n: number) => '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600';

export default function StaffManagement() {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === 'ADMIN' || user?.role === 'MANAGER'; // matches the backend
  const [draft, setDraft] = useState({ q: '', department: '', status: '' });
  const [filters, setFilters] = useState(draft);
  const [rows, setRows] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewing, setViewing] = useState<Staff | null>(null);
  const [deleting, setDeleting] = useState<Staff | null>(null);

  const load = () => {
    setLoading(true); setError('');
    staffApi.list(filters).then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [filters]);

  async function confirmDelete() {
    if (!deleting) return;
    try { setNotice((await staffApi.remove(deleting.id)).message); load(); }
    catch (e: any) { setError(e.message); }
    setDeleting(null);
  }

  return (
    <div className="mx-auto max-w-7xl p-6 sm:p-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Staff Management</h1>
          <p className="mt-1 text-gray-600">Manage hotel staff, employment details, and comp allowances</p>
        </div>
        {canWrite && <Link to="/staff/new" className="rounded-lg bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-700">＋ Add New Staff</Link>}
      </div>

      {notice && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800" role="status">{notice}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div>}

      <div className="mb-6 rounded-xl bg-white shadow">
        <h2 className="border-b px-5 py-4 font-semibold">Filter Staff</h2>
        <form className="grid gap-4 p-5 md:grid-cols-4 md:items-end"
          onSubmit={(e) => { e.preventDefault(); setFilters(draft); }}>
          <div><label className="mb-1 block text-sm font-medium">Search</label>
            <input className={input} placeholder="Name, ID, Email, Phone..." value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} /></div>
          <div><label className="mb-1 block text-sm font-medium">Department</label>
            <select className={input} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })}>
              <option value="">All Departments</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></div>
          <div><label className="mb-1 block text-sm font-medium">Status</label>
            <select className={input} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">All Status</option><option>Active</option><option>Inactive</option></select></div>
          <button className="rounded-lg bg-purple-600 px-5 py-3 font-semibold text-white hover:bg-purple-700">Apply Filters</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>{['Staff ID', 'Name', 'Department', 'Position', 'Employment Type', 'Status', 'Comp Limit', 'Actions'].map((h) => <th key={h} className="px-4 py-3.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-4 font-bold">{s.staffId}</td>
                <td className="px-4 py-4"><div className="font-semibold">{s.fullName}</div><div className="text-gray-500">{s.email}</div></td>
                <td className="px-4 py-4">{s.department}</td>
                <td className="px-4 py-4">{s.position}</td>
                <td className="px-4 py-4"><span className="rounded-full bg-green-100 px-2.5 py-1 text-xs text-green-800">{EMPLOYMENT_LABELS[s.employmentType]}</span></td>
                <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${s.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{s.status}</span></td>
                <td className="px-4 py-4"><div className="font-bold">{naira(s.compLimit)}</div><div className="text-xs text-gray-500">Remaining: {naira(s.compRemaining)}</div></td>
                <td className="whitespace-nowrap px-4 py-4">
                 <button className="mr-3 text-purple-600 hover:underline" onClick={() => nav(`/staff/${s.id}`)}>View</button>
                  {canWrite && <button className="mr-3 text-blue-600 hover:underline" onClick={() => nav(`/staff/${s.id}/edit`)}>Edit</button>}
                  {canWrite && <button className="text-red-600 hover:underline" onClick={() => setDeleting(s)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="p-8 text-center text-gray-500">Loading staff…</p>}
        {!loading && !rows.length && <p className="p-8 text-center text-gray-500">No staff match these filters. Clear the search or add a new staff member.</p>}
      </div>

      {viewing && (
        <Modal onClose={() => setViewing(null)}>
          <h2 className="mb-4 text-xl font-bold">{viewing.fullName}</h2>
          <dl className="grid grid-cols-[150px_1fr] gap-y-2 text-sm">
            {([['Staff ID', viewing.staffId], ['Email', viewing.email], ['Phone', viewing.phone], ['Department', viewing.department], ['Position', viewing.position],
              ['Employment', EMPLOYMENT_LABELS[viewing.employmentType]], ['Status', viewing.status], ['Basic salary', naira(viewing.basicSalary)],
              ['Comp limit', naira(viewing.compLimit)], ['Comp remaining', naira(viewing.compRemaining)]] as const).map(([k, v]) => (
              <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd>{v || '—'}</dd></div>))}
          </dl>
          <div className="mt-6 text-right"><button className="rounded-lg bg-gray-200 px-4 py-2" onClick={() => setViewing(null)}>Close</button></div>
        </Modal>)}

      {deleting && (
        <Modal onClose={() => setDeleting(null)}>
          <h2 className="mb-2 text-xl font-bold">Delete {deleting.fullName}?</h2>
          <p className="text-sm text-gray-600">Staff with payroll history are deactivated instead of deleted. Otherwise the record is removed for good.</p>
          <div className="mt-6 flex justify-end gap-2">
            <button className="rounded-lg bg-gray-200 px-4 py-2" onClick={() => setDeleting(null)}>Keep staff</button>
            <button className="rounded-lg bg-red-600 px-4 py-2 text-white" onClick={confirmDelete}>Delete staff</button>
          </div>
        </Modal>)}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>);
}
