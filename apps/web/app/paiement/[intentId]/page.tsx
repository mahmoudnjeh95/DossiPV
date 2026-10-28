import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../(app)/layout';
import { INTENT_DISPLAY_LABELS, intentDisplayStatus, loadP2pSettings, offeredProviders, payerRefusal, paymentReference, PAYMENT_METHOD_LABELS, PROOF_RETENTION_DAYS } from '../../../lib/payments/p2p';
import { chatSnapshot, markReadByCompany } from '../../../lib/payments/chat';
import { cancelIntentAction } from '../actions';
import { PayerChat } from './payer-chat';
import { DeclareForm } from './declare-form';
import { CopyRow } from './copy-row';
import { Stepper } from './stepper';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NO_INDEX } from '../../../lib/site';

// Behind a login or a one-time token: never in search results.
export const metadata: Metadata = { robots: NO_INDEX };

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
  const amount = Number(intent.amountTnd);
  const step = status === 'CONFIRMED' ? 4 : status === 'WAITING' ? 3 : status === 'TO_DECLARE' ? 1 : null;
  const badge = status === 'CONFIRMED' ? 'ok' : status === 'REJECTED' ? 'danger' : status === 'CANCELLED' ? 'default' : 'warn';

  return (
    <main className="mx-auto max-w-[760px]">
      <p>
        <Link href={backHref}>← Abonnement et paiement</Link>
      </p>
      <h1>Paiement {PAYMENT_METHOD_LABELS[intent.provider]}</h1>

      <Card as="section" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[0.9rem] text-app-muted">
              {label}, {intent.months} mois
            </div>
            <div className="text-[2rem] leading-tight font-bold tabular-nums">{money(amount)}</div>
          </div>
          <Badge variant={badge}>{INTENT_DISPLAY_LABELS[status]}</Badge>
        </div>
        {step && <Stepper current={step} />}
        {intent.status === 'FAILED' && intent.failureReason && (
          <Alert variant="danger" role="alert">
            Paiement refusé : {intent.failureReason}. Vous pouvez faire un nouveau paiement depuis la page <Link href={backHref}>Abonnement et paiement</Link>.
          </Alert>
        )}
        {intent.status === 'PAID' && (
          <Alert variant="ok" role="status">
            Paiement confirmé : votre abonnement est à jour.
          </Alert>
        )}
        {open && intent.declaredAt && (
          <Alert variant="warn" role="status">
            Capture reçue le {intent.declaredAt.toLocaleDateString('fr-FR')} (numéro ou référence : {intent.providerReference}). SolarixPro la vérifie, puis prolonge votre abonnement.
            Vous pouvez envoyer une nouvelle capture tant que le paiement n’est pas validé.
          </Alert>
        )}
      </Card>

      {open && (
        <>
          <Card as="section" className="flex flex-col gap-3">
            <h2 className="m-0">1. Envoyez le montant</h2>
            {provider ? (
              <>
                <p className="m-0 text-[0.9rem] text-app-muted">Ouvrez votre application {provider.label} et faites un transfert d’argent avec ces informations.</p>
                <CopyRow
                  title={`Numéro ${provider.label} de SolarixPro`}
                  shown={provider.number}
                  value={provider.number.replace(/\s+/g, '')}
                  copyLabel={`le numéro ${provider.label}`}
                  hint={settings.accountHolder ? `Au nom de ${settings.accountHolder}` : undefined}
                />
                <CopyRow title="Montant exact" shown={money(amount)} value={amount.toFixed(2)} copyLabel="le montant" />
                <CopyRow title="Référence à écrire dans le commentaire" shown={reference} value={reference} copyLabel="la référence" hint="Elle permet à SolarixPro de retrouver votre paiement." />
                {settings.instructions && (
                  <p className="m-0 text-[0.8rem] font-normal text-app-muted" style={{ whiteSpace: 'pre-line' }}>
                    {settings.instructions}
                  </p>
                )}
              </>
            ) : (
              <Alert variant="warn" role="status">
                Paiement indisponible : contactez SolarixPro.
              </Alert>
            )}
          </Card>

          <Card as="section" className="flex flex-col gap-3">
            <h2 className="m-0">2. Déclarez votre paiement</h2>
            <p className="m-0 text-[0.9rem] text-app-muted">Une fois le transfert fait, envoyez la capture d’écran de la confirmation de votre application.</p>
            {canPay ? (
              <DeclareForm intentId={intent.id} reference={reference} />
            ) : (
              <p className="m-0 text-[0.8rem] font-normal text-app-muted">Seul le responsable du compte peut déclarer le paiement.</p>
            )}
            <p className="m-0 text-[0.8rem] font-normal text-app-muted">La capture est conservée {PROOF_RETENTION_DAYS} jours puis supprimée automatiquement.</p>
            {intent.proofMime && (
              <p className="m-0">
                <a href={`/paiement/${intent.id}/capture`} target="_blank" rel="noreferrer">
                  Voir ma capture
                </a>
              </p>
            )}
          </Card>
        </>
      )}

      <PayerChat
        intentId={intent.id}
        initial={chat}
        canWrite={canPay}
        readOnlyHint={user.impersonatedBySuperAdminId ? 'Mode support : lecture seule.' : 'Seul le responsable du compte peut écrire.'}
      />

      {open && canPay && (
        <form action={cancelIntentAction.bind(null, intent.id)}>
          <Button variant="secondary" type="submit">
            Annuler ce paiement
          </Button>
        </form>
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
