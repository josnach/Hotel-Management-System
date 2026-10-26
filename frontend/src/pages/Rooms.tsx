import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { cn, money } from '@/lib/utils';
import { Field, PageHeader } from '@/components/common';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';

const tone: Record<string, string> = { OCCUPIED: 'border-red-200 bg-red-50', AVAILABLE: 'border-green-200 bg-green-50', CLEANING: 'border-blue-200 bg-blue-50', MAINTENANCE: 'border-yellow-200 bg-yellow-50', RESERVED: 'border-purple-200 bg-purple-50' };
const STATUSES = ['AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE', 'RESERVED'];

function RoomDialog({ room, onClose }: { room: any; onClose: () => void }) {
  const { data: types } = useGet<any[]>('/rooms/types');
  const [f, setF] = useState<any>(room?.id ? { number: room.number, roomTypeId: room.roomTypeId, rateOverride: room.rateOverride ?? '' } : { number: '', roomTypeId: '', rateOverride: '' });
  const save = useAction(() => {
    const body = { number: f.number, roomTypeId: f.roomTypeId, rateOverride: f.rateOverride === '' ? null : Number(f.rateOverride) };
    return room?.id ? api.put(`/rooms/${room.id}`, body) : api.post('/rooms', body);
  }, { success: 'Room saved', invalidate: ['/rooms'], onSuccess: onClose });
  return (
    <Dialog open={!!room} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{room?.id ? `Edit room ${room.number}` : 'Add room'}</DialogTitle></DialogHeader>
        <Field label="Room number"><Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
        <Field label="Room type"><NativeSelect value={f.roomTypeId} onChange={(e) => setF({ ...f, roomTypeId: e.target.value })}><option value="">Choose a type</option>{types?.map((t) => <option key={t.id} value={t.id}>{t.name} — {money(t.nightlyRate)}</option>)}</NativeSelect></Field>
        <Field label="Rate override (₦)" hint="Leave blank to use the room type's nightly rate"><Input type="number" value={f.rateOverride} onChange={(e) => setF({ ...f, rateOverride: e.target.value })} /></Field>
        <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>Save room</Button>
      </DialogContent>
    </Dialog>
  );
}

export default function Rooms() {
  const { data } = useGet<any[]>('/rooms');
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER'; // everyone else can view rooms and change status only
  const [edit, setEdit] = useState<any>(null);
  const setStatus = useAction((v: { id: string; status: string }) => api.patch(`/rooms/${v.id}/status`, { status: v.status }), { success: 'Room status updated', invalidate: ['/rooms'] });
  return (
    <>
      <PageHeader title="Rooms" subtitle={`${data?.length ?? 0} rooms`}>{canManage && <Button onClick={() => setEdit({})}>Add Room</Button>}</PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data?.map((r) => (
          <div key={r.id} className={cn('rounded-lg border-2 p-4', tone[r.status])}>
            <div className="flex items-start justify-between"><div className="text-lg font-bold">{r.number}</div><div className="font-bold">{money(r.rateOverride ?? r.roomType.nightlyRate)}</div></div>
            <div className="text-xs text-muted-foreground">{r.roomType.name}</div>
            <Badge variant={statusVariant(r.status)} className="mt-1 capitalize">{r.status.toLowerCase()}</Badge>
            {r.occupant && <div className="mt-2 rounded bg-white p-2 text-xs"><div className="text-muted-foreground">Occupied by:</div><div className="font-semibold">{r.occupant.name}</div><div className="text-muted-foreground">{r.occupant.phone}</div></div>}
            <div className="mt-3 flex gap-2">
              {canManage && <Button size="sm" className="flex-1" onClick={() => setEdit(r)}>Edit</Button>}
              <NativeSelect className="h-8 flex-1 text-xs" value={r.status} onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value })}>
                {STATUSES.filter((s) => !(user?.role === 'HOUSEKEEPING' && s === 'AVAILABLE')).map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
              </NativeSelect>
            </div>
          </div>
        ))}
      </div>
      {edit && <RoomDialog room={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
