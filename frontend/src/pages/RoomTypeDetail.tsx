// src/pages/RoomTypeDetail.tsx   (route: room-types/:id)
import { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/lib/hooks';
import { longDate, naira } from '@/lib/roomTypeFormat';

const PILL: Record<string, string> = {
  OCCUPIED: 'bg-red-100 text-red-700', CLEANING: 'bg-blue-100 text-blue-700', AVAILABLE: 'bg-green-100 text-green-700',
  MAINTENANCE: 'bg-amber-100 text-amber-700', RESERVED: 'bg-purple-100 text-purple-700',
};
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const Pencil = () => <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M13.6 2.4a2 2 0 112.8 2.8L7 14.6 3 15.6l1-4L13.6 2.4z" /></svg>;
const Bars = () => <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M3 5h14v2H3V5zm0 4h14v2H3V9zm0 4h14v2H3v-2z" /></svg>;
const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`rounded-lg bg-white shadow-sm ring-1 ring-gray-100 ${className}`}>{children}</div>;

export default function RoomTypeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const { data: t, isLoading } = useGet<any>(`/rooms/types/${id}`);

  if (isLoading) return <p className="p-12 text-center text-sm text-gray-500">Loading…</p>;
  if (!t) return <div className="mx-auto max-w-6xl px-6 py-12"><p className="text-sm text-gray-700">Room type not found.</p><Link to="/room-types" className="mt-3 inline-block text-sm text-indigo-600">← Back to Room Types</Link></div>;

  const rooms: any[] = t.rooms ?? [];
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-5 flex items-start justify-between">
        <div><h1 className="text-3xl font-bold text-gray-900">{t.name}</h1><p className="text-gray-600">Room Type Details</p></div>
        <div className="flex gap-2">
          {canManage && <button className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" onClick={() => nav(`/room-types/${t.id}/edit`)}><Pencil />Edit</button>}
          <Link to="/room-types" className="flex items-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200">← Back to List</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="grid grid-cols-3 gap-4 p-6 text-center">
              <div><div className="text-sm text-gray-500">Nightly Rate</div><div className="mt-1 text-xl font-bold text-gray-900">{naira(t.nightlyRate)}</div></div>
              <div><div className="text-sm text-gray-500">Capacity</div><div className="mt-1 text-xl font-bold text-gray-900">{t.capacity}</div><div className="text-xs text-gray-500">max guests</div></div>
              <div><div className="text-sm text-gray-500">Total Rooms</div><div className="mt-1 text-xl font-bold text-gray-900">{rooms.length}</div></div>
            </div>
            <div className="border-t border-gray-100 p-6"><h3 className="mb-2 font-semibold text-gray-900">Description</h3><p className="text-sm text-gray-700">{t.description || '—'}</p></div>
            <div className="border-t border-gray-100 p-6">
              <h3 className="mb-3 font-semibold text-gray-900">Additional Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><div className="text-gray-500">Created</div><div className="text-gray-900">{t.createdAt ? longDate(t.createdAt) : '—'}</div></div>
                <div><div className="text-gray-500">Last Updated</div><div className="text-gray-900">{t.updatedAt ? longDate(t.updatedAt) : '—'}</div></div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <h3 className="px-6 py-4 font-semibold text-gray-900">Assigned Rooms ({rooms.length})</h3>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50"><tr>{['Room Number', 'Status', 'Floor'].map((h) => <th key={h} className="px-6 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>)}</tr></thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-6 py-3 font-medium text-blue-600">{r.number}</td>
                    <td className="px-6 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${PILL[r.status] ?? 'bg-gray-100 text-gray-700'}`}>{label(r.status)}</span></td>
                    <td className="px-6 py-3 text-gray-500">{r.floor ?? 'N/A'}</td>
                  </tr>))}
              </tbody>
            </table>
            {!rooms.length && <p className="px-6 py-6 text-center text-sm text-gray-500">No rooms are assigned to this room type yet.</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-4 font-semibold text-gray-900">Quick Actions</h3>
            <div className="space-y-2">
              {canManage && <button className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-50 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-100" onClick={() => nav(`/room-types/${t.id}/edit`)}><Pencil />Edit Room Type</button>}
              <Link to="/room-types" className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-50 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"><Bars />View All Room Types</Link>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold text-gray-900">Rate Information</h3>
            <div className="flex justify-between border-b border-gray-100 py-2.5 text-sm"><span className="text-gray-600">Base Nightly Rate</span><span className="font-bold text-gray-900">{naira(t.nightlyRate)}</span></div>
            <div className="flex justify-between py-2.5 text-sm"><span className="text-gray-600">Max Occupancy</span><span className="font-bold text-gray-900">{t.capacity} guests</span></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
