import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const HOTEL_NAME = 'Koraf Hotels'; // change the name here

export default function Login() {
  const { user, login, verifyTwoFactor } = useAuth();
  const nav = useNavigate();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      if (challenge) {
        await verifyTwoFactor(challenge, useRecovery ? { recoveryCode: code } : { code });
        nav('/');
      } else {
        const r = await login(id, pw);
        if (r.twoFactorRequired) { setChallenge(r.challengeToken); setCode(''); } else nav('/');
      }
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat p-4"
      style={{ backgroundImage: "url('/hotel-bg.JPG')" }}
    >
      <div className="absolute inset-0 bg-black/50" />

      <form onSubmit={submit} className="relative z-10 w-full max-w-sm space-y-5 rounded-2xl bg-white/95 p-8 shadow-2xl">
        <div className="text-center">
          <Building2 className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-2 text-2xl font-bold">{HOTEL_NAME}</h1>
          <p className="text-sm text-muted-foreground">{challenge ? 'Two-factor verification' : 'Sign in to continue'}</p>
        </div>
        {challenge ? (
          <div className="space-y-1.5">
            <Label htmlFor="code">{useRecovery ? 'Recovery code' : 'Authentication code'}</Label>
            <Input id="code" autoFocus autoComplete="one-time-code" inputMode={useRecovery ? 'text' : 'numeric'} placeholder={useRecovery ? 'XXXX-XXXX' : '6-digit code'} value={code} onChange={(e) => setCode(e.target.value)} required />
            <p className="text-xs text-muted-foreground">{useRecovery ? 'Each recovery code works once.' : 'Open your authenticator app and enter the current code.'}</p>
            <button type="button" className="text-xs text-blue-700 underline" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setErr(''); }}>{useRecovery ? 'Use my authenticator app instead' : 'Use a recovery code instead'}</button>
          </div>
        ) : (<>
          <div className="space-y-1.5"><Label htmlFor="id">Username or email</Label><Input id="id" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        </>)}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button className="w-full" disabled={busy}>{busy ? (challenge ? 'Verifying…' : 'Signing in…') : (challenge ? 'Verify' : 'Sign in')}</Button>
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Secure login with enterprise-grade encryption</p>
        <p className="text-center text-xs text-amber-600">Forgot password? Ask an administrator to reset it.</p>
      </form>
    </div>
  );
}