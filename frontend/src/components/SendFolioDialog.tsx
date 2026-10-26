import { useEffect, useState } from 'react';
import { Mail, MessageCircle, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { dt } from '@/lib/utils';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Channel = 'EMAIL' | 'WHATSAPP' | 'SMS';

/** Send the folio invoice (or one payment's receipt) by email, WhatsApp and/or SMS. */
export function SendFolioDialog({ folioId, open, onClose, txId }: { folioId: string; open: boolean; onClose: () => void; txId?: string }) {
  const { data: opt } = useGet<any>(`/folios/${folioId}/delivery-options`, undefined, open);
  const [on, setOn] = useState<Record<Channel, boolean>>({ EMAIL: true, WHATSAPP: false, SMS: false });
  const [to, setTo] = useState<Record<Channel, string>>({ EMAIL: '', WHATSAPP: '', SMS: '' });
  useEffect(() => {
    if (!opt) return;
    setTo({ EMAIL: opt.email ?? '', WHATSAPP: opt.phone ?? '', SMS: opt.phone ?? '' });
    setOn({ EMAIL: !!opt.email && opt.available.EMAIL, WHATSAPP: false, SMS: false });
  }, [opt]);

  const send = useAction(
    () => api.post(`/folios/${folioId}/send`, { kind: txId ? 'RECEIPT' : 'INVOICE', txId, targets: (Object.keys(on) as Channel[]).filter((c) => on[c] && to[c].trim()).map((c) => ({ channel: c, to: to[c].trim() })) }),
    {
      invalidate: [`/folios/${folioId}/deliveries`],
      onSuccess: (r) => {
        const bad = r.results.filter((x: any) => x.status === 'FAILED');
        r.results.filter((x: any) => x.status !== 'FAILED').forEach((x: any) => toast.success(`${x.channel === 'WHATSAPP' ? 'WhatsApp queued' : x.channel === 'EMAIL' ? 'Email sent' : 'SMS sent'} to ${x.to}`));
        bad.forEach((x: any) => toast.error(`${x.channel} to ${x.to}: ${x.error}`));
        if (!bad.length) onClose();
      },
    },
  );

  const rows: { c: Channel; label: string; icon: any; placeholder: string; note?: string }[] = [
    { c: 'EMAIL', label: 'Email (PDF attached)', icon: Mail, placeholder: 'guest@example.com' },
    { c: 'WHATSAPP', label: 'WhatsApp (secure PDF link)', icon: MessageCircle, placeholder: '0803 000 0000', note: opt && !opt.whatsappOptIn ? 'Guest has not opted in to WhatsApp' : undefined },
    { c: 'SMS', label: 'SMS (secure PDF link)', icon: Smartphone, placeholder: '0803 000 0000' },
  ];
  const any = (Object.keys(on) as Channel[]).some((c) => on[c] && to[c].trim());

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{txId ? 'Send payment receipt' : 'Send folio / invoice'}</DialogTitle><DialogDescription>Links expire after 7 days. Everything sent is logged on the folio.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {rows.map(({ c, label, icon: Icon, placeholder, note }) => {
            const unavailable = opt && !opt.available[c];
            const blocked = unavailable || (c === 'WHATSAPP' && opt && !opt.whatsappOptIn);
            return (
              <div key={c} className={blocked ? 'opacity-60' : ''}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={on[c]} disabled={!!blocked} onChange={(e) => setOn({ ...on, [c]: e.target.checked })} />
                  <Icon className="h-4 w-4" /> {label}
                  {unavailable && <Badge variant="gray">Not configured</Badge>}
                  {note && !unavailable && <Badge variant="yellow">{note}</Badge>}
                </label>
                <Input className="mt-1.5" placeholder={placeholder} disabled={!on[c]} value={to[c]} onChange={(e) => setTo({ ...to, [c]: e.target.value })} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => send.mutate(undefined)} disabled={!any || send.isPending}><Send className="h-4 w-4" /> {send.isPending ? 'Sending…' : 'Send'}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

export function DeliveryHistory({ folioId }: { folioId: string }) {
  const { data } = useGet<any[]>(`/folios/${folioId}/deliveries`);
  if (!data?.length) return null;
  return (
    <div className="no-print mt-6 border-t pt-4">
      <h2 className="mb-2 font-semibold">Sent to guest</h2>
      <table className="w-full text-sm"><thead className="border-b text-xs uppercase text-muted-foreground"><tr>{['When', 'Document', 'Channel', 'To', 'By', 'Status'].map((h) => <th key={h} className="py-2 text-left">{h}</th>)}</tr></thead>
        <tbody>{data.map((r) => (
          <tr key={r.id} className="border-b"><td className="py-2">{dt(r.createdAt)}</td><td>{r.kind === 'RECEIPT' ? 'Receipt' : 'Invoice'}</td><td>{r.channel}</td><td>{r.recipient}</td><td>{r.sentBy ?? '—'}</td>
            <td><Badge variant={r.status === 'FAILED' ? 'red' : r.status === 'READ' || r.status === 'DELIVERED' ? 'green' : statusVariant(r.status)} title={r.error ?? undefined}>{r.status}</Badge></td></tr>
        ))}</tbody></table>
    </div>
  );
}