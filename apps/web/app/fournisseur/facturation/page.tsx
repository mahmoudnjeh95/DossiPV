import { BillingPageView } from '../../../components/billing/billing-view';
import { loadBilling } from '../../../lib/payments/billing';
import { requireSupplier } from '../../../lib/supplier-access';

export default async function SupplierBillingPage(): Promise<React.JSX.Element> {
  const { user, supplierId } = await requireSupplier();
  const billing = await loadBilling(supplierId);
  return <BillingPageView billing={billing} canPay={user.role === 'OWNER' && !user.impersonatedBySuperAdminId} />;
}
