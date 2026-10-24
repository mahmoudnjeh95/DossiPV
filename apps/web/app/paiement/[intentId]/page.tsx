import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../(app)/layout';
import { INTENT_DISPLAY_LABELS, intentDisplayStatus, loadP2pSettings, offeredProviders, payerRefusal, paymentReference, PAYMENT_METHOD_LABELS, PROOF_RETENTION_DAYS } from '../../../lib/payments/p2p';
import { chatSnapshot, markReadByCompany } from '../../../lib/payments/chat';
import { cancelIntentAction } from '../actions';
import { PayerChat } from './payer-chat';
import { DeclareForm } from './declare-form';
import { CopyButton } from '../../../components/copy-button';

const money = (value: number): string => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;

/** The payment page: what to send, where, with which reference, and the form declaring the transfer. */
export default async function PaymentPage({ params }: { params: Promise<{ intentId: string }> }): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const { intentId } = await params;
  // The screenshot is never selected here: only the capture route reads it.
  const intent = await db.paymentIntent.findFirst({
    where: { id: intentId, companyId: user.companyId },
    select: { id: true, purpose: true, months: true, amountTnd: true, provider: true, status: true, declaredAt: true, providerReference: true, failureReason: true, proofMime: true, planId: true, paidAt: true },
  });
  if (!intent) notFound();
  // Messages are read first, then marked read: the admin's new ones are still shown as new once.
  const chat = await chatSnapshot(intent);
  if (!user.impersonatedBySuperAdminId) await markReadByCompany(intent.id);
  const [company, settings, plan] = await Promise.all([
    db.company.findUnique({ where: { id: user.companyId }, select: { kind: true } }),
    loadP2pSettings(),
    intent.planId ? db.plan.findUnique({ where: { id: intent.planId }, select: { name: true } }) : null,
  ]);
  const backHref = company?.kind === 'SUPPLIER' ? '/fournisseur/facturation' : '/facturation';
  const status = intentDisplayStatus(intent);
  const provider = offeredProviders(settings).find((p) => p.id === intent.provider);
  const reference = paymentReference(intent.id);
  const canPay = payerRefusal(user) === null;
  const open = intent.status === 'PENDING';
  const label = intent.purpose === 'OPTION_3D' ? 'Option 3D' : `Abonnement ${plan?.name ?? ''}`.trim();

  return (
    <main>
      <p>
        <Link href={backHref}>← Abonnement et paiement</Link>
      </p>
      <h1>Paiement {PAYMENT_METHOD_LABELS[intent.provider]}</h1>

      <section className="card">
        <dl className="dl">
          <dt>Achat</dt>
          <dd>
            {label}, {intent.months} mois
          </dd>
          <dt>Montant</dt>
          <dd>
            <strong>{money(Number(intent.amountTnd))}</strong>
          </dd>
          <dt>Statut</dt>
          <dd>{INTENT_DISPLAY_LABELS[status]}</dd>
        </dl>
        {intent.status === 'FAILED' && intent.failureReason && (
          <p className="banner banner-danger" role="alert">
            Paiement refusé : {intent.failureReason}. Vous pouvez faire un nouveau paiement depuis la page <Link href={backHref}>Abonnement et paiement</Link>.
          </p>
        )}
        {intent.status === 'PAID' && (
          <p className="banner banner-ok" role="status">
            Paiement confirmé : votre abonnement est à jour.
          </p>
        )}
      </section>

      <PayerChat
        intentId={intent.id}
        initial={chat}
        canWrite={canPay}
        readOnlyHint={user.impersonatedBySuperAdminId ? 'Mode support : lecture seule.' : 'Seul le responsable du compte peut écrire.'}
      />

      {open && (
        <>
          <section className="card">
            <h2>1. Envoyez le montant</h2>
            {provider ? (
              <>
                <p>
                  Depuis votre application {provider.label}, envoyez <strong>{money(Number(intent.amountTnd))}</strong>
                  <CopyButton value={Number(intent.amountTnd).toFixed(2)} label="le montant" /> au numéro{' '}
                  <strong>{provider.number}</strong>
                  <CopyButton value={provider.number.replace(/s+/g, '')} label={`le numéro ${provider.label}`} />
                  {settings.accountHolder ? ` (${settings.accountHolder})` : ''}.
                </p>
                <p>
                  Écrivez cette référence dans le commentaire du transfert : <strong>{reference}</strong>
                  <CopyButton value={reference} label="la référence" />
                </p>
                {settings.instructions && <p className="hint" style={{ whiteSpace: 'pre-line' }}>{settings.instructions}</p>}
              </>
            ) : (
              <p className="banner banner-warn" role="status">
                Paiement indisponible : contactez SolarixPro.
              </p>
            )}
          </section>

          <section className="card">
            <h2>2. Déclarez votre paiement</h2>
            {intent.declaredAt && (
              <p className="banner banner-warn" role="status">
                En attente de validation par SolarixPro. Déclaré le {intent.declaredAt.toLocaleDateString('fr-FR')} (numéro ou référence : {intent.providerReference}).
                Vous pouvez envoyer une nouvelle capture tant que le paiement n’est pas validé.
              </p>
            )}
            {canPay ? (
              <DeclareForm intentId={intent.id} />
            ) : (
              <p className="hint">Seul le responsable du compte peut déclarer le paiement.</p>
            )}
            <p className="hint">La capture est conservée {PROOF_RETENTION_DAYS} jours puis supprimée automatiquement.</p>
            {intent.proofMime && (
              <p>
                <a href={`/paiement/${intent.id}/capture`} target="_blank" rel="noreferrer">
                  Voir ma capture
                </a>
              </p>
            )}
          </section>

          {canPay && (
            <form action={cancelIntentAction.bind(null, intent.id)}>
              <button type="submit" className="secondary">
                Annuler ce paiement
              </button>
            </form>
          )}
        </>
      )}
      {!open && intent.proofMime && (
        <p>
          <a href={`/paiement/${intent.id}/capture`} target="_blank" rel="noreferrer">
            Voir ma capture
          </a>
        </p>
      )}
    </main>
  );
}
