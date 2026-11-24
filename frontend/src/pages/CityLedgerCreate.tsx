import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface GuestOption {
  id: string;
  label: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const input =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const label = 'mb-1.5 block text-sm font-medium text-gray-800';

export default function CityLedgerCreate() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [guestId, setGuestId] = useState('');
  const [type, setType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(today());
  const [error, setError] = useState('');

  const guests = useQuery({
    queryKey: ['city-ledger', 'guests'],
    queryFn: () => api.get('/finance/city-ledger/guests') as Promise<GuestOption[]>,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/finance/city-ledger', { guestId, type, amount, description, transactionDate }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['city-ledger'] });
      navigate('/finance/city-ledger');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Something went wrong'),
  });

  const submit = () => {
    if (!guestId) return setError('Select a guest');
    if (!(Number(amount) > 0)) return setError('Enter an amount greater than zero');
    if (!description.trim()) return setError('Enter a description');
    setError('');
    create.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl rounded-lg bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Add City Ledger Transaction</h1>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <label className={label}>Select Guest</label>
          <select className={input} value={guestId} onChange={(e) => setGuestId(e.target.value)}>
            <option value="">Select Guest</option>
            {(guests.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>

        <div>
          <span className={label}>Transaction Type</span>
          <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
            <label className="flex cursor-pointer items-center gap-1.5 text-red-700">
              <input type="radio" name="type" checked={type === 'DEBIT'} onChange={() => setType('DEBIT')} />
              Debit (Guest Owes Money)
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-green-600">
              <input type="radio" name="type" checked={type === 'CREDIT'} onChange={() => setType('CREDIT')} />
              Credit (Hotel Owes Money)
            </label>
          </div>
        </div>

        <div>
          <label className={label}>Amount (₦)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className={input}
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div>
          <label className={label}>Description</label>
          <input
            className={input}
            placeholder="e.g., Outstanding balance, Credit refund, etc."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className={label}>Transaction Date</label>
          <input type="date" className={input} value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md bg-gray-600 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700"
            onClick={() => navigate('/finance/city-ledger')}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={create.isPending}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={submit}
          >
            Add Transaction
          </button>
        </div>
      </div>
    </div>
  );
}
