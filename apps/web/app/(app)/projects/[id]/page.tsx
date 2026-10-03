import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { runEngine, type EngineResult } from '@dossipv/engine';
import { requireAuthenticatedCompanyUser } from '../../layout';
import { PROJECT_ENGINE_INCLUDE, buildEngineInput } from '../../../../lib/project-engine-input';
import { computeSectionStatuses } from '../../../../lib/project-sections';
import { summarizeSubscription, checkQuota, monthStart } from '../../../../lib/subscription';
import { PROJECT_STATUS_LABELS, TIER_LABELS, JOB_STATUS_LABELS } from '../../../../lib/labels';
import { SubscriptionBanner } from '../../../../components/subscription-banner';
import { GenerateButton } from './generate-button';

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

function ChecksPanel({ result }: { result: EngineResult }): React.JSX.Element {
  const failing = result.checks.filter((c) => !c.pass);
  const blocking = failing.filter((c) => c.level === 'BLOCK');
  const warnings = failing.filter((c) => c.level === 'WARN');
  const passing = result.checks.filter((c) => c.pass);

  return (
    <>
      {blocking.length === 0 && warnings.length === 0 && (
        <div className="banner banner-ok">Les 22 contrôles sont satisfaits.</div>
      )}
      {blocking.length > 0 && (
        <>
          <h3 style={{ margin: '8px 0' }}>
            <span className="badge badge-danger">Bloquant</span> {blocking.length} contrôle(s) à
            corriger
          </h3>
          <ul className="check-list">
            {blocking.map((c, index) => (
              <li key={`${c.id}-${index}`}>
                <span className="check-id">{c.id}</span>
                <span>{c.message}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {warnings.length > 0 && (
        <>
          <h3 style={{ margin: '8px 0' }}>
            <span className="badge badge-warn">Avertissement</span> {warnings.length} point(s) à
            vérifier
          </h3>
          <ul className="check-list">
            {warnings.map((c, index) => (
              <li key={`${c.id}-${index}`}>
                <span className="check-id">{c.id}</span>
                <span>{c.message}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <details style={{ marginTop: 8 }}>
        <summary className="muted">{passing.length} contrôle(s) satisfait(s)</summary>
        <ul className="check-list" style={{ marginTop: 6 }}>
          {passing.map((c, index) => (
            <li key={`${c.id}-${index}`}>
              <span className="check-id">{c.id}</span>
              <span className="muted">{c.message}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
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

  const [subscriptionRow, jobsThisMonth] = await Promise.all([
    db.subscription.findUnique({ where: { companyId: user.companyId }, include: { plan: true } }),
    db.dossierJob.findMany({
      where: { project: { companyId: user.companyId }, startedAt: { gte: monthStart(now) } },
      select: { projectId: true, status: true, startedAt: true },
    }),
  ]);
  const subscription = summarizeSubscription(subscriptionRow, now);
  const quota = subscription
    ? checkQuota(jobsThisMonth, subscription.monthlyDossierLimit, project.id, now)
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
  if (!subscription || !subscription.canGenerate) {
    generateReason = 'Abonnement inactif.';
  } else if (quota?.blocked) {
    generateReason = `Quota mensuel atteint (${quota.used}/${quota.limit}).`;
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
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> › {clientName}
      </p>
      <div className="actions" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>{clientName}</h1>
        <span className="badge">{PROJECT_STATUS_LABELS[project.status] ?? project.status}</span>
        <span className="badge">{TIER_LABELS[project.tier] ?? project.tier}</span>
        {project.dossierNumber && <span className="badge">Dossier n° {project.dossierNumber}</span>}
        <span className="muted">Révision {project.revision}</span>
      </div>

      {saved && <div className="banner banner-ok">Section enregistrée.</div>}
      <SubscriptionBanner subscription={subscription} />

      <div className="card-grid" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2>Sections du dossier</h2>
          <ul className="section-list">
            {sections.map((section) => (
              <li key={section.key}>
                <span className={`badge ${section.complete ? 'badge-ok' : ''}`}>
                  {section.complete ? 'OK' : 'À faire'}
                </span>
                <span className="grow">
                  <Link href={section.href}>{section.label}</Link>
                  {section.summary && <span className="muted"> · {section.summary}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Validation</h2>
          {!engineInput.ok ? (
            <>
              <p className="muted">
                Les contrôles s&apos;exécuteront dès que les sections suivantes seront complètes :
              </p>
              <ul className="check-list">
                {engineInput.missing.map((line) => (
                  <li key={line}>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : engineError ? (
            <div className="banner banner-danger">{engineError}</div>
          ) : engineResult ? (
            <ChecksPanel result={engineResult} />
          ) : null}
        </section>
      </div>

      {engineResult && (
        <section className="card">
          <h2>Valeurs calculées</h2>
          <dl className="dl">
            {DERIVED_LABELS.map((item) => {
              const value = engineResult.derived[item.key];
              if (value === undefined) {
                return null;
              }
              return (
                <div key={item.key} style={{ display: 'contents' }}>
                  <dt>{item.label}</dt>
                  <dd>
                    {formatNumber(value, item.decimals)}
                    {item.unit ? ` ${item.unit}` : ''}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      )}

      <section className="card">
        <h2>Génération</h2>
        {quota && (
          <p className="muted">
            Dossiers utilisés ce mois : {quota.used} / {quota.limit}
            {quota.blocked
              ? ''
              : project.jobs.some((j) => j.status !== 'FAILED')
                ? ' (ce projet a déjà sa place)'
                : ''}
          </p>
        )}
        <GenerateButton
          projectId={project.id}
          disabled={generateReason !== null}
          reason={generateReason}
        />

        {project.jobs.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
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
                    <td>{job.startedAt.toLocaleString('fr-FR')}</td>
                    <td>
                      <span
                        className={`badge ${job.status === 'SUCCEEDED' ? 'badge-ok' : job.status === 'FAILED' ? 'badge-danger' : ''}`}
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
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
