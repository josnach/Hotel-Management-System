import { useState } from 'react';
import { Field } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { d, money } from '@/lib/utils';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const birthdayLabel = (m?: number | null, day?: number | null) => (m && day ? `${day} ${MONTHS[m - 1]}` : null);
const KEYS = ['/crm/guests', '/crm/birthdays', '/guests', '/stays/in-house'];

/** The guest's relationship profile: VIP, preferences, birthday, history, and (for managers) the blacklist. */
export function GuestCrmCard({ id }: { id: string }) {
  const { user } = useAuth();
  const manager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const { data: c } = useGet<any>(`/crm/guests/${id}`);
  const [editing, setEditing] = useState(false);
  const blacklist = useAction(() => { const reason = prompt('Why is this guest being blacklisted? Keep it factual. Their future bookings will be cancelled.'); if (!reason || reason.trim().length < 5) return Promise.reject(new Error('A clear reason is needed')); return api.post(`/crm/guests/${id}/blacklist`, { reason: reason.trim() }); }, { success: 'Guest blacklisted', invalidate: [...KEYS, `/crm/guests/${id}`, `/guests/${id}`] });
  const unblacklist = useAction(() => api.post(`/crm/guests/${id}/unblacklist`, { note: prompt('Note (optional)') || undefined }), { success: 'Blacklist removed', invalidate: [...KEYS, `/crm/guests/${id}`, `/guests/${id}`] });
  if (!c) return null;
  const bd = birthdayLabel(c.birthMonth, c.birthDay);
  return (
    <>
      {c.isBlacklisted && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"><b>Blacklisted.</b> {c.blacklistReason}</div>}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Guest profile</CardTitle><div className="flex gap-1">{c.isVip && <Badge variant="yellow">VIP</Badge>}{c.stats.visits > 1 && <Badge variant="blue">Repeat guest</Badge>}</div></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-xs text-muted-foreground">Visits</div><div className="font-semibold">{c.stats.visits}</div></div>
            <div><div className="text-xs text-muted-foreground">Nights stayed</div><div className="font-semibold">{c.stats.nights}</div></div>
            <div><div className="text-xs text-muted-foreground">Total billed</div><div className="font-semibold">{money(c.stats.totalBilled)}</div></div>
            <div><div className="text-xs text-muted-foreground">Average per visit</div><div className="font-semibold">{money(c.stats.averageSpendPerVisit)}</div></div>
            <div><div className="text-xs text-muted-foreground">Usual room type</div><div className="font-semibold">{c.stats.favouriteRoomType ?? '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Last stay</div><div className="font-semibold">{c.stats.lastStay ? d(c.stats.lastStay) : '—'}</div></div>
          </div>
          <div><div className="text-xs text-muted-foreground">Preferences</div><div>{c.preferences || <span className="text-muted-foreground">None recorded</span>}</div></div>
          {c.isVip && c.vipNote && <div><div className="text-xs text-muted-foreground">Why VIP</div><div>{c.vipNote}</div></div>}
          <div><div className="text-xs text-muted-foreground">Birthday</div><div>{bd ?? <span className="text-muted-foreground">Not recorded</span>}{c.daysToBirthday === 0 && <Badge variant="green" className="ml-2">Today</Badge>}{c.daysToBirthday !== null && c.daysToBirthday > 0 && c.daysToBirthday <= 14 && <span className="ml-2 text-xs text-muted-foreground">in {c.daysToBirthday} days</span>}</div></div>
          <div className="flex flex-wrap gap-2 pt-1"><Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit profile</Button>
            {manager && !c.isBlacklisted && <Button size="sm" variant="destructive" disabled={blacklist.isPending} onClick={() => blacklist.mutate(undefined)}>Blacklist</Button>}
            {manager && c.isBlacklisted && <Button size="sm" variant="outline" disabled={unblacklist.isPending} onClick={() => confirm('Remove this guest from the blacklist?') && unblacklist.mutate(undefined)}>Remove blacklist</Button>}</div>
        </CardContent>
      </Card>
      {c.history.length > 0 && (
        <Card><CardHeader><CardTitle>Stay history</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          {c.history.map((h: any) => <div key={h.id} className="flex justify-between border-b py-1 last:border-0"><span>Room {h.room} <span className="text-xs text-muted-foreground">({h.roomType})</span></span><span className="text-xs text-muted-foreground">{d(h.checkInAt)}{h.checkOutAt ? ` – ${d(h.checkOutAt)}` : ' – in house'}</span></div>)}
        </CardContent></Card>
      )}
      {editing && <ProfileDialog id={id} c={c} onClose={() => setEditing(false)} />}
    </>
  );
}

function ProfileDialog({ id, c, onClose }: { id: string; c: any; onClose: () => void }) {
  const [f, setF] = useState({ isVip: c.isVip as boolean, vipNote: c.vipNote ?? '', preferences: c.preferences ?? '', month: c.birthMonth ? String(c.birthMonth) : '', day: c.birthDay ? String(c.birthDay) : '' });
  const save = useAction(() => api.put(`/crm/guests/${id}/profile`, { isVip: f.isVip, vipNote: f.isVip ? f.vipNote || null : null, preferences: f.preferences || null, birthMonth: f.month ? Number(f.month) : null, birthDay: f.day ? Number(f.day) : null }), { success: 'Profile saved', invalidate: [...KEYS, `/crm/guests/${id}`], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent>
      <DialogHeader><DialogTitle>Guest profile</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.isVip} onChange={(e) => setF({ ...f, isVip: e.target.checked })} />VIP guest</label>
        {f.isVip && <Field label="Why are they a VIP?"><Input value={f.vipNote} maxLength={200} onChange={(e) => setF({ ...f, vipNote: e.target.value })} /></Field>}
        <Field label="Preferences" hint="e.g. high floor, extra pillows, quiet room, allergies, no pork"><textarea className="w-full rounded-md border px-3 py-2 text-sm" rows={3} maxLength={500} value={f.preferences} onChange={(e) => setF({ ...f, preferences: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Birthday month"><NativeSelect value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })}><option value="">Not recorded</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</NativeSelect></Field>
          <Field label="Day"><Input inputMode="numeric" maxLength={2} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <p className="text-xs text-muted-foreground">Only the day and month are kept, never the year.</p>
        <Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
      </div>
    </DialogContent></Dialog>
  );
}
