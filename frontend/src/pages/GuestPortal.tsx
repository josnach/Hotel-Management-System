import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API = '/api/portal';
const naira = (v: number) => '₦' + Math.round(v).toLocaleString('en-NG');
const KINDS: [string, string][] = [['CLEAN_ROOM', 'Clean my room'], ['TOWELS', 'Extra towels'], ['TOILETRIES', 'Toiletries'], ['MAINTENANCE', 'Report a problem'], ['LATE_CHECKOUT', 'Late checkout'], ['OTHER', 'Something else']];
const STATUS: Record<string, string> = { NEW: 'Waiting for the front desk', ACCEPTED: 'On its way', DONE: 'Done', DECLINED: 'Declined', CANCELLED: 'Cancelled' };
type Tab = 'food' | 'help' | 'bill' | 'feedback';

async function call(path: string, opts: { method?: string; body?: unknown; session?: string | null } = {}) {
  const res = await fetch(`${API}${path}`, { method: opts.method ?? 'GET', headers: { 'Content-Type': 'application/json', ...(opts.session ? { Authorization: `Bearer ${opts.session}` } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.message ?? 'Something went wrong. Please try again.'), { status: res.status });
  return data;
}

export default function GuestPortal() {
  const { token = '' } = useParams();
  const key = `portal:${token}`;
  const [room, setRoom] = useState<any>(null);
  const [fatal, setFatal] = useState('');
  const [session, setSession] = useState<string | null>(() => sessionStorage.getItem(key));
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('food');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { call(`/rooms/${token}`).then(setRoom).catch((e) => setFatal(e.message)); }, [token]);
  const refresh = () => call('/me', { session }).then(setMe).catch((e) => { if (e.status === 401) { sessionStorage.removeItem(key); setSession(null); setMe(null); } });
  useEffect(() => { if (session) refresh(); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(''); try { await fn(); setMsg(ok); await refresh(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };

  if (fatal) return <Shell><p className="py-16 text-center text-slate-600">{fatal}</p></Shell>;
  if (!room) return <Shell><p className="py-16 text-center text-slate-500">Loading…</p></Shell>;
  if (!session || !me) return <Shell hotel={room.hotelName} sub={`Room ${room.room.number}`}><Unlock token={token} menu={room.menu} onOk={(s) => { sessionStorage.setItem(key, s); setSession(s); }} /></Shell>;

  return (
    <Shell hotel={room.hotelName} sub={`Room ${me.room} · Hello, ${me.guestName}`}>
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 text-center text-xs font-medium">
        {([['food', 'Food'], ['help', 'Requests'], ['bill', 'My bill'], ['feedback', 'Feedback']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setMsg(''); }} className={`rounded-md py-2 ${tab === k ? 'bg-white shadow-sm' : 'text-slate-600'}`}>{l}</button>
        ))}
      </div>
      {msg && <div className="mb-3 rounded-md bg-blue-50 p-3 text-sm text-blue-800">{msg}</div>}
      {!me.live && <div className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">You have checked out. You can still see your bill and leave feedback.</div>}
      {tab === 'food' && <Food menu={room.menu} live={me.live} busy={busy} send={(items, notes) => run(() => call('/orders', { method: 'POST', session, body: { items, notes: notes || undefined } }), 'Order sent. The front desk will confirm it shortly.')} />}
      {tab === 'help' && <Help live={me.live} busy={busy} send={(kind, text) => run(() => call('/requests', { method: 'POST', session, body: { kind, text: text || undefined } }), 'Request sent. We are on it.')} />}
      {tab === 'bill' && <Bill folio={me.folio} />}
      {tab === 'feedback' && <Feedback busy={busy} send={(rating, comment) => run(() => call('/feedback', { method: 'POST', session, body: { rating, comment: comment || undefined } }), 'Thank you for your feedback!')} />}
      {me.requests.length > 0 && tab !== 'feedback' && (
        <div className="mt-6"><div className="mb-2 text-sm font-semibold">Your requests</div>
          <div className="space-y-2">{me.requests.filter((r: any) => r.type !== 'FEEDBACK').map((r: any) => (
            <div key={r.id} className="rounded-lg border bg-white p-3 text-sm">
              <div className="flex justify-between"><span className="font-medium">{r.type === 'ORDER' ? `Food order${r.estimatedTotal ? ` · ${naira(r.estimatedTotal)}` : ''}` : (KINDS.find((k) => k[0] === r.kind)?.[1] ?? 'Request')}</span><span className="text-xs text-slate-500">{STATUS[r.status]}</span></div>
              {r.type === 'ORDER' && <div className="mt-1 text-xs text-slate-500">{(r.items ?? []).map((i: any) => `${i.quantity} × ${i.name}`).join(', ')}</div>}
              {r.declineReason && <div className="mt-1 text-xs text-red-600">{r.declineReason}</div>}
              {r.status === 'NEW' && <button className="mt-2 text-xs text-red-600 underline" onClick={() => run(() => call(`/requests/${r.id}/cancel`, { method: 'POST', session }), 'Request cancelled.')}>Cancel</button>}
            </div>))}</div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ hotel, sub, children }: { hotel?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 pb-10 pt-6">
        {hotel && <div className="mb-5"><div className="text-xl font-bold">{hotel}</div><div className="text-sm text-slate-500">{sub}</div></div>}
        {children}
      </div>
    </div>
  );
}

function Unlock({ token, menu, onOk }: { token: string; menu: any[]; onOk: (s: string) => void }) {
  const [pin, setPin] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(''); try { onOk((await call(`/rooms/${token}/unlock`, { method: 'POST', body: { pin } })).session); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <>
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-1 font-semibold">Welcome</div>
        <p className="mb-3 text-sm text-slate-600">Enter the 4-digit PIN the front desk gave you at check-in to order food, make requests and see your bill.</p>
        <input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" className="mb-3 w-full rounded-lg border px-3 py-3 text-center text-2xl tracking-[0.5em]" />
        {err && <div className="mb-3 text-sm text-red-600">{err}</div>}
        <button disabled={pin.length !== 4 || busy} onClick={go} className="w-full rounded-lg bg-slate-900 py-3 font-medium text-white disabled:opacity-40">Continue</button>
      </div>
      <div className="mt-6"><div className="mb-2 text-sm font-semibold">Room service menu</div><MenuList menu={menu} /></div>
    </>
  );
}

function MenuList({ menu }: { menu: any[] }) {
  const cats = [...new Set(menu.map((m) => m.category))];
  if (!menu.length) return <p className="text-sm text-slate-500">The menu is not available right now.</p>;
  return <>{cats.map((c) => <div key={c} className="mb-3"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">{c}</div>{menu.filter((m) => m.category === c).map((m) => <div key={m.id} className="flex justify-between border-b py-1.5 text-sm"><span>{m.name}</span><span>{naira(m.price)}</span></div>)}</div>)}</>;
}

function Food({ menu, live, busy, send }: { menu: any[]; live: boolean; busy: boolean; send: (items: { itemId: string; quantity: number }[], notes: string) => void }) {
  const [cart, setCart] = useState<Record<string, number>>({}); const [notes, setNotes] = useState('');
  const lines = menu.filter((m) => cart[m.id] > 0);
  const total = lines.reduce((s, m) => s + m.price * cart[m.id], 0);
  const cats = [...new Set(menu.map((m) => m.category))];
  const set = (id: string, d: number) => setCart({ ...cart, [id]: Math.max(0, Math.min(10, (cart[id] ?? 0) + d)) });
  if (!live) return <MenuList menu={menu} />;
  if (!menu.length) return <p className="text-sm text-slate-500">Room service is not available right now.</p>;
  return (
    <>
      {cats.map((c) => (
        <div key={c} className="mb-4"><div className="mb-1 text-xs font-semibold uppercase text-slate-500">{c}</div>
          {menu.filter((m) => m.category === c).map((m) => (
            <div key={m.id} className={`flex items-center justify-between border-b py-2 text-sm ${m.available ? '' : 'opacity-40'}`}>
              <div><div>{m.name}</div><div className="text-xs text-slate-500">{m.available ? naira(m.price) : 'Not available'}</div></div>
              {m.available && <div className="flex items-center gap-3"><button className="h-8 w-8 rounded-full border text-lg" onClick={() => set(m.id, -1)}>−</button><span className="w-4 text-center">{cart[m.id] ?? 0}</span><button className="h-8 w-8 rounded-full border text-lg" onClick={() => set(m.id, 1)}>+</button></div>}
            </div>))}
        </div>))}
      {lines.length > 0 && (
        <div className="sticky bottom-3 rounded-xl border bg-white p-3 shadow-lg">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Any instructions? (optional)" className="mb-2 w-full rounded-lg border px-3 py-2 text-sm" />
          <button disabled={busy} onClick={() => { send(lines.map((m) => ({ itemId: m.id, quantity: cart[m.id] })), notes); setCart({}); setNotes(''); }} className="w-full rounded-lg bg-slate-900 py-3 font-medium text-white disabled:opacity-40">Send order · {naira(total)}</button>
          <div className="mt-1 text-center text-xs text-slate-500">Charged to your room after the front desk confirms. Service charge and VAT may apply.</div>
        </div>
      )}
    </>
  );
}

function Help({ live, busy, send }: { live: boolean; busy: boolean; send: (kind: string, text: string) => void }) {
  const [kind, setKind] = useState('CLEAN_ROOM'); const [text, setText] = useState('');
  if (!live) return <p className="text-sm text-slate-500">New requests are closed after checkout.</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">{KINDS.map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={`rounded-lg border py-3 text-sm ${kind === k ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{l}</button>)}</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={3} placeholder="Add a note (optional)" className="w-full rounded-lg border px-3 py-2 text-sm" />
      <button disabled={busy} onClick={() => { send(kind, text); setText(''); }} className="w-full rounded-lg bg-slate-900 py-3 font-medium text-white disabled:opacity-40">Send request</button>
    </div>
  );
}

function Bill({ folio }: { folio: { lines: any[]; balance: number } }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      {folio.lines.length === 0 && <p className="text-sm text-slate-500">Nothing on your bill yet.</p>}
      {folio.lines.map((l, i) => <div key={i} className="flex justify-between gap-3 border-b py-2 text-sm last:border-0"><div><div>{l.description}</div><div className="text-xs text-slate-500">{new Date(l.date).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div><div className={l.payment ? 'text-green-700' : ''}>{l.payment ? `− ${naira(l.payment)}` : naira(l.charge)}</div></div>)}
      <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Balance</span><span>{naira(folio.balance)}</span></div>
    </div>
  );
}

function Feedback({ busy, send }: { busy: boolean; send: (rating: number, comment: string) => void }) {
  const [rating, setRating] = useState(0); const [comment, setComment] = useState('');
  return (
    <div className="space-y-3">
      <div className="text-sm">How is your stay so far?</div>
      <div className="flex justify-between">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} className={`h-12 w-12 rounded-full border text-xl ${rating >= n ? 'bg-amber-400' : 'bg-white'}`}>★</button>)}</div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={4} placeholder="Tell us more (optional)" className="w-full rounded-lg border px-3 py-2 text-sm" />
      <button disabled={!rating || busy} onClick={() => send(rating, comment)} className="w-full rounded-lg bg-slate-900 py-3 font-medium text-white disabled:opacity-40">Send feedback</button>
    </div>
  );
}
