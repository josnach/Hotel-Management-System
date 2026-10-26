import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { money } from '@/lib/utils';
import { Field, PageHeader } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function RoomTypes() {
  const { data, isLoading } = useGet<any[]>('/rooms/types');
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState<any>({});
  const open = (t: any) => { setEdit(t); setF({ name: t.name ?? '', description: t.description ?? '', nightlyRate: t.nightlyRate ?? '', capacity: t.capacity ?? 2 }); };
  const save = useAction(() => (edit.id ? api.put(`/rooms/types/${edit.id}`, f) : api.post('/rooms/types', f)), { success: 'Room type saved', invalidate: ['/rooms/types'], onSuccess: () => setEdit(null) });
  const del = useAction((id: string) => api.del(`/rooms/types/${id}`), { success: 'Room type deleted', invalidate: ['/rooms/types'] });
  return (
    <>
      <PageHeader title="Room Types">{canManage && <Button onClick={() => open({})}>Add New Room Type</Button>}</PageHeader>
      <ListCard rows={data} loading={isLoading} cols={[
        { header: 'Name', cell: (t) => <div><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.description}</div></div> },
        { header: 'Nightly rate', cell: (t) => money(t.nightlyRate) }, { header: 'Capacity', cell: (t) => `${t.capacity} person(s)` },
        ...(canManage ? [{ header: 'Actions', cell: (t: any) => <div className="flex gap-3 text-xs font-medium"><button className="text-blue-700" onClick={() => open(t)}>Edit</button><button className="text-red-600" onClick={() => confirm(`Delete ${t.name}?`) && del.mutate(t.id)}>Delete</button></div> }] : []),
      ]} />
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? 'Edit room type' : 'Add room type'}</DialogTitle></DialogHeader>
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nightly rate (₦)"><Input type="number" value={f.nightlyRate} onChange={(e) => setF({ ...f, nightlyRate: e.target.value })} /></Field>
            <Field label="Capacity"><Input type="number" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
          </div>
          <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>Save</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
