import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAction } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { api, tokenStore } from '@/lib/api';

const HINT = 'Password must be at least 8 characters long and contain a mix of letters, numbers, and symbols.';

/** Same rule as the backend (/auth/change-password). */
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters long.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) return 'Password must contain a mix of letters, numbers, and symbols.';
  return null;
}

function strength(pw: string) {
  if (!pw) return { label: 'Weak', pct: 0, text: 'text-gray-500', bar: 'bg-gray-300' };
  const score = [
    pw.length >= 8,
    pw.length >= 12,
    /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    /\d/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ].filter(Boolean).length;
  if (score <= 2) return { label: 'Weak', pct: Math.max(score, 1) * 20, text: 'text-red-600', bar: 'bg-red-500' };
  if (score <= 4) return { label: 'Medium', pct: score * 20, text: 'text-amber-600', bar: 'bg-amber-500' };
  return { label: 'Strong', pct: 100, text: 'text-green-600', bar: 'bg-green-500' };
}

function PasswordField({ id, label, value, onChange, placeholder, autoComplete, error, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder: string; autoComplete: string; error?: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-base font-semibold text-gray-700">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          className={cn(
            'h-[46px] w-full rounded-lg border bg-white pl-4 pr-12 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2',
            error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/30',
          )}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {error && <p role="alert" className="mt-1.5 text-sm text-red-600">{error}</p>}
      {hint && <p className="mt-2 text-sm leading-snug text-gray-500">{hint}</p>}
    </div>
  );
}

export default function ChangePassword() {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [tried, setTried] = useState(false);
  const s = strength(f.next);

  const errors = {
    current: f.current ? '' : 'Enter your current password.',
    next: !f.next
      ? 'Enter a new password.'
      : passwordProblem(f.next) ?? (f.next === f.current ? 'New password must be different from your current password.' : ''),
    confirm: !f.confirm ? 'Confirm your new password.' : f.confirm !== f.next ? 'Passwords do not match.' : '',
  };

const save = useAction(
  () => api.post('/auth/change-password', { currentPassword: f.current, newPassword: f.next }),
  {
    // The server has already revoked this session, so there is no point calling /auth/logout.
    onSuccess: () => {
      tokenStore.clear();
      window.location.href = '/login?passwordChanged=1';
    },
  },
);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (errors.current || errors.next || errors.confirm) return;
    save.mutate(undefined);
  };

  return (
    <div className="mx-auto w-full max-w-xl px-2 pb-16 pt-12">
      <h1 className="text-center text-4xl font-extrabold tracking-tight text-gray-900">Change Your Password</h1>
      <p className="mt-3 text-center text-base text-gray-600">Ensure your account is using a strong, secure password.</p>

      <form onSubmit={submit} noValidate className="mt-12 space-y-6">
        <PasswordField
          id="current-password" label="Current Password" autoComplete="current-password"
          placeholder="Enter your current password" value={f.current}
          onChange={(v) => setF({ ...f, current: v })} error={tried ? errors.current : ''}
        />
        <PasswordField
          id="new-password" label="New Password" autoComplete="new-password"
          placeholder="Enter your new password" value={f.next}
          onChange={(v) => setF({ ...f, next: v })} error={tried ? errors.next : ''} hint={HINT}
        />
        <PasswordField
          id="confirm-password" label="Confirm New Password" autoComplete="new-password"
          placeholder="Confirm your new password" value={f.confirm}
          onChange={(v) => setF({ ...f, confirm: v })} error={tried ? errors.confirm : ''}
        />

        <div aria-live="polite">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-gray-700">Password Strength</span>
            <span className={cn('text-base font-semibold', s.text)}>{s.label}</span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
            <div className={cn('h-full rounded-full transition-all duration-300', s.bar)} style={{ width: `${s.pct}%` }} />
          </div>
        </div>

        <Link to="/" className="inline-block text-base font-medium text-blue-600 hover:text-blue-800">← Back to Dashboard</Link>

        <button
          type="submit"
          disabled={save.isPending}
          className="relative flex h-[52px] w-full items-center justify-center rounded-lg bg-blue-600 text-base font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70"
        >
          <KeyRound className="absolute left-4 h-5 w-5 text-blue-300" />
          {save.isPending ? 'Changing Password…' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}