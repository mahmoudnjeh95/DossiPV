import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import type { StegBillReading } from '@dossipv/bill-reader';
import { requireAuthenticatedCompanyUser } from '../../../layout';
import { PROJECT_ENGINE_INCLUDE } from '../../../../../lib/project-engine-input';
import { computeProjectProposals } from '../../../../../lib/project-proposals';
import { ProposalCard } from './proposal-card';
import { CorrectionsForm } from './corrections-form';

const fr = (value: number, decimals = 0): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimals }).format(value);

export default async function ProposalsPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  const user = await requireAuthenticatedCompanyUser();
  const project = await db.project.findFirst({
    where: { id, companyId: user.companyId },
    include: PROJECT_ENGINE_INCLUDE,
  });
  if (!project) notFound();

  const computed = await computeProjectProposals(project, new Date());
  const client = project.client;
  const billImport = project.billImport;
  const reading = (billImport?.reading ?? null) as StegBillReading | null;
  const billWarnings = Array.isArray(billImport?.warnings) ? (billImport.warnings as string[]) : [];
  const warnings = [...billWarnings, ...(computed.ok && computed.yieldWarning ? [computed.yieldWarning] : [])];

  const missing = computed.ok ? [] : computed.missing;
  const missingLibraryKinds = computed.ok ? [] : computed.missingLibraryKinds;
  const blockedReasons = computed.ok ? [] : computed.blockedReasons;
  const proposals = computed.ok ? computed.result.proposals : [];

  const months = reading?.monthsBilled ?? null;
  const consumedKWh = reading?.totalElectricityKWh ?? null;

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> › <Link href={`/projects/${id}`}>{client?.fullName ?? 'Projet'}</Link> › Propositions
      </p>
      <h1>Propositions pour {client?.fullName ?? 'ce client'}</h1>

      <section className="card">
        <h2>Lu sur la facture</h2>
        <dl className="dl">
          <dt>Référence STEG</dt>
          <dd>{client?.stegReference ?? 'Non lue'}</dd>
          <dt>Puissance souscrite</dt>
          <dd>{client?.subscribedPowerKVA != null ? `${fr(client.subscribedPowerKVA, 1)} kVA` : 'Non lue'}</dd>
          <dt>Consommation</dt>
          <dd>
            {client?.annualConsumptionKWh != null
              ? consumedKWh !== null && months !== null
                ? `${fr(consumedKWh)} kWh sur ${months} mois → environ ${fr(client.annualConsumptionKWh)} kWh/an (estimation)`
                : `environ ${fr(client.annualConsumptionKWh)} kWh/an`
              : 'Non lue'}
          </dd>
          {billImport?.averagePriceTNDPerKWh != null && (
            <>
              <dt>Prix moyen</dt>
              <dd>{fr(billImport.averagePriceTNDPerKWh, 3)} DT/kWh</dd>
            </>
          )}
        </dl>
        {warnings.length > 0 && (
          <div className="banner banner-warn">
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
        {client && (
          <details open={missing.length > 0}>
            <summary>Corriger les données lues</summary>
            {missing.length > 0 && (
              <p className="muted">À renseigner pour obtenir des propositions : {missing.join(', ')}.</p>
            )}
            <CorrectionsForm
              projectId={id}
              defaults={{
                fullName: client.fullName,
                stegReference: client.stegReference,
                subscribedPowerKVA: client.subscribedPowerKVA,
                annualConsumptionKWh: client.annualConsumptionKWh,
              }}
            />
          </details>
        )}
      </section>

      {blockedReasons.length > 0 && (
        <div className="banner banner-warn">
          <ul>
            {blockedReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <Link className="button" href={`/projects/${id}/sections/site`}>
            Modifier le site
          </Link>
        </div>
      )}

      {missingLibraryKinds.length > 0 && (
        <section className="card">
          <p>Votre bibliothèque ne contient pas encore :</p>
          <ul>
            {missingLibraryKinds.map((kind) => (
              <li key={kind}>{kind}</li>
            ))}
          </ul>
          <Link className="button" href="/library?tab=catalogue">
            Compléter ma bibliothèque
          </Link>
        </section>
      )}

      {computed.ok && proposals.length > 0 && (
        <div className="card-grid" style={{ alignItems: 'start' }}>
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.key} projectId={id} proposal={proposal} />
          ))}
        </div>
      )}

      {computed.ok && proposals.length === 0 && (
        <section className="card">
          <h2>Aucune installation possible</h2>
          <ul>
            {computed.result.noSolutionReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <Link className="button" href={`/projects/${id}`}>
            Ouvrir le projet
          </Link>
        </section>
      )}
    </main>
  );
}
