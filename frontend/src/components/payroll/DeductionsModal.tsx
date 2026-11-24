import { X } from 'lucide-react';
import { naira, RateInfo, SlipView, ui } from '@/lib/payrollUi';

interface Line {
  label: string;
  sub: string;
  amount: number;
}

/**
 * "Deductions Breakdown". variant "other" is the short list opened from the preview;
 * "all" is the full list opened from a payroll's detail page (PAYE and pension first).
 */
export default function DeductionsModal({
  row, variant, rates, onClose,
}: {
  row: SlipView;
  variant: 'other' | 'all';
  rates: RateInfo;
  onClose: () => void;
}) {
  // Only NHF and the one-time deduction come from your payroll rules today.
  // The other lines are shown at zero, as in the original, because nothing records them yet.
  const lines: Line[] = [
    { label: 'NHF (National Housing Fund)', sub: `${rates.nhfPct ?? 2.5}% of basic salary`, amount: row.nhf },
    { label: 'NSITF (Nigeria Social Insurance Trust Fund)', sub: 'Employer contribution, not deducted from staff', amount: 0 },
    { label: 'Union Dues', sub: 'Trade union membership fee', amount: 0 },
    { label: 'NHIS (National Health Insurance Scheme)', sub: 'Health insurance contribution', amount: 0 },
    { label: 'Staff Loan Repayment', sub: 'Monthly loan deduction', amount: 0 },
    { label: 'Salary Advance', sub: 'Advance payment recovery', amount: 0 },
  ];
  if (row.otherDeductions > 0) {
    lines.push({ label: 'One-time deduction', sub: row.deductionNote || 'Added when the payroll was prepared', amount: row.otherDeductions });
  }

  const item = (l: Line) => (
    <div key={l.label} className="flex items-start justify-between gap-4 border-b border-gray-100 py-3">
      <div>
        <div className="font-semibold text-gray-900">{l.label}</div>
        <div className="text-xs text-gray-500">{l.sub}</div>
      </div>
      <div className="whitespace-nowrap font-semibold text-red-600">{naira(l.amount)}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-12" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Deductions breakdown for ${row.name}`}
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Deductions Breakdown - {row.name}</h3>
          <button type="button" aria-label="Close" className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {variant === 'all' && (
            <>
              <div className="mb-4 rounded-md bg-gray-50 p-4">
                <div className="font-semibold text-gray-900">{row.name}</div>
                <div className="text-sm text-gray-600">{row.department}</div>
              </div>
              <div className="mb-1 border-b border-gray-200 pb-2 font-semibold text-gray-800">All Deductions</div>
              {item({ label: 'PAYE Tax', sub: 'Income tax (shown in Tax column)', amount: row.paye })}
              {item({ label: 'Pension (Employee)', sub: `${rates.employeePensionPct ?? 8}% of pensionable pay (shown in Pension column)`, amount: row.pensionEmployee })}
              {item({ label: 'Comp Excess Deduction', sub: 'Excess complimentary usage (shown in Comp Excess column)', amount: row.compExcess })}
              <div className="mb-1 mt-4 border-b border-gray-200 pb-2 font-semibold text-gray-800">Other Deductions (Combined Column)</div>
            </>
          )}

          {lines.map(item)}

          <div className="flex items-center justify-between py-3">
            <div className="font-bold text-gray-900">Total Other Deductions</div>
            <div className="font-bold text-red-600">{naira(row.otherTotal)}</div>
          </div>

          <div className="rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <b>Note:</b> These deductions are statutory and mandatory contributions as required by Nigerian law.
          </div>
        </div>

        {variant === 'all' && (
          <div className="flex justify-end border-t border-gray-100 px-5 py-3">
            <button type="button" className={ui.btnGrey} onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}