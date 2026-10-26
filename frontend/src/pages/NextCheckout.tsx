import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Eye, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { dt } from '@/lib/utils';
import { PageHeader, PrintButton, Stat } from '@/components/common';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckoutDialog } from './InHouse';

export default function NextCheckout() {
  const [hours, setHours] = useState(14);
  const { data } = useGet('/stays/next-checkout', { hours });
  const [target, setTarget] = useState<any>(null);
  const extend = useAction((id: string) => api.post(`/stays/${id}/extend`, { nights: 1 }), { success: 'Stay extended by 1 night', invalidate: ['/stays/next-checkout'] });
  return (
    <>
      <PageHeader title="Guests Due for Checkout">
        <NativeSelect className="w-44" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          {[2, 6, 14, 24, 48].map((h) => <option key={h} value={h}>Next {h} hours</option>)}
        </NativeSelect>
        <PrintButton />
      </PageHeader>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat label="Total Guests" value={data?.total ?? 0} />
        <Stat label="Within 2 Hours" value={<span className="text-red-600">{data?.withinTwoHours ?? 0}</span>} />
        <Stat label="Today" value={<span className="text-orange-600">{data?.today ?? 0}</span>} />
        <Stat label="Time Frame" value={<span className="text-blue-600">{hours} hours</span>} />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-muted-foreground"><tr>{['Guest name', 'Room', 'Check-in date', 'Departure date', 'Time left', 'Actions'].map((h) => <th key={h} className="px-4 py-2 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {data?.rows?.map((r: any) => (
              <tr key={r.id} className={r.overdue ? 'border-b bg-red-50' : 'border-b'}>
                <td className="px-4 py-3"><div className="font-medium">{r.guest.firstName} {r.guest.lastName}</div><div className="text-xs text-muted-foreground">{r.guest.phone}</div></td>
                <td className="px-4 py-3">{r.room.number}</td>
                <td className="px-4 py-3">{dt(r.checkInAt)}</td>
                <td className="px-4 py-3 font-medium text-red-700">{dt(r.expectedDeparture)} {r.overdue && <Badge variant="red" className="ml-1">OVERDUE</Badge>}</td>
                <td className="px-4 py-3">{r.overdue ? <Badge variant="red" className="bg-red-600 text-white">OVERDUE: {r.overdueDays} days</Badge> : <Badge variant="orange">{r.hoursLeft.toFixed(1)} h left</Badge>}</td>
                <td className="px-4 py-3"><div className="flex gap-3 text-xs font-medium">
                  <button className="flex items-center gap-1 text-blue-700" onClick={() => setTarget(r)}><LogOut className="h-3.5 w-3.5" /> Check Out</button>
                  <button className="flex items-center gap-1 text-green-700" onClick={() => extend.mutate(r.id)}><CalendarPlus className="h-3.5 w-3.5" /> Extend</button>
                  <Link className="flex items-center gap-1 text-slate-700" to={`/guests/${r.guestId}`}><Eye className="h-3.5 w-3.5" /> View</Link>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.rows?.length && <div className="py-10 text-center text-sm text-muted-foreground">No guests are due for checkout in this time frame.</div>}
      </Card>
      <CheckoutDialog stay={target} onClose={() => setTarget(null)} />
    </>
  );
}
