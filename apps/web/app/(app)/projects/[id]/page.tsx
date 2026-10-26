import { badgeVariants } from '@/components/ui/badge';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { runEngine, type EngineResult } from '@dossipv/engine';
import { requireAuthenticatedCompanyUser } from '../../layout';
import { PROJECT_ENGINE_INCLUDE, buildEngineInput } from '../../../../lib/project-engine-input';
import { computeSectionStatuses } from '../../../../lib/project-sections';
import { loadEffectiveSubscription } from '../../../../lib/sponsorship';
import { summarizeSubscription, checkQuota, quotaJobs, quotaWindowStart } from '../../../../lib/subscription';
import { PROJECT_STATUS_LABELS, TIER_LABELS, JOB_STATUS_LABELS } from '../../../../lib/labels';
import { SubscriptionBanner } from '../../../../components/subscription-banner';
import { FlashBanner } from '../../../../components/flash-banner';
import { Jargon } from '../../../../components/jargon';
import { ChecksPanel } from '../../../../components/checks-panel';
import { locationsPending } from '../../../../lib/steg-completeness';
import { projectHref } from '../../../../lib/project-list';
import { ProjectRowActions } from '../project-row-actions';
import { Projects } from '@dossipv/icons';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';

const DERIVED_LABELS: { key: string; label: string; unit: string; decimals: number }[] = [
  { key: 'P_DC_W', label: 'Puissance DC', unit: 'W', decimals: 0 },
  { key: 'MODULE_COUNT', label: 'Nombre de modules', unit: '', decimals: 0 },
  { key: 'POWER_RATIO', label: 'Ratio DC/AC', unit: '', decimals: 2 },
  { key: 'STRING_VOC_TMIN', label: 'Voc chaîne à Tmin', unit: 'V', decimals: 1 },
  { key: 'STRING_VMP_STC', label: 'Vmp chaîne STC', unit: 'V', decimals: 1 },
  { key: 'ISC_FIELD_DESIGN', label: 'Courant de champ (dim.)', unit: 'A', decimals: 2 },
  { key: 'NS_MIN', label: 'Ns min', unit: '', decimals: 0 },
  { key: 'NS_MAX', label: 'Ns max', unit: '', decimals: 0 },
  { key: 'NP_MAX', label: 'Np max', unit: '', decimals: 0 },
  { key: 'DU_DC_PCT', label: 'Chute de tension DC', unit: '%', decimals: 2 },
  { key: 'DU_AC_PCT', label: 'Chute de tension AC', unit: '%', decimals: 2 },
  { key: 'DC_RUN_IZ_CORRECTED', label: 'Iz corrigé câble DC', unit: 'A', decimals: 1 },
  { key: 'AC_RUN_IZ_CORRECTED', label: 'Iz corrigé câble AC', unit: 'A', decimals: 1 },
  { key: 'F_WEIGHT_N', label: 'Poids total', unit: 'N', decimals: 0 },
  { key: 'STABILITY_LHS', label: 'Stabilité (moment stabilisant)', unit: '', decimals: 0 },
  { key: 'STABILITY_RHS', label: 'Stabilité (moment renversant)', unit: '', decimals: 0 },
];

function formatNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requireAuthenticatedCompanyUser();
  const now = new Date();

  const project = await db.project.findFirst({
    where: { id, companyId: user.companyId },
    include: PROJECT_ENGINE_INCLUDE,
  });
  if (!project) {
    notFound();
  }

  const subscriptionRow = await loadEffectiveSubscription(user.companyId);
  const subscription = summarizeSubscription(subscriptionRow, now);
  const jobsInWindow = await quotaJobs(user.companyId, subscription, now);
  const quota = subscription
    ? checkQuota(jobsInWindow, subscription.monthlyDossierLimit, project.id, now, quotaWindowStart(subscription, now))
    : null;

  const sections = computeSectionStatuses(project);
  const engineInput = buildEngineInput(project, now);

  let engineResult: EngineResult | null = null;
  let engineError: string | null = null;
  if (engineInput.ok) {
    try {
      engineResult = runEngine(engineInput.input);
    } catch (error) {
      engineError = error instanceof Error ? error.message : 'Erreur de calcul.';
    }
  }

  const activeJob = project.jobs.find(
    (job) => job.status === 'PENDING' || job.status === 'RUNNING',
  );
  let generateReason: string | null = null;
  if (locationsPending(project.flowStep)) {
    generateReason = 'Placez les points avant de générer.';
  } else if (!project.company.profileComplete) {
    generateReason = 'Complétez le profil de votre société dans Paramètres.';
  } else if (!subscription || !subscription.canGenerate) {
    generateReason = 'Abonnement inactif.';
  } else if (quota?.blocked) {
    generateReason = subscription?.isTrial
      ? `Essai gratuit terminé (${quota.limit} dossiers utilisés).`
      : `Quota mensuel atteint (${quota.used}/${quota.limit}).`;
  } else if (activeJob) {
    generateReason = 'Génération en cours.';
  } else if (!engineInput.ok) {
    generateReason = 'Complétez toutes les sections.';
  } else if (engineError) {
    generateReason = 'Corrigez les données signalées.';
  } else if (engineResult?.hasBlockingFailure) {
    generateReason = 'Corrigez les contrôles bloquants.';
  }

  const clientName = project.client?.fullName ?? 'Sans client';

  return (
    <main>
      <p className="mb-2 text-[0.9rem] [&_a]:no-underline">
        <Link href="/projects">Projets</Link> › {clientName}
      </p>
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Projects size="md" color="gold" />
          {clientName}
        </h1>
        <Badge>{PROJECT_STATUS_LABELS[project.status] ?? project.status}</Badge>
        <Badge>{TIER_LABELS[project.tier] ?? project.tier}</Badge>
        {project.dossierNumber && <Badge>Dossier n° {project.dossierNumber}</Badge>}
        <span className="text-app-muted">Révision {project.revision}</span>
      </div>

      {project.archivedAt && (
        <Alert variant="info" className="flex flex-wrap items-center gap-3">
          <span className="grow">Projet archivé le {project.archivedAt.toLocaleDateString('fr-FR')} : il n&apos;apparaît plus dans la liste des projets en cours.</span>
          <ProjectRowActions projectId={project.id} clientName={clientName} archived deletable={false} />
        </Alert>
      )}
      {(project.flowStep === 'PROPOSALS' || project.flowStep === 'LOCATIONS') && (
        <Alert variant="ok" className="flex flex-wrap items-center gap-3">
          <span className="grow">
            {project.flowStep === 'PROPOSALS'
              ? "Les propositions d'installation calculées à partir de la facture vous attendent : choisissez-en une et les sections techniques se remplissent automatiquement."
              : "L'installation est choisie : placez le champ PV, l'onduleur et le compteur sur la carte."}
          </span>
          <Link className={buttonVariants()} href={projectHref(project)}>
            {project.flowStep === 'PROPOSALS' ? 'Voir les propositions' : 'Continuer : placer les points'}
          </Link>
        </Alert>
      )}
      {saved && <FlashBanner param="saved">Section enregistrée.</FlashBanner>}
      <SubscriptionBanner subscription={subscription} trialUsed={quota?.used ?? 0} />

      <div className="card-grid" style={{ alignItems: 'start' }}>
        <Card as="section">
          <h2>Sections du dossier</h2>
          <ul className="m-0 grid list-none gap-2 p-0 [&>li]:flex [&>li]:items-center [&>li]:gap-3 [&>li]:rounded-ui [&>li]:border [&>li]:border-app-border [&>li]:bg-app-surface [&>li]:px-3 [&>li]:py-2.5">
            {sections.map((section) => (
              <li key={section.key}>
                <span className={badgeVariants({ variant: section.complete ? 'ok' : 'default' })}>
                  {section.complete ? 'OK' : 'À faire'}
                </span>
                <span className="grow">
                  <Link href={section.href}>{section.label}</Link>
                  {section.summary && <span className="text-app-muted"> · {section.summary}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card as="section">
          <h2>Validation</h2>
          {!engineInput.ok && project.flowStep === 'PROPOSALS' ? (
            <p className="text-app-muted">
              Les contrôles s&apos;exécuteront une fois l&apos;installation choisie parmi les{' '}
              <Link href={projectHref(project)}>propositions</Link>.
            </p>
          ) : !engineInput.ok ? (
            <>
              <p className="text-app-muted">
                Les contrôles s&apos;exécuteront dès que les sections suivantes seront complètes :
              </p>
              <ul className="m-0 grid list-none gap-1.5 p-0 [&>li]:flex [&>li]:items-baseline [&>li]:gap-2.5 [&>li]:text-[0.95rem]">
                {engineInput.missing.map((line) => (
                  <li key={line}>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : engineError ? (
            <Alert variant="danger">{engineError}</Alert>
          ) : engineResult ? (
            <ChecksPanel checks={engineResult.checks} projectId={project.id} derived={engineResult.derived} />
          ) : null}
        </Card>
      </div>

      {engineResult && (
        <Card as="section">
          <h2>Valeurs calculées</h2>
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 [&_dt]:text-app-muted [&_dd]:m-0">
            {DERIVED_LABELS.map((item) => {
              const value = engineResult.derived[item.key];
              if (value === undefined) {
                return null;
              }
              return (
                <div key={item.key} style={{ display: 'contents' }}>
                  <dt><Jargon text={item.label} /></dt>
                  <dd>
                    {formatNumber(value, item.decimals)}
                    {item.unit ? ` ${item.unit}` : ''}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      )}

      <Card as="section">
        <h2>Génération</h2>
        {quota && (
          <p className="text-app-muted">
            Dossiers utilisés ce mois : {quota.used} / {quota.limit}
            {quota.blocked
              ? ''
              : project.jobs.some((j) => j.status !== 'FAILED')
                ? ' (ce projet a déjà sa place)'
                : ''}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Link className={buttonVariants()} href={`/projects/${project.id}/summary`}>
            Récapitulatif et génération
          </Link>
          {generateReason && <span className="text-app-muted">{generateReason}</span>}
        </div>

        {project.jobs.length > 0 && (
          <div className="overflow-x-auto" style={{ marginTop: 12 }}>
            <Table>
              <thead>
                <tr>
                  <th>Lancée le</th>
                  <th>Statut</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {project.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link href={`/projects/${project.id}/jobs/${job.id}`}>
                        {job.startedAt.toLocaleString('fr-FR')}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={badgeVariants({ variant: job.status === 'SUCCEEDED' ? 'ok' : job.status === 'FAILED' ? 'danger' : 'default' })}
                      >
                        {JOB_STATUS_LABELS[job.status] ?? job.status}
                      </span>
                    </td>
                    <td>
                      {job.status === 'FAILED' && job.failedStep
                        ? `Étape « ${job.failedStep} » : ${job.failureReason ?? 'erreur'}`
                        : ''}
                      {job.status === 'SUCCEEDED' && job.completedAt
                        ? `Terminé le ${job.completedAt.toLocaleString('fr-FR')}`
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </main>
  );
}
