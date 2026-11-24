// src/pages/StaffForm.tsx   (routes: /staff/new and /staff/:id/edit)
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, DEPARTMENTS, EMPLOYMENT_LABELS, EmploymentType, Staff, StaffInput, staffApi } from '@/lib/staffApi';

const EMPTY: StaffInput = {
  firstName: '', middleName: '', lastName: '', email: '', phone: '', altPhone: '', dateOfBirth: '', gender: '',
  department: '', position: '', jobTitle: '', employmentType: '', hireDate: '', confirmationDate: '', supervisorId: '', status: 'Active',
  basicSalary: 0, hourlyRate: 0, mealAllowance: 0, transportAllowance: 0, housingAllowance: 0, compLimit: 50000,
  bankName: '', accountNumber: '', accountName: '', tin: '', address: '', city: '', state: '',
  emergencyName: '', emergencyPhone: '', emergencyRelationship: '',
};
const REQUIRED: (keyof StaffInput)[] = ['firstName', 'lastName', 'email', 'phone', 'department', 'position', 'employmentType', 'hireDate'];
const cls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600';

export default function StaffForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const [form, setForm] = useState<StaffInput>(EMPTY);
  const [others, setOthers] = useState<Staff[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    staffApi.list({}).then(setOthers).catch(() => {});
    if (id) staffApi.get(id).then((s) => setForm(s)).catch((e) => setFormError(e.message));
  }, [id]);

  const set = (k: keyof StaffInput, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing: Record<string, string> = {};
    REQUIRED.forEach((k) => { if (!String(form[k]).trim()) missing[k] = 'This field is required'; });
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) missing.email = 'Enter a valid email address';
    setErrors(missing); setFormError('');
    if (Object.keys(missing).length) return;
    setSaving(true);
    try { editing ? await staffApi.update(id!, form) : await staffApi.create(form); nav('/staff'); }
    catch (err) {
      if (err instanceof ApiError) { setErrors(err.fieldErrors); setFormError(err.message); } else setFormError('Something went wrong. Try again.');
    } finally { setSaving(false); }
  }

  const text = (k: keyof StaffInput, label: string, o: { required?: boolean; type?: string; hint?: string } = {}) => (
    <Field label={label} required={o.required} hint={o.hint} error={errors[k]}>
      <input className={cls} type={o.type ?? 'text'} min={o.type === 'number' ? 0 : undefined} step={o.type === 'number' ? 'any' : undefined}
        value={form[k] as string | number} onChange={(e) => set(k, o.type === 'number' ? Number(e.target.value) : e.target.value)} />
    </Field>);
  const pick = (k: keyof StaffInput, label: string, opts: [string, string][], placeholder: string, required = false) => (
    <Field label={label} required={required} error={errors[k]}>
      <select className={cls} value={form[k] as string} onChange={(e) => set(k, e.target.value)}>
        <option value="">{placeholder}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </Field>);

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-10">
      <h1 className="text-3xl font-extrabold tracking-tight">{editing ? 'Edit Staff' : 'Add New Staff'}</h1>
      <p className="mb-6 mt-1 text-gray-600">{editing ? 'Update staff details and comp allowance' : 'Create a staff account and set their comp allowance'}</p>
      {formError && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{formError}</div>}

      <form onSubmit={submit} noValidate className="rounded-xl bg-white p-6 shadow sm:p-8">
        <Section title="Personal Information">
          {text('firstName', 'First Name', { required: true })}{text('middleName', 'Middle Name')}{text('lastName', 'Last Name', { required: true })}
          {text('email', 'Email', { required: true, type: 'email' })}{text('phone', 'Phone', { required: true, type: 'tel' })}{text('altPhone', 'Alternative Phone', { type: 'tel' })}
          {text('dateOfBirth', 'Date of Birth', { type: 'date' })}
          {pick('gender', 'Gender', [['Male', 'Male'], ['Female', 'Female'], ['Other', 'Other']], 'Select Gender')}
        </Section>
        <Section title="Employment Information">
          {pick('department', 'Department', DEPARTMENTS.map((d) => [d, d]), 'Select Department', true)}
          {text('position', 'Position', { required: true })}{text('jobTitle', 'Job Title')}
          {pick('employmentType', 'Employment Type', (Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((k) => [k, EMPLOYMENT_LABELS[k]]), 'Select Type', true)}
          {text('hireDate', 'Hire Date', { required: true, type: 'date' })}{text('confirmationDate', 'Confirmation Date', { type: 'date' })}
          {pick('supervisorId', 'Supervisor', others.filter((s) => s.id !== id).map((s) => [s.id, s.fullName]), 'None')}
          {editing && pick('status', 'Status', [['Active', 'Active'], ['Inactive', 'Inactive']], 'Select')}
        </Section>
        <Section title="Compensation & Benefits">
          {text('basicSalary', 'Basic Salary', { required: true, type: 'number' })}{text('hourlyRate', 'Hourly Rate', { type: 'number' })}{text('mealAllowance', 'Monthly Meal Allowance', { type: 'number' })}
          {text('transportAllowance', 'Transport Allowance', { type: 'number' })}{text('housingAllowance', 'Housing Allowance', { type: 'number' })}
          {text('compLimit', 'Monthly Comp Limit', { type: 'number', hint: 'Maximum value for complimentary services per month' })}
        </Section>
        <Section title="Bank Information">
          {text('bankName', 'Bank Name')}{text('accountNumber', 'Account Number')}{text('accountName', 'Account Name')}{text('tin', 'TIN')}
        </Section>
        <Section title="Contact & Emergency Information">
          <div className="sm:row-span-3"><Field label="Address"><textarea className={cls} rows={5} value={form.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
          {text('city', 'City')}{text('state', 'State')}
          <div className="sm:col-span-2">{text('emergencyName', 'Emergency Contact Name')}</div>
          <div className="sm:col-span-2">{text('emergencyPhone', 'Emergency Contact Phone', { type: 'tel' })}</div>
          <div className="sm:col-span-2">{text('emergencyRelationship', 'Relationship')}</div>
        </Section>
        <div className="mt-8 flex justify-end gap-3">
          <button type="button" className="rounded-lg bg-gray-300 px-5 py-2.5 text-sm font-medium" onClick={() => nav('/staff')}>Cancel</button>
          <button disabled={saving} className="rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Staff Member'}</button>
        </div>
      </form>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mb-8"><h3 className="mb-4 border-b pb-2 text-lg font-semibold">{title}</h3><div className="grid gap-4 sm:grid-cols-3">{children}</div></section>);

const Field = ({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) => (
  <div><label className="mb-1 block text-sm font-medium">{label}{required && ' *'}</label>{children}
    {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</div>);
