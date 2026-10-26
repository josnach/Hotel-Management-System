import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, CalendarPlus, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { dt, initials, money } from '@/lib/utils';
import { Field, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export function CheckoutDialog({ stay, onClose }: { stay: any; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [city, setCity] = useState(false);
  const go = useAction(() => api.post(`/stays/${stay.id}/check-out`, { payment: Number(amount) > 0 ? { amount: Number(amount), method } : undefined, moveToCityLedger: city }),
    { success: 'Guest checked out', invalidate: ['/stays/in-house', '/stays/next-checkout', '/rooms', '/guests'], onSuccess: onClose });
  return (
    <Dialog open={!!stay} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Check out {stay?.guest?.firstName} {stay?.guest?.lastName}</DialogTitle><DialogDescription>Room {stay?.room?.number}. Record any final payment, then confirm.</DialogDescription></DialogHeader>
        <Field label="Payment amount (₦)"><Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Payment method"><NativeSelect value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="TRANSFER">Transfer</option></NativeSelect></Field>
        <label className="flex items-center justify-between text-sm"><span>Move any balance to the city ledger</span><Switch checked={city} onCheckedChange={setCity} /></label>
        <Button onClick={() => go.mutate(undefined)} disabled={go.isPending}>Confirm check-out</Button>
      </DialogContent>
    </Dialog>
  );
}

export default function InHouse() {
  const { data } = useGet<any[]>('/stays/in-house');
  const [target, setTarget] = useState<any>(null);
  const extend = useAction((id: string) => api.post(`/stays/${id}/extend`, { nights: 1 }), { success: 'Stay extended by 1 night', invalidate: ['/stays/in-house'] });
  return (
    <>
      <PageHeader title="In-House Guests" subtitle={`${data?.length ?? 0} guests currently checked in`} />
      <Card className="divide-y">
        {data?.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{initials(`${s.guest.firstName} ${s.guest.lastName}`)}</div>
            <div className="min-w-[180px] flex-1"><div className="font-medium">{s.guest.firstName} {s.guest.lastName} {s.guest.isVip && <Badge variant="yellow">VIP</Badge>}</div>{s.guest.preferences && <div className="text-xs text-amber-700">Prefers: {s.guest.preferences}</div>}<div className="text-xs text-muted-foreground">Checked In: {dt(s.checkInAt)} · Proposed Departure: {dt(s.expectedDeparture)}</div></div>
            <div><Badge variant="blue">Room {s.room.number}</Badge><div className="mt-1 text-xs text-muted-foreground">{s.group ? s.group.name : 'Individual Guest'}</div></div>
            <div className="text-xs text-muted-foreground">{s.guest.email ?? 'No email'}<br />{s.guest.phone}</div>
            <div className="w-28 text-right font-semibold text-red-600">{money(s.balance)}</div>
            <div className="flex items-center gap-2">
              {s.folio && <Link to={`/folios/${s.folio.id}`} title="Folio"><FileText className="h-4 w-4 text-green-600" /></Link>}
              <Button size="sm" variant="outline" className="text-green-700" onClick={() => extend.mutate(s.id)}><CalendarPlus className="h-3.5 w-3.5" /> Extend</Button>
              <Button size="sm" variant="outline" className="text-red-700" onClick={() => setTarget(s)}><LogOut className="h-3.5 w-3.5" /> Check Out</Button>
            </div>
          </div>
        ))}
        {!data?.length && <div className="py-10 text-center text-sm text-muted-foreground">No guests are checked in.</div>}
      </Card>
      <CheckoutDialog stay={target} onClose={() => setTarget(null)} />
    </>
  );
}
