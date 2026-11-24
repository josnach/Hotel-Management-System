import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { errText, naira, PAY_METHODS, PAYEE_TYPES, today, ui } from '@/lib/finUi';

interface Option {
  id: string;
  label: string;
}

interface Line {
  key: number;
  description: string;
  amount: string;
  accountCode: string;
}

let lineKey = 0;
const newLine = (): Line => ({ key: ++lineKey, description: '', amount: '', accountCode: '' });

export default function PaymentVoucherCreate() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [transactionDate, setTransactionDate] = useState(today());
  const [payeeType, setPayeeType] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [debitAccountId, setDebitAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [items, setItems] = useState<Line[]>([]);
  const [error, setError] = useState('');

  const next = useQuery({
    queryKey: ['payment-voucher-next'],
    queryFn: () => api.get('/finance/payment-vouchers/next-number') as Promise<{ voucherNo: string }>,
  });
  const accounts = useQuery({
    queryKey: ['payment-voucher-accounts'],
    queryFn: () =>
      api.get('/finance/payment-vouchers/accounts') as Promise<{ expense: Option[]; cash: Option[] }>,
  });

  // With itemised lines the total is their sum; otherwise it is the Amount field.
  const total = items.length
    ? items.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    : Number(amount) || 0;

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      api.post('/finance/payment-vouchers', {
        transactionDate,
        payeeType,
        payeeName,
        description,
        amount: items.length ? undefined : amount || undefined,
        debitAccountId,
        creditAccountId,
        paymentMethod,
        items: items.map((i) => ({
          description: i.description,
          amount: i.amount,
          accountCode: i.accountCode || undefined,
        })),
        submit,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payment-vouchers'] });
      navigate('/finance/payment-vouchers');
    },
    onError: (e) => setError(errText(e)),
  });

  const submit = (andSubmit: boolean) => {
    if (!payeeType) return setError('Select a payee type');
    if (!payeeName.trim()) return setError('Enter the payee name');
    if (!description.trim()) return setError('Enter a description');
    if (!(total > 0)) return setError('Enter an amount greater than zero');
    if (!debitAccountId) return setError('Select an expense account');
    if (!creditAccountId) return setError('Select a cash/bank account');
    if (!paymentMethod) return setError('Select a payment method');
    if (items.some((i) => !i.description.trim() || !(Number(i.amount) > 0))) {
      return setError('Every item needs a description and an amount');
    }
    setError('');
    save.mutate(andSubmit);
  };

  const patch = (key: number, p: Partial<Line>) =>
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className={ui.h1}>Create Payment Voucher</h1>
        <p className={ui.sub}>Create a new payment voucher for hotel expenses</p>
      </div>

      <div className={`space-y-6 p-5 ${ui.card}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={ui.label}>Voucher Number *</label>
            <input className={ui.readonly} readOnly value={next.data?.voucherNo ?? ''} />
          </div>
          <div>
            <label className={ui.label}>Transaction Date *</label>
            <input type="date" className={ui.input} value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-4 border-t border-gray-100 pt-5">
          <h2 className={ui.section}>Payee Information</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={ui.label}>Payee Type *</label>
              <select className={ui.input} value={payeeType} onChange={(e) => setPayeeType(e.target.value)}>
                <option value="">Select Type</option>
                {PAYEE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={ui.label}>Payee Name *</label>
              <input className={ui.input} placeholder="Enter payee name" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-gray-100 pt-5">
          <h2 className={ui.section}>Payment Details</h2>
          <div>
            <label className={ui.label}>Description *</label>
            <textarea className={ui.input} rows={3} placeholder="Enter payment description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className={ui.label}>Amount (₦) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={ui.input}
              placeholder="0.00"
              disabled={items.length > 0}
              value={items.length ? total.toFixed(2) : amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={ui.label}>Debit Account (Expense) *</label>
              <select className={ui.input} value={debitAccountId} onChange={(e) => setDebitAccountId(e.target.value)}>
                <option value="">Select Expense Account</option>
                {(accounts.data?.expense ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={ui.label}>Credit Account (Cash/Bank) *</label>
              <select className={ui.input} value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)}>
                <option value="">Select Cash/Bank Account</option>
                {(accounts.data?.cash ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="md:w-1/2 md:pr-2">
            <label className={ui.label}>Payment Method *</label>
            <select className={ui.input} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="">Select Method</option>
              {PAY_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4 border-t border-gray-100 pt-5">
          <div className="flex items-center justify-between">
            <h2 className={ui.section}>Items</h2>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-blue-50" onClick={() => setItems((r) => [...r, newLine()])}>
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>

          {items.map((it) => (
            <div key={it.key} className="rounded-lg border border-gray-200 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className={ui.label}>Description *</label>
                  <input className={ui.input} placeholder="Item description" value={it.description} onChange={(e) => patch(it.key, { description: e.target.value })} />
                </div>
                <div>
                  <label className={ui.label}>Amount (₦) *</label>
                  <input type="number" min="0" step="0.01" className={ui.input} placeholder="0.00" value={it.amount} onChange={(e) => patch(it.key, { amount: e.target.value })} />
                </div>
                <div>
                  <label className={ui.label}>Account Code</label>
                  <input className={ui.input} placeholder="GL Account Code" value={it.accountCode} onChange={(e) => patch(it.key, { accountCode: e.target.value })} />
                </div>
              </div>
              <div className="mt-2 text-right">
                <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => setItems((r) => r.filter((x) => x.key !== it.key))}>
                  Remove Item
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 pt-5">
          <span className="text-base font-semibold text-gray-900">Total Amount:</span>
          <span className="text-xl font-bold text-blue-700">{naira(total)}</span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between">
          <button type="button" className={ui.btnWhite} onClick={() => navigate('/finance/payment-vouchers')}>
            Cancel
          </button>
          <div className="flex gap-3">
            <button type="button" className={ui.btnBlue} disabled={save.isPending} onClick={() => submit(false)}>
              Save Draft
            </button>
            <button type="button" className={ui.btnGreen} disabled={save.isPending} onClick={() => submit(true)}>
              Save &amp; Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}