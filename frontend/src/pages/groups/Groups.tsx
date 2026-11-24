import { useState } from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { money } from '@/lib/utils';

import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Modal, StatusPill, balanceClass, n } from './shared';

type GroupRow = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  members: number;
  status: 'CHECKED_IN' | 'NOT_CHECKED_IN';
  balance: number | string;
};

function GroupForm({ group, onClose }: { group: GroupRow | null; onClose: () => void }) {
  const [f, setF] = useState({
    name: group?.name ?? '',
    contact: group?.contact ?? '',
    phone: group?.phone ?? '',
    notes: group?.notes ?? '',
  });

  const save = useAction(
    (body: typeof f & { email?: string }) =>
      group ? api.put(`/groups/${group.id}`, body) : api.post('/groups', body),
    {
      success: group ? 'Group updated' : 'Group created',
      invalidate: ['/groups'],
      onSuccess: () => onClose(),
    },
  );

  const submit = () => {
    if (!f.name.trim()) return;
    // The form has no email field (matches the video), so pass the stored one through unchanged.
    save.mutate({ ...f, email: group?.email ?? undefined });
  };

  return (
    <Modal title={group ? 'Edit Group' : 'Create New Group'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Group Name *">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Contact Person">
          <Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
        </Field>
        <Field label="Contact Phone">
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending || !f.name.trim()}>
            {save.isPending ? 'Saving…' : group ? 'Save Changes' : 'Create Group'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteGroup({ group, onClose }: { group: GroupRow; onClose: () => void }) {
const del = useAction(() => api.del(`/groups/${group.id}`), {
    success: 'Group deleted',
    invalidate: ['/groups'],
    onSuccess: () => onClose(),
  });

  return (
    <Modal title="Delete group" onClose={onClose}>
      <p className="text-sm">
        Delete <b>{group.name}</b>? This only works for a group with no stays, folios, orders or
        reservations. Groups with history are kept for the records.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          className="bg-red-600 text-white hover:bg-red-700"
          disabled={del.isPending}
          onClick={() => del.mutate(undefined)}
        >
          {del.isPending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Modal>
  );
}

export default function Groups() {
  const { user } = useAuth();
  const canDelete = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const { data: groups, isLoading } = useGet<GroupRow[]>('/groups');
  const [editing, setEditing] = useState<GroupRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<GroupRow | null>(null);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Groups Management</h1>
        <Button onClick={() => setEditing('new')}>Create New Group</Button>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Group Name</th>
              <th className="px-4 py-3">Contact Person</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && !groups?.length && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No groups yet.</td></tr>
            )}
            {groups?.map((g) => {
              const bal = n(g.balance);
              return (
                <tr key={g.id} className="border-b last:border-0">
                  <td className="px-4 py-4 font-semibold">{g.name}</td>
                  <td className="px-4 py-4">
                    <div>{g.contact}</div>
                    {g.phone && <div className="text-muted-foreground">{g.phone}</div>}
                  </td>
                  <td className="px-4 py-4">{g.members} members</td>
                  <td className="px-4 py-4"><StatusPill checkedIn={g.status === 'CHECKED_IN'} /></td>
                  <td className={`px-4 py-4 ${balanceClass(bal)}`}>{money(bal)}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Link to={`/groups/${g.id}`} className="text-blue-600 hover:underline">View</Link>
                      <button type="button" className="text-green-600 hover:underline" onClick={() => setEditing(g)}>
                        Edit
                      </button>
                      <Link to={`/groups/${g.id}/history`} className="flex items-center gap-1 font-medium hover:underline">
                        <History className="h-4 w-4" /> History
                      </Link>
                      {canDelete && (
                        <button type="button" className="text-red-600 hover:underline" onClick={() => setDeleting(g)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {editing && (
        <GroupForm group={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {deleting && <DeleteGroup group={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}