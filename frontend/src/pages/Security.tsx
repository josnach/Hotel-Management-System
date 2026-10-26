import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Laptop, LogOut, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/lib/hooks';
import { dt } from '@/lib/utils';
import { Field, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function TwoFactorCard() {
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [offPw, setOffPw] = useState(''); const [offCode, setOffCode] = useState(''); const [offOpen, setOffOpen] = useState(false);

  useEffect(() => { if (setup) QRCode.toDataURL(setup.otpauthUrl, { width: 200, margin: 1 }).then(setQr); else setQr(''); }, [setup]);

  const start = useAction(() => api.post('/auth/2fa/setup'), { onSuccess: (r) => setSetup(r) });
  const enable = useAction(() => api.post('/auth/2fa/enable', { code }), { success: 'Two-factor authentication is on', onSuccess: async (r) => { setRecovery(r.recoveryCodes); setSetup(null); setCode(''); await refresh(); } });
  const disable = useAction(() => api.post('/auth/2fa/disable', { password: offPw, code: offCode }), { success: 'Two-factor authentication is off', onSuccess: async () => { setOffOpen(false); setOffPw(''); setOffCode(''); await refresh(); } });
  const regen = useAction(() => api.post('/auth/2fa/recovery-codes', { code }), { onSuccess: (r) => { setRecovery(r.recoveryCodes); setCode(''); } });

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">{user?.twoFactorEnabled ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldOff className="h-5 w-5 text-slate-400" />}<h2 className="text-lg font-semibold">Two-factor authentication</h2></div>
        <Badge variant={user?.twoFactorEnabled ? 'green' : 'gray'}>{user?.twoFactorEnabled ? 'On' : 'Off'}</Badge>
      </div>

      {user?.mustSetUpTwoFactor && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Your role requires two-factor authentication. Please turn it on to continue.</p>}

      {recovery && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-900">Save these recovery codes now. They are shown only once.</p>
          <p className="mb-3 text-xs text-amber-800">If you lose your phone, each code lets you sign in one time. Keep them somewhere safe.</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">{recovery.map((c) => <span key={c} className="rounded bg-white px-2 py-1">{c}</span>)}</div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(recovery.join('\n')); toast.success('Copied'); }}>Copy</Button>
            <Button size="sm" onClick={() => setRecovery(null)}>I have saved them</Button>
          </div>
        </div>
      )}

      {!user?.twoFactorEnabled && !setup && <><p className="text-sm text-muted-foreground">Add a second step at sign-in using an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).</p><Button onClick={() => start.mutate(undefined)} disabled={start.isPending}>Set up two-factor</Button></>}

      {setup && (
        <div className="grid gap-4 md:grid-cols-[200px_1fr]">
          {qr ? <img src={qr} alt="Scan with your authenticator app" className="h-[200px] w-[200px] rounded border" /> : <div className="h-[200px] w-[200px] rounded border" />}
          <div className="space-y-3">
            <p className="text-sm">1. Scan the QR code with your authenticator app.<br />2. Enter the 6-digit code it shows.</p>
            <p className="text-xs text-muted-foreground">Can't scan? Enter this key manually: <span className="select-all font-mono">{setup.secret}</span></p>
            <Field label="6-digit code"><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-[180px]" /></Field>
            <div className="flex gap-2"><Button onClick={() => enable.mutate(undefined)} disabled={code.replace(/\s/g, '').length < 6 || enable.isPending}>Turn on</Button><Button variant="outline" onClick={() => { setSetup(null); setCode(''); }}>Cancel</Button></div>
          </div>
        </div>
      )}

      {user?.twoFactorEnabled && !offOpen && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Current code" hint="To get a fresh set of recovery codes"><Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-[160px]" /></Field>
            <Button variant="outline" onClick={() => regen.mutate(undefined)} disabled={code.replace(/\s/g, '').length < 6 || regen.isPending}>New recovery codes</Button>
          </div>
          <Button variant="outline" className="text-red-600" onClick={() => setOffOpen(true)}>Turn off two-factor</Button>
        </div>
      )}
      {offOpen && (
        <div className="grid items-end gap-3 border-t pt-4 md:grid-cols-3">
          <Field label="Password"><Input type="password" value={offPw} onChange={(e) => setOffPw(e.target.value)} /></Field>
          <Field label="Current code"><Input inputMode="numeric" value={offCode} onChange={(e) => setOffCode(e.target.value)} /></Field>
          <div className="flex gap-2"><Button variant="destructive" disabled={!offPw || offCode.length < 6 || disable.isPending} onClick={() => disable.mutate(undefined)}>Turn off</Button><Button variant="outline" onClick={() => setOffOpen(false)}>Cancel</Button></div>
        </div>
      )}
    </Card>
  );
}

function SessionsCard() {
  const { data, isLoading } = useGet<any[]>('/auth/sessions');
  const { logout } = useAuth();
  const revoke = useAction((s: any) => api.del(`/auth/sessions/${s.id}`), { success: 'Device signed out', invalidate: ['/auth/sessions'], onSuccess: (r) => r?.signedOutCurrent && logout() });
  const others = useAction(() => api.post('/auth/sessions/revoke-others'), { success: 'Signed out of all other devices', invalidate: ['/auth/sessions'] });
  const rows = data ?? [];
  return (
    <Card className="space-y-3 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Signed-in devices</h2>
        {rows.length > 1 && <Button variant="outline" size="sm" onClick={() => confirm('Sign out of every other device?') && others.mutate(undefined)}>Sign out all other devices</Button>}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <ul className="divide-y">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              {/iOS|Android/.test(s.deviceLabel) ? <Smartphone className="h-5 w-5 text-slate-500" /> : <Laptop className="h-5 w-5 text-slate-500" />}
              <div>
                <div className="text-sm font-medium">{s.deviceLabel} {s.current && <Badge variant="green" className="ml-1">This device</Badge>}</div>
                <div className="text-xs text-muted-foreground">{s.ip ?? 'Unknown IP'} · signed in {dt(s.createdAt)} · last active {dt(s.lastSeenAt)}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => revoke.mutate(s)}><LogOut className="h-3.5 w-3.5" /> {s.current ? 'Sign out' : 'Remove'}</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Security() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <div className="mx-auto max-w-3xl space-y-5"><PageHeader title="Account Security" subtitle="Two-factor sign-in and the devices signed in to your account" /><TwoFactorCard /><SessionsCard /></div>;
}