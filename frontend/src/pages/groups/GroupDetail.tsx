import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { money } from '@/lib/utils';

import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { TypePill, balanceClass, fmtDateTime, n } from './shared';

type Detail = {
  group: { id: string; name: string; contact: string | null; phone: string | null; notes: string | null };
  balance: number | string;
  status: 'CHECKED_IN' | 'NOT_CHECKED_IN';
  members: { stayId: string; name: string; phone: string; room: string; balance: number | string }[];
  transactions: {
    id: string; date: string; guestName: string | null; description: string; source: string;
    type: 'Debit' | 'Credit'; bill: number | string; payment: number | string; balance: number | string;
  }[];
  totals: { debits: number | string; credits: number | string; balance: number | string };
};

type Available = { stayId: string; name: string; phone: string; room: string };

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #group-print, #group-print * { visibility: visible !important; }
  #group-print { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
}`;

export default function GroupDetail() {
  const { id = '' } = useParams();
  const key = `/groups/${id}`;

  const { data } = useGet<Detail>(key);
  const [search, setSearch] = useState('');
  const { data: available } = useGet<Available[]>(`${key}/available-guests`, { search });

  const [pay, setPay] = useState({ amount: '', method: '', description: '' });

  const refresh = [key, `${key}/available-guests`, `${key}/history`, '/groups'];

  const add = useAction((stayId: string) => api.post(`${key}/members`, { stayId }), {
    success: 'Guest added to group',
    invalidate: refresh,
  });

  const remove = useAction((stayId: string) => api.del(`${key}/members/${stayId}`), {
    success: 'Guest removed from group',
    invalidate: refresh,
  });

  const addPayment = useAction(
    (body: { amount: string; method: string; description: string }) => api.post(`${key}/payments`, body),
    {
      success: 'Payment added',
      invalidate: refresh,
      onSuccess: () => setPay({ amount: '', method: '', description: '' }),
    },
  );

  if (!data) return <div className="py-12 text-center text-muted-foreground">Loading…</div>;

  const { group } = data;
  const balance = n(data.balance);
  const payValid = n(pay.amount) > 0 && !!pay.method && !!pay.description.trim();

  return (
    <div className="mx-auto max-w-5xl">
      <style>{PRINT_CSS}</style>

      <Card className="p-0">
        <div className="flex items-start justify-between border-b p-6">
          <div>
            <h1 className="text-lg font-semibold">Group: {group.name}</h1>
            <p className="text-sm text-muted-foreground">
              Contact: {group.contact || '—'}{group.phone ? ` - ${group.phone}` : ''}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Balance</div>
            <div className={`text-2xl font-bold ${balanceClass(balance)}`}>{money(balance)}</div>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="flex justify-end">
            <Button onClick={() => window.print()}>Print Folio</Button>
          </div>

          {/* Add checked-in guests */}
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div className="mb-3 font-semibold text-blue-900">Add Checked-in Guests to Group</div>
            <Field label="Search Checked-in Guests">
              <Input
                placeholder="Type to search checked-in guests…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>

            <div className="mt-3 rounded-lg border bg-blue-50/60 p-3">
              <div className="mb-2 text-sm font-semibold">Available Checked-in Guests</div>
              {!available?.length ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No checked-in guests available to add.
                </p>
              ) : (
                <div className="grid max-h-64 gap-3 overflow-y-auto md:grid-cols-2">
                  {available.map((g) => (
                    <div key={g.stayId} className="flex items-start justify-between rounded-md border bg-blue-50 p-3">
                      <div>
                        <div className="font-semibold">{g.name}</div>
                        <div className="text-sm text-muted-foreground">{g.phone}</div>
                        <div className="text-sm text-muted-foreground">Room: {g.room}</div>
                      </div>
                      <Button size="sm" disabled={add.isPending} onClick={() => add.mutate(g.stayId)}>
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Add payment */}
          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">Add Payment to Group Account</div>
              <div className="text-sm text-muted-foreground">
                Group Balance: <span className={`font-semibold ${balanceClass(balance)}`}>{money(balance)}</span>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Amount (₦) *">
                <Input
                  type="number" min="0" placeholder="0.00"
                  value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })}
                />
              </Field>
              <Field label="Payment Method *">
                <NativeSelect value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  <option value="">Select Method</option>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="TRANSFER">Transfer</option>
                </NativeSelect>
              </Field>
              <Field label="Description *">
                <Input
                  placeholder="e.g., Group payment for accommodation"
                  value={pay.description} onChange={(e) => setPay({ ...pay, description: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                className="bg-green-600 text-white hover:bg-green-700"
                disabled={!payValid || addPayment.isPending}
                onClick={() => addPayment.mutate(pay)}
              >
                {addPayment.isPending ? 'Adding…' : 'Add Payment'}
              </Button>
            </div>
          </div>

          {/* Members */}
          <div>
            <h2 className="mb-2 font-semibold">Group Members ({data.members.length})</h2>
            {data.members.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Room</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.stayId} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{m.name}</td>
                      <td className="px-3 py-3">{m.phone}</td>
                      <td className="px-3 py-3">{m.room}</td>
                      <td className={`px-3 py-3 text-right ${balanceClass(n(m.balance))}`}>{money(n(m.balance))}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Remove ${m.name} from ${group.name}?`)) remove.mutate(m.stayId);
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Transactions */}
          <div>
            <h2 className="mb-2 font-semibold">Group Transactions</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Guest Name</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Bills</th>
                    <th className="px-4 py-3">Payments</th>
                    <th className="px-4 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {!data.transactions.length && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No transactions yet.</td></tr>
                  )}
                  {data.transactions.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="whitespace-nowrap px-4 py-3">{fmtDateTime(t.date)}</td>
                      <td className="px-4 py-3">{t.guestName ?? <span className="text-muted-foreground">N/A</span>}</td>
                      <td className="px-4 py-3">{t.description}</td>
                      <td className="px-4 py-3"><TypePill type={t.type} /></td>
                      <td className="px-4 py-3 text-red-600">{n(t.bill) > 0 ? money(n(t.bill)) : ''}</td>
                      <td className="px-4 py-3 text-green-600">{n(t.payment) > 0 ? money(n(t.payment)) : ''}</td>
                      <td className={`px-4 py-3 font-semibold ${balanceClass(n(t.balance))}`}>{money(n(t.balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>

      {/* Print-only folio */}
      <div id="group-print" className="hidden p-6 text-[12px] text-black">
        <div className="grid grid-cols-2 gap-1">
          <div><b>Name:</b> {group.name}</div>
          <div><b>Members:</b> {data.members.length}</div>
          <div><b>Contact:</b> {group.contact || '—'}</div>
          <div><b>Checked In:</b> {data.members.length}</div>
          <div><b>Phone:</b> {group.phone || '—'}</div>
          <div><b>Status:</b> {data.status === 'CHECKED_IN' ? 'Active' : 'Inactive'}</div>
          <div><b>Notes:</b> {group.notes || 'None'}</div>
          <div><b>Balance:</b> {money(balance)}</div>
        </div>

        <h2 className="mb-1 mt-4 text-base font-bold">Group Members</h2>
        <table className="w-full border-collapse border text-left">
          <thead><tr>
            {['Name', 'Phone', 'Room', 'Balance'].map((h) => <th key={h} className="border px-2 py-1">{h}</th>)}
          </tr></thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.stayId}>
                <td className="border px-2 py-1">{m.name}</td><td className="border px-2 py-1">{m.phone}</td>
                <td className="border px-2 py-1">{m.room}</td>
                <td className="border px-2 py-1 text-right">{money(n(m.balance))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mb-1 mt-4 text-base font-bold">Group Transactions</h2>
        <table className="w-full border-collapse border text-left">
          <thead><tr>
            {['Date', 'Guest Name', 'Description', 'Type', 'Amount (₦)'].map((h) => <th key={h} className="border px-2 py-1">{h}</th>)}
          </tr></thead>
          <tbody>
            {data.transactions.map((t) => (
              <tr key={t.id}>
                <td className="border px-2 py-1">{fmtDateTime(t.date)}</td>
                <td className="border px-2 py-1">{t.guestName ?? 'N/A'}</td>
                <td className="border px-2 py-1">{t.description}<div className="text-[10px] text-gray-500">{t.source}</div></td>
                <td className="border px-2 py-1">{t.type}</td>
                <td className="border px-2 py-1 text-right">
                  {t.type === 'Credit' ? `+${money(n(t.payment))}` : `-${money(n(t.bill))}`}
                </td>
              </tr>
            ))}
            <tr><td colSpan={4} className="border px-2 py-1 text-right font-bold">Total Debits</td>
              <td className="border px-2 py-1 text-right font-bold">{money(n(data.totals.debits))}</td></tr>
            <tr><td colSpan={4} className="border px-2 py-1 text-right font-bold">Total Credits</td>
              <td className="border px-2 py-1 text-right font-bold">{money(n(data.totals.credits))}</td></tr>
            <tr><td colSpan={4} className="border px-2 py-1 text-right font-bold">Current Balance</td>
              <td className="border px-2 py-1 text-right font-bold">{money(balance)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}