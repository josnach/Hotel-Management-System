import { useState } from 'react';
import { Field, PageHeader, Stat } from '@/components/common';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';

const COLS: { key: string; title: string; match: (t: any) => boolean }[] = [
  { key: 'todo', title: 'To clean', match: (t) => t.status === 'PENDING' },
  { key: 'busy', title: 'Cleaning', match: (t) => t.status === 'IN_PROGRESS' },
  { key: 'check', title: 'Awaiting inspection', match: (t) => t.status === 'READY_FOR_INSPECTION' },
  { key: 'done', title: 'Done today', match: (t) => t.status === 'DONE' },
];
const TYPE: Record<string, string> = { CHECKOUT_CLEAN: 'Checkout', STAYOVER: 'Stayover', MANUAL: 'Manual' };
const ago = (iso?: string | null) => { if (!iso) return ''; const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const KEYS = ['/housekeeping/board', '/housekeeping/staff', '/housekeeping/metrics'];

export default function Housekeeping() {
  const { user } = useAuth();
  const isCleaner = user?.role === 'HOUSEKEEPING';
  const canSupervise = !isCleaner; // receptionist, manager, admin
  const [view, setView] = useState<'board' | 'metrics'>('board');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const board = useGet<any[]>('/housekeeping/board');
  const tasks = board.data ?? [];
  const selected = tasks.find((t) => t.id === open) ?? null;
  const awaiting = tasks.filter((t) => t.status === 'READY_FOR_INSPECTION').length;
  const waiting = tasks.filter((t) => t.status === 'PENDING').length;

  return (
    <>
      <PageHeader title="Housekeeping" subtitle={isCleaner ? 'Your rooms for today' : 'Assign rooms, follow the cleaning and inspect before release'} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Waiting" value={waiting} tone={waiting ? 'yellow' : 'white'} />
        <Stat label="Cleaning now" value={tasks.filter((t) => t.status === 'IN_PROGRESS').length} />
        <Stat label="Awaiting inspection" value={awaiting} tone={awaiting ? 'yellow' : 'white'} />
        <Stat label="Done today" value={tasks.filter((t) => t.status === 'DONE').length} tone="green" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={view === 'board' ? 'default' : 'outline'} onClick={() => setView('board')}>Board</Button>
        {canSupervise && <Button variant={view === 'metrics' ? 'default' : 'outline'} onClick={() => setView('metrics')}>Cleaning times</Button>}
        {canSupervise && <Button variant="outline" onClick={() => setAdding(true)}>+ Add task</Button>}
      </div>

      {view === 'board' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLS.map((c) => {
            const list = tasks.filter(c.match);
            return (
              <div key={c.key}>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">{c.title}<Badge variant="gray">{list.length}</Badge></div>
                <div className="space-y-2">
                  {list.length === 0 && <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Nothing here</div>}
                  {list.map((t) => (
                    <button key={t.id} onClick={() => setOpen(t.id)} className="w-full rounded-lg border bg-white p-3 text-left shadow-sm active:bg-slate-50">
                      <div className="flex items-center justify-between"><span className="text-lg font-bold">Room {t.room.number}</span><Badge variant={t.type === 'CHECKOUT_CLEAN' ? 'blue' : 'gray'}>{TYPE[t.type]}</Badge></div>
                      <div className="mt-1 text-xs text-muted-foreground">{t.room.type}{t.room.floor != null ? ` · Floor ${t.room.floor}` : ''}</div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span>{t.assignedTo ? t.assignedTo.name : <span className="text-amber-700">Unassigned</span>}</span>
                        <span className="text-muted-foreground">{t.status === 'IN_PROGRESS' ? `Started ${ago(t.startedAt)} ago` : t.status === 'DONE' ? (t.cleaningMinutes != null ? `${t.cleaningMinutes} min` : '') : `Waiting ${ago(t.createdAt)}`}</span>
                      </div>
                      {t.reworkCount > 0 && <div className="mt-1 text-xs font-medium text-red-600">Redo requested{t.inspectionNote ? `: ${t.inspectionNote}` : ''}</div>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {view === 'metrics' && canSupervise && <Metrics />}
      {selected && <TaskDialog task={selected} canSupervise={canSupervise} userId={user?.id} onClose={() => setOpen(null)} />}
      {adding && <AddDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function TaskDialog({ task, canSupervise, userId, onClose }: { task: any; canSupervise: boolean; userId?: string; onClose: () => void }) {
  const staff = useGet<any[]>('/housekeeping/staff', undefined, canSupervise);
  const [note, setNote] = useState('');
  const act = (path: string, body?: any, success?: string) => useAction(() => api.post(`/housekeeping/tasks/${task.id}/${path}`, body ?? {}), { success, invalidate: KEYS });
  const start = act('start'); const finish = act('finish', { notes: note || undefined }, 'Sent for inspection');
  const pass = act('inspect', { pass: true, note: note || undefined }, 'Room released'); const fail = act('inspect', { pass: false, note }, 'Sent back for redo');
  const cancel = act('cancel', undefined, 'Task cancelled');
  const assign = useAction((userId: string) => api.post(`/housekeeping/tasks/${task.id}/assign`, { userId: userId || null }), { success: 'Assigned', invalidate: KEYS });
  const check = useAction((v: { index: number; done: boolean }) => api.post(`/housekeeping/tasks/${task.id}/check`, v), { invalidate: KEYS });
  const working = task.status === 'IN_PROGRESS';
  const allDone = task.checklist.every((c: any) => c.done);
  const ownInspection = task.assignedTo?.id === userId;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Room {task.room.number} · {TYPE[task.type]} clean</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {task.notes && <div className="rounded-md bg-slate-50 p-2 text-xs">{task.notes}</div>}
          {task.inspectionNote && task.reworkCount > 0 && <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">Redo requested: {task.inspectionNote}</div>}
          <div className="space-y-2">
            {task.checklist.map((c: any, i: number) => (
              <label key={i} className="flex items-start gap-3 rounded-md border p-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-5 w-5" checked={c.done} disabled={!working || check.isPending} onChange={(e) => check.mutate({ index: i, done: e.target.checked })} />
                <span className={c.done ? 'text-muted-foreground line-through' : ''}>{c.label}</span>
              </label>
            ))}
          </div>
          {canSupervise && ['PENDING', 'IN_PROGRESS'].includes(task.status) && (
            <Field label="Assign to"><NativeSelect value={task.assignedTo?.id ?? ''} onChange={(e) => assign.mutate(e.target.value)}>
              <option value="">Unassigned</option>{(staff.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.openTasks} open)</option>)}
            </NativeSelect></Field>
          )}
          {(working || task.status === 'READY_FOR_INSPECTION') && <Input placeholder={task.status === 'READY_FOR_INSPECTION' ? 'Inspection note (required if redo)' : 'Notes, e.g. lost property found (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />}
          <div className="flex flex-wrap justify-end gap-2">
            {task.status === 'PENDING' && <Button disabled={start.isPending} onClick={() => start.mutate(undefined, { onSuccess: onClose })}>Start cleaning</Button>}
            {working && <Button disabled={!allDone || finish.isPending} onClick={() => finish.mutate(undefined, { onSuccess: onClose })}>{allDone ? 'Finish' : 'Tick every item to finish'}</Button>}
            {task.status === 'READY_FOR_INSPECTION' && canSupervise && !ownInspection && (<>
              <Button variant="destructive" disabled={!note.trim() || fail.isPending} onClick={() => fail.mutate(undefined, { onSuccess: onClose })}>Redo</Button>
              <Button disabled={pass.isPending} onClick={() => pass.mutate(undefined, { onSuccess: onClose })}>Pass and release room</Button>
            </>)}
            {canSupervise && !['DONE', 'CANCELLED'].includes(task.status) && <Button variant="outline" onClick={() => confirm('Cancel this task?') && cancel.mutate(undefined, { onSuccess: onClose })}>Cancel task</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({ onClose }: { onClose: () => void }) {
  const rooms = useGet<any[]>('/rooms');
  const [roomId, setRoomId] = useState(''); const [notes, setNotes] = useState('');
  const add = useAction(() => api.post('/housekeeping/tasks', { roomId, notes: notes || undefined }), { success: 'Task added', invalidate: [...KEYS, '/rooms'], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add cleaning task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Room"><NativeSelect value={roomId} onChange={(e) => setRoomId(e.target.value)}><option value="">Choose…</option>{(rooms.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.number} ({r.status})</option>)}</NativeSelect></Field>
          <Field label="Note (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="text-xs text-muted-foreground">A vacant room is held as "Cleaning" until the task is inspected.</div>
          <div className="flex justify-end"><Button disabled={!roomId || add.isPending} onClick={() => add.mutate(undefined)}>Add task</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metrics() {
  const { data, isLoading, error } = useGet<any>('/housekeeping/metrics');
  const m = (v: number | null | undefined) => (v == null ? '—' : `${v} min`);
  return (
    <>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat label="Rooms cleaned (30 days)" value={data?.tasksDone ?? 0} />
        <Stat label="Avg cleaning time" value={m(data?.avgCleaningMinutes)} />
        <Stat label="Avg checkout to ready" value={m(data?.avgTurnaroundMinutes)} />
        <Stat label="Sent back for redo" value={`${data?.reworkRate ?? 0}%`} tone={(data?.reworkRate ?? 0) > 15 ? 'red' : 'green'} />
      </div>
      <Card className="mb-3 p-3 text-xs text-muted-foreground">Cleaning time runs from Start to Finish. Checkout to ready runs from checkout until the room is inspected and released, so it includes waiting for a cleaner and for the inspection.</Card>
      <ListCard rows={data?.staff} loading={isLoading} error={error} empty="No finished tasks in this period." cols={[
        { header: 'Cleaner', cell: (r: any) => r.name }, { header: 'Rooms', cell: (r: any) => r.tasks },
        { header: 'Avg time (checkout cleans)', cell: (r: any) => m(r.avgCleaningMinutes) }, { header: 'Redone', cell: (r: any) => r.reworks },
      ]} />
    </>
  );
}
