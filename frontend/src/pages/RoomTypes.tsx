// src/pages/RoomTypes.tsx   (REPLACES your current list page; route "room-types")
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { naira } from '@/lib/roomTypeFormat';

export default function RoomTypes() {
  const nav = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const { data, isLoading } = useGet<any[]>('/rooms/types');
  const del = useAction((id: string) => api.del(`/rooms/types/${id}`), { success: 'Room type deleted', invalidate: ['/rooms/types'] });

  function remove(t: any) {
    const n = t._count?.rooms ?? 0;
    if (n > 0) return alert(`Cannot delete ${t.name}: ${n} room(s) assigned`);
    if (confirm(`Delete ${t.name}?`)) del.mutate(t.id);
  }

  return (
    <div className="mx-auto w-full max-w-[1520px] px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Room Types</h1>
        {canManage && <Link to="/room-types/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Add New Room Type</Link>}
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-100">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>{['Name', 'Nightly Rate', 'Capacity', 'Actions'].map((h) => <th key={h} className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data?.map((t) => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="w-[45%] px-6 py-4"><div className="text-sm font-semibold text-gray-900">{t.name}</div><div className="text-sm text-gray-500">{t.description}</div></td>
                <td className="px-6 py-4 text-sm text-gray-900">{naira(t.nightlyRate)}</td>
                <td className="px-6 py-4 text-sm text-gray-900">{t.capacity} person(s)</td>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                  <Link to={`/room-types/${t.id}`} className="mr-3 text-indigo-600 hover:underline">Show</Link>
                  {canManage && <button className="mr-3 text-indigo-600 hover:underline" onClick={() => nav(`/room-types/${t.id}/edit`)}>Edit</button>}
                  {canManage && <button className="text-red-600 hover:underline" onClick={() => remove(t)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="p-8 text-center text-sm text-gray-500">Loading room types…</p>}
        {!isLoading && !data?.length && <p className="p-8 text-center text-sm text-gray-500">No room types yet.</p>}
      </div>
    </div>
  );
}
