import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import type { StegBillReading } from '@dossipv/bill-reader';
import { requireAuthenticatedCompanyUser } from '../../../layout';
import { PROJECT_ENGINE_INCLUDE } from '../../../../../lib/project-engine-input';
import { computeProjectProposals } from '../../../../../lib/project-proposals';
import { ProposalCard } from './proposal-card';
import { CorrectionsForm } from './corrections-form';
import { IdentityForm } from './identity-form';
import { clientIdentityNeeds } from '../../../../../lib/client-identity';

const fr = (value: number, decimals = 0): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimals }).format(value);

const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? value[0] : value) || null;

export default async function ProposalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const query = await searchParams;
  const selection = { moduleId: first(query.module), inverterId: first(query.inverter) };
  const user = await requireAuthenticatedCompanyUser();
  const project = await db.project.findFirst({
    where: { id, companyId: user.companyId },
    include: PROJECT_ENGINE_INCLUDE,
  });
  if (!project) notFound();

  const computed = await computeProjectProposals(project, new Date(), selection);
  const client = project.client;
  const billImport = project.billImport;
  const reading = (billImport?.reading ?? null) as StegBillReading | null;
  const billWarnings = Array.isArray(billImport?.warnings) ? (billImport.warnings as string[]) : [];
  const warnings = [...billWarnings, ...(computed.ok && computed.yieldWarning ? [computed.yieldWarning] : [])];

  const missing = computed.ok ? [] : computed.missing;
  const missingLibraryKinds = computed.ok ? [] : computed.missingLibraryKinds;
  const blockedReasons = computed.ok ? [] : computed.blockedReasons;
  const proposals = computed.ok ? computed.result.proposals : [];

  const identityNeeds = client
    ? clientIdentityNeeds({ fullName: client.fullName, reading })
    : null;

  const months = reading?.monthsBilled ?? null;
  const consumedKWh = reading?.totalElectricityKWh ?? null;

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> › <Link href={`/projects/${id}`}>{client?.fullName ?? 'Projet'}</Link> › Propositions
      </p>
      <h1>Propositions pour {client?.fullName ?? 'ce client'}</h1>

      {identityNeeds && identityNeeds.name && (
        <section className="card">
          <h2>Identité du titulaire</h2>
          <IdentityForm projectId={id} needs={identityNeeds} />
        </section>
      )}

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

      {computed.ok && (
        <section className="card">
          <h2>Matériel</h2>
          <p className="muted">Choisissez la marque des panneaux ou de l'onduleur : les propositions sont recalculées avec ce matériel.</p>
          <form method="get" className="actions" style={{ alignItems: 'end' }}>
            <label>
              Panneaux
              <select name="module" defaultValue={selection.moduleId ?? ''}>
                <option value="">Automatique</option>
                {computed.choices.modules.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Onduleur
              <select name="inverter" defaultValue={selection.inverterId ?? ''}>
                <option value="">Automatique</option>
                {computed.choices.inverters.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Recalculer</button>
          </form>
        </section>
      )}

      {computed.ok && proposals.length > 0 && (
        <div className="card-grid" style={{ alignItems: 'start' }}>
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.key} projectId={id} proposal={proposal} selection={selection} choices={computed.choices} />
          ))}
        </div>
      )}

      {computed.ok && proposals.length > 0 && (
        <p className="muted">
          Production estimée à partir de la position approximative ; le dossier utilisera la simulation PVGIS au point exact du champ PV.
        </p>
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
