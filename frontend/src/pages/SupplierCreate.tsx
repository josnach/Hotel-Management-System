import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { errText, NIGERIAN_STATES, ui } from '@/lib/finUi';

const EMPTY = {
  name: '',
  code: '',
  contactPerson: '',
  email: '',
  phone: '',
  altPhone: '',
  address: '',
  city: '',
  state: '',
  country: 'Nigeria',
  postalCode: '',
  taxId: '',
  paymentTerms: '',
  bankName: '',
  accountNumber: '',
  accountName: '',
  notes: '',
  isActive: true,
};

type Form = typeof EMPTY;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className={ui.label}>{label}</label>
      {children}
    </div>
  );
}

export default function SupplierCreate() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(EMPTY);
  const [error, setError] = useState('');

  const text = (k: keyof Form) => ({
    className: ui.input,
    value: f[k] as string,
    onChange: (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value })),
  });

  const save = useMutation({
    mutationFn: () => api.post('/finance/suppliers', f),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      void qc.invalidateQueries({ queryKey: ['po-supplier-options'] });
      navigate('/finance/suppliers');
    },
    onError: (e) => setError(errText(e)),
  });

  const submit = () => {
    if (!f.name.trim()) return setError('Supplier name is required');
    if (f.phone.trim().length < 5) return setError('Phone is required');
    setError('');
    save.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className={ui.h1}>Create New Supplier</h1>
        <p className={ui.sub}>Add a new supplier to your system.</p>
      </div>

      <div className={ui.card}>
        <div className="space-y-6 p-5">
          <section className="space-y-4">
            <h2 className={ui.section}>Basic Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Supplier Name *"><input {...text('name')} /></Field>
              <Field label="Supplier Code">
                <input {...text('code')} placeholder="Will be auto-generated if empty" />
              </Field>
              <Field label="Contact Person"><input {...text('contactPerson')} /></Field>
              <Field label="Email"><input type="email" {...text('email')} /></Field>
              <Field label="Phone *"><input type="tel" {...text('phone')} /></Field>
              <Field label="Alternate Phone"><input type="tel" {...text('altPhone')} /></Field>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className={ui.section}>Address Information</h2>
            <Field label="Address">
              <textarea
                className={ui.input}
                rows={3}
                value={f.address}
                onChange={(e) => setF((s) => ({ ...s, address: e.target.value }))}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="City"><input {...text('city')} /></Field>
              <Field label="State">
                <select
                  className={ui.input}
                  value={f.state}
                  onChange={(e) => setF((s) => ({ ...s, state: e.target.value }))}
                >
                  <option value="">Select State</option>
                  {NIGERIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Country"><input {...text('country')} /></Field>
              <Field label="Postal Code"><input {...text('postalCode')} /></Field>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className={ui.section}>Business Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tax ID"><input {...text('taxId')} /></Field>
              <Field label="Payment Terms"><input {...text('paymentTerms')} /></Field>
              <Field label="Bank Name"><input {...text('bankName')} /></Field>
              <Field label="Account Number"><input {...text('accountNumber')} /></Field>
              <Field label="Account Name"><input {...text('accountName')} /></Field>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className={ui.section}>Additional Information</h2>
            <Field label="Notes">
              <textarea
                className={ui.input}
                rows={4}
                value={f.notes}
                onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
                checked={f.isActive}
                onChange={(e) => setF((s) => ({ ...s, isActive: e.target.checked }))}
              />
              Active Supplier
            </label>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button type="button" className={ui.btnWhite} onClick={() => navigate('/finance/suppliers')}>
            Cancel
          </button>
          <button type="button" className={ui.btnBlue} disabled={save.isPending} onClick={submit}>
            Create Supplier
          </button>
        </div>
      </div>
    </div>
  );
}