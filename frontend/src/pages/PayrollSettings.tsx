import { Link } from 'react-router-dom';
import PayrollPage from '@/pages/PayrollPage';

/**
 * Your existing Payroll page, untouched apart from opening on its Settings tab.
 * Its other tabs stay available: Employees (rent, pension and NHF details that feed the tax calculation)
 * and Payroll runs (the older view, which still has the remittance buttons for PAYE, pension, NHF and NSITF/ITF).
 */
export default function PayrollSettings() {
  return (
    <div>
      <Link to="/finance/payroll" className="mb-3 inline-block text-sm text-gray-600 hover:underline">
        ← Back to Payroll
      </Link>
      <PayrollPage initialTab="settings" />
    </div>
  );
}