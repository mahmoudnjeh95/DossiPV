import { requireAuthenticatedCompanyUser } from '../layout';
import { BillingPageView } from '../../../components/billing/billing-view';
import { isAwaitingEmailConfirmation } from '../../../lib/email-confirmation';
import { loadBilling } from '../../../lib/payments/billing';

export default async function BillingPage(): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const billing = await loadBilling(user.companyId);
  const awaitingEmailConfirmation = billing.subscription === null && (await isAwaitingEmailConfirmation(user.id));
  return (
    <BillingPageView
      billing={billing}
      canPay={user.role === 'OWNER' && !user.impersonatedBySuperAdminId}
      awaitingEmailConfirmation={awaitingEmailConfirmation}
    />
  );
}
