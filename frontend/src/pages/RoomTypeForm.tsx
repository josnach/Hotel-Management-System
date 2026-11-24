// src/pages/RoomTypeForm.tsx   (routes: room-types/new and room-types/:id/edit)
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { shortDate } from '@/lib/roomTypeFormat';

const input = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export default function RoomTypeForm() {
  const { id } = useParams();
  return id ? <EditLoader id={id} /> : <FormBody />;
}

function EditLoader({ id }: { id: string }) {
  const { data, isLoading } = useGet<any>(`/rooms/types/${id}`);
  if (isLoading) return <p className="p-12 text-center text-sm text-gray-500">Loading…</p>;
  if (!data) return <div className="mx-auto max-w-2xl px-6 py-12"><p className="text-sm text-gray-700">Room type not found.</p><Link to="/room-types" className="mt-3 inline-block text-sm text-indigo-600">← Back to Room Types</Link></div>;
  return <FormBody id={id} initial={data} />;
}

function FormBody({ id, initial }: { id?: string; initial?: any }) {
  const editing = Boolean(id);
  const nav = useNavigate();
  const [name, setName] = useState<string>(initial?.name ?? '');
  const [rate, setRate] = useState<string>(initial ? Number(initial.nightlyRate).toFixed(2) : '');
  const [capacity, setCapacity] = useState<string>(String(initial?.capacity ?? 2));
  const [description, setDescription] = useState<string>(initial?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const roomCount: number = initial?.rooms?.length ?? 0;

  const save = useAction(
    () => {
      const body = { name: name.trim(), description, nightlyRate: Number(rate), capacity: Number(capacity) };
      return editing ? api.put(`/rooms/types/${id}`, body) : api.post('/rooms/types', body);
    },
    { success: 'Room type saved', invalidate: editing ? ['/rooms/types', `/rooms/types/${id}`] : ['/rooms/types'], onSuccess: () => nav('/room-types') },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = 'Room type name is required';
    if (!(Number(rate) > 0)) err.rate = 'Enter a nightly rate greater than 0';
    if (!Number.isInteger(Number(capacity)) || Number(capacity) < 1) err.capacity = 'Capacity must be a whole number of at least 1';
    setErrors(err);
    if (!Object.keys(err).length) save.mutate(undefined);
  }
  const Err = ({ k }: { k: string }) => (errors[k] ? <p className="mt-1 text-xs text-red-600">{errors[k]}</p> : null);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <form onSubmit={submit} noValidate className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{editing ? 'Edit Room Type' : 'Add New Room Type'}</h1>
          <Link to="/room-types" className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200">← Back to Room Types</Link>
        </div>

        <div className="space-y-4">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Room Type Name *</label>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} /><Err k="name" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Nightly Rate (₦) *</label>
            <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">₦</span>
              <input className={`${input} pl-8`} type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div><Err k="rate" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Capacity (Max Guests) *</label>
            <input className={input} type="number" min="1" step="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            <p className="mt-1 text-xs text-gray-500">Maximum number of guests allowed</p><Err k="capacity" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
            <textarea className={input} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></div>

          {editing && (
            <div className="rounded-md bg-gray-50 p-4 ring-1 ring-gray-100">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Room Type Information</h3>
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                <div>Total Rooms<div className="mt-0.5 text-base font-bold text-gray-900">{roomCount}</div></div>
                <div>Created<div className="mt-0.5 text-sm text-gray-900">{initial?.createdAt ? shortDate(initial.createdAt) : '—'}</div></div>
              </div>
            </div>)}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
          <span className="text-xs text-gray-500">{editing && roomCount > 0 ? `Cannot delete: ${roomCount} room(s) assigned` : ''}</span>
          <div className="flex gap-2">
            <button type="button" className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200" onClick={() => nav('/room-types')}>Cancel</button>
            <button disabled={save.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {save.isPending ? 'Saving…' : editing ? 'Update Room Type' : 'Create Room Type'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
