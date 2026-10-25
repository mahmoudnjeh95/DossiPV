import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { INTENT_DISPLAY_LABELS, intentDisplayStatus, PAYMENT_METHOD_LABELS, paymentReference } from '../../../../../lib/payments/p2p';
import { chatSnapshot, markReadByAdmin } from '../../../../../lib/payments/chat';
import { approvePaymentAction } from '../actions';
import { AdminChat } from './admin-chat';
import { RejectForm } from '../reject-form';
import { Button } from '@/components/ui/button';

/** One declared payment: its screenshot and the two decisions. */
export default async function AdminPaymentDetailPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;
  // proofImage is not selected: the page shows the screenshot through the capture route.
  const intent = await db.paymentIntent.findUnique({
    where: { id },
    select: {
      id: true,
      purpose: true,
      planId: true,
      months: true,
      amountTnd: true,
      provider: true,
      status: true,
      providerReference: true,
      failureReason: true,
      declaredAt: true,
      paidAt: true,
      proofMime: true,
      proofExpiresAt: true,
      company: { select: { id: true, name: true, kind: true } },
    },
  });
  if (!intent) notFound();
  const chat = await chatSnapshot(intent);
  await markReadByAdmin(intent.id);
  const plan = intent.planId ? await db.plan.findUnique({ where: { id: intent.planId }, select: { name: true } }) : null;
  const status = intentDisplayStatus(intent);
  const decidable = intent.status === 'PENDING' && intent.declaredAt !== null;
  const companyHref = intent.company.kind === 'SUPPLIER' ? `/admin/fournisseurs/${intent.company.id}` : `/admin/installers/${intent.company.id}`;

  return (
    <main>
      <p>
        <Link href="/admin/paiements">← Paiements</Link>
      </p>
      <h1>Paiement {paymentReference(intent.id)}</h1>
      <dl className="dl">
        <dt>Société</dt>
        <dd>
          <Link href={companyHref}>{intent.company.name}</Link>
        </dd>
        <dt>Achat</dt>
        <dd>
          {intent.purpose === 'OPTION_3D' ? 'Option 3D' : `Abonnement ${plan?.name ?? ''}`.trim()}, {intent.months} mois
        </dd>
        <dt>Montant</dt>
        <dd>{intent.amountTnd.toString()} TND</dd>
        <dt>Moyen</dt>
        <dd>{PAYMENT_METHOD_LABELS[intent.provider]}</dd>
        <dt>Numéro / référence saisi</dt>
        <dd>{intent.providerReference ?? '—'}</dd>
        <dt>Déclaré le</dt>
        <dd>{intent.declaredAt?.toLocaleString('fr-FR') ?? '—'}</dd>
        <dt>Statut</dt>
        <dd>
          {INTENT_DISPLAY_LABELS[status]}
          {intent.failureReason ? ` : ${intent.failureReason}` : ''}
        </dd>
      </dl>

      <AdminChat intentId={intent.id} initial={chat} />

      <section>
        <h2>Capture du transfert</h2>
        {intent.proofMime ? (
          <img src={`/admin/paiements/${intent.id}/capture`} alt="Capture d’écran du transfert" style={{ maxWidth: '100%', maxHeight: 700 }} />
        ) : (
          <p className="text-app-muted">Aucune capture : supprimée après 30 jours, ou pas encore envoyée.</p>
        )}
        <p className="text-[0.8rem] font-normal text-app-muted">Capture supprimée après 30 jours.</p>
      </section>

      {decidable && (
        <section>
          <h2>Décision</h2>
          <p className="text-[0.8rem] font-normal text-app-muted">Vérifiez sur la capture le montant, le numéro de destination et la référence {paymentReference(intent.id)}.</p>
          <form action={approvePaymentAction.bind(null, intent.id)}>
            <Button type="submit">Confirmer le paiement</Button>
          </form>
          <RejectForm intentId={intent.id} />
        </section>
      )}
    </main>
  );
}
