import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Home, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { errText, naira, today, ui } from '@/lib/finUi';

interface SupplierOption {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
}

interface ItemOption {
  id: string;
  name: string;
  label: string;
}

interface Line {
  key: number;
  itemId: string;
  quantity: string;
  unitPrice: string;
  description: string;
}

let lineKey = 0;
const newLine = (): Line => ({ key: ++lineKey, itemId: '', quantity: '1', unitPrice: '0', description: '' });

export default function PurchaseOrderCreate() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [items, setItems] = useState<Line[]>([newLine()]);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [error, setError] = useState('');

  const next = useQuery({
    queryKey: ['po-next-number'],
    queryFn: () => api.get('/finance/purchase-orders/next-number') as Promise<{ poNo: string; vatRate: number }>,
  });
  const suppliers = useQuery({
    queryKey: ['po-supplier-options'],
    queryFn: () => api.get('/finance/suppliers/options') as Promise<SupplierOption[]>,
  });
  const itemOptions = useQuery({
    queryKey: ['po-item-options'],
    queryFn: () => api.get('/finance/purchase-orders/options/items') as Promise<ItemOption[]>,
  });

  const vatRate = next.data?.vatRate ?? 0.075;
  const lineTotal = (l: Line) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
  const subtotal = items.reduce((s, l) => s + lineTotal(l), 0);
  const vat = Math.round(subtotal * vatRate * 100) / 100;
  const total = subtotal + vat;

  const pickSupplier = (id: string) => {
    setSupplierId(id);
    const s = suppliers.data?.find((x) => x.id === id);
    if (!s) return;
    setSupplierName(s.name);
    setSupplierContact([s.contactPerson, s.phone].filter(Boolean).join(' · '));
    setSupplierAddress([s.address, s.city].filter(Boolean).join(', '));
  };

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      api.post('/finance/purchase-orders', {
        supplierId: supplierId || undefined,
        supplierName,
        supplierContact: supplierContact || undefined,
        supplierAddress: supplierAddress || undefined,
        orderDate,
        expectedDelivery: expectedDelivery || null,
        items: items.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          description: l.description || undefined,
        })),
        notes: notes || undefined,
        terms: terms || undefined,
        submit,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      navigate('/finance/purchase-orders');
    },
    onError: (e) => setError(errText(e)),
  });

  const submit = (andSubmit: boolean) => {
    if (!supplierName.trim()) return setError('Supplier name is required');
    if (!orderDate) return setError('Order date is required');
    if (items.some((l) => !l.itemId)) return setError('Select an item for every row');
    if (items.some((l) => !(Number(l.quantity) > 0))) return setError('Quantity must be greater than zero');
    if (items.some((l) => Number(l.unitPrice) < 0)) return setError('Unit price cannot be negative');
    setError('');
    save.mutate(andSubmit);
  };

  const patch = (key: number, p: Partial<Line>) =>
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <nav className="flex items-center gap-2 text-sm text-gray-600" aria-label="Breadcrumb">
        <Link to="/finance/purchase-orders" className="inline-flex items-center gap-1.5 font-medium text-gray-800 hover:underline">
          <Home className="h-3.5 w-3.5" />
          Purchase Orders
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>Create Purchase Order</span>
      </nav>

      <div className={`overflow-hidden ${ui.card}`}>
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
          <h1 className="text-lg font-semibold text-gray-900">Create New Purchase Order</h1>
          <p className="text-sm text-gray-600">PO Number: {next.data?.poNo ?? '…'}</p>
        </div>

        <div className="space-y-6 p-5">
          <section className="space-y-4">
            <h2 className={ui.section}>Supplier Information</h2>
            <div className="flex items-start justify-between gap-4">
              <div className="w-full md:w-1/2 md:pr-2">
                <label className={ui.label}>Select Existing Supplier</label>
                <select className={ui.input} value={supplierId} onChange={(e) => pickSupplier(e.target.value)}>
                  <option value="">Select Supplier</option>
                  {(suppliers.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <Link to="/finance/suppliers/new" className="inline-flex items-center gap-1 whitespace-nowrap pt-1 text-sm text-blue-600 hover:underline">
                <Plus className="h-3.5 w-3.5" />
                Add New Supplier
              </Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={ui.label}>Supplier Name *</label>
                <input
                  className={ui.input}
                  value={supplierName}
                  onChange={(e) => {
                    setSupplierName(e.target.value);
                    setSupplierId(''); // typing a different name means a different supplier
                  }}
                />
              </div>
              <div>
                <label className={ui.label}>Supplier Contact</label>
                <input className={ui.input} placeholder="Contact person & phone" value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={ui.label}>Supplier Address</label>
              <textarea className={ui.input} rows={3} value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} />
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-5">
            <h2 className={ui.section}>Order Details</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className={ui.label}>Order Date *</label>
                <input type="date" className={ui.input} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div>
                <label className={ui.label}>Expected Delivery Date</label>
                <input type="date" className={ui.input} value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
              </div>
              <div>
                <label className={ui.label}>Status</label>
                <input className={ui.readonly} readOnly value="Draft" />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between">
              <h2 className={ui.section}>Order Items</h2>
              <button type="button" className={ui.btnBlue} onClick={() => setItems((r) => [...r, newLine()])}>
                <Plus className="h-4 w-4" />
                Add Item
              </button>
            </div>

            {items.map((l, index) => (
              <div key={l.key} className="rounded-lg border border-gray-200 p-4">
                <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
                  <div>
                    <label className={ui.label}>Item *</label>
                    <select className={ui.input} value={l.itemId} onChange={(e) => patch(l.key, { itemId: e.target.value })}>
                      <option value="">Select Item</option>
                      {(itemOptions.data ?? []).map((i) => (
                        <option key={i.id} value={i.id}>{i.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={ui.label}>Quantity *</label>
                    <input type="number" min="0" step="any" className={ui.input} value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} />
                  </div>
                  <div>
                    <label className={ui.label}>Unit Price (₦) *</label>
                    <input type="number" min="0" step="0.01" className={ui.input} value={l.unitPrice} onChange={(e) => patch(l.key, { unitPrice: e.target.value })} />
                  </div>
                  <div>
                    <label className={ui.label}>Total (₦)</label>
                    <input className={ui.readonly} readOnly value={naira(lineTotal(l))} />
                  </div>
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <div className="w-full md:w-1/2">
                    <label className={ui.label}>Description</label>
                    <input className={ui.input} placeholder="Item description or specifications..." value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} />
                  </div>
                  {index > 0 && (
                    <button
                      type="button"
                      aria-label="Remove item"
                      className="rounded-md bg-red-600 px-3 py-2 text-white hover:bg-red-700"
                      onClick={() => setItems((r) => r.filter((x) => x.key !== l.key))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="grid grid-cols-3 gap-4 rounded-lg bg-gray-50 p-4">
              <div>
                <div className="text-sm text-gray-700">Subtotal</div>
                <div className="text-lg font-bold text-gray-900">{naira(subtotal)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-700">VAT ({(vatRate * 100).toFixed(1)}%)</div>
                <div className="text-lg font-bold text-gray-900">{naira(vat)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-700">Total</div>
                <div className="text-xl font-bold text-blue-700">{naira(total)}</div>
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-5">
            <h2 className={ui.section}>Additional Information</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={ui.label}>Notes</label>
                <textarea className={ui.input} rows={3} placeholder="Any special instructions or notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div>
                <label className={ui.label}>Terms &amp; Conditions</label>
                <textarea className={ui.input} rows={3} placeholder="Payment terms, delivery terms, etc..." value={terms} onChange={(e) => setTerms(e.target.value)} />
              </div>
            </div>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button type="button" className={ui.btnGrey} onClick={() => navigate('/finance/purchase-orders')}>
            Cancel
          </button>
          <div className="flex gap-3">
            <button type="button" className={ui.btnDark} disabled={save.isPending} onClick={() => submit(false)}>
              Save as Draft
            </button>
            <button type="button" className={ui.btnBlue} disabled={save.isPending} onClick={() => submit(true)}>
              Submit for Approval
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}