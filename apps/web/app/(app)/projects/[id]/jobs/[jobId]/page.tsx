import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { runEngine } from '@dossipv/engine';
import { requireAuthenticatedCompanyUser } from '../../../../layout';
import { ChecksPanel, type CheckLike } from '../../../../../../components/checks-panel';
import {
  derivePipelineSteps,
  jobWarnings,
  parseJobSnapshot,
  snapshotDraftMissing,
  summarizeSnapshot,
  CANCELLED_BY_INSTALLER_REASON,
} from '../../../../../../lib/dossier-jobs';
import { listJobFiles } from '../../../../../../lib/dossier-files';
import { JOB_STATUS_LABELS } from '../../../../../../lib/labels';
import { GenerateButton } from '../../generate-button';
import { CancelJobButton } from './cancel-button';

const STEP_BADGE: Record<string, { className: string; text: string }> = {
  done: { className: 'badge badge-ok', text: 'OK' },
  running: { className: 'badge badge-warn', text: 'En cours' },
  failed: { className: 'badge badge-danger', text: 'Échec' },
  pending: { className: 'badge', text: 'À venir' },
};

function formatDuration(start: Date, end: Date | null): string | null {
  if (!end) {
    return null;
  }
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimals }).format(value);
}

export default async function DossierJobPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}): Promise<React.JSX.Element> {
  const { id: projectId, jobId } = await params;
  const user = await requireAuthenticatedCompanyUser();

  const job = await db.dossierJob.findFirst({
    where: { id: jobId, project: { id: projectId, companyId: user.companyId } },
    include: {
      checkResults: { orderBy: { checkId: 'asc' } },
      project: {
        include: {
          client: true,
          jobs: {
            orderBy: { startedAt: 'desc' },
            select: { id: true, startedAt: true, status: true },
          },
        },
      },
    },
  });
  if (!job) {
    notFound();
  }

  const snapshot = parseJobSnapshot(job.inputSnapshot);
  const summary = snapshot ? summarizeSnapshot(snapshot) : null;
  const steps = derivePipelineSteps(job);
  const files = listJobFiles(job, projectId);
  const clientName = job.project.client?.fullName ?? 'Projet';
  const jobIndex = job.project.jobs.findIndex((j) => j.id === job.id);
  const revisionLabel =
    jobIndex === -1 ? '' : `Génération n° ${job.project.jobs.length - jobIndex}`;

  // Prefer the checks the worker stored with the job; before it runs, re-evaluate the frozen
  // engine input so the installer still sees what was validated at the moment they clicked.
  let checks: CheckLike[] = job.checkResults.map((c) => ({
    id: c.checkId,
    level: c.level,
    pass: c.pass,
    message: c.message,
  }));
  let checksSource: 'job' | 'snapshot' | null = checks.length > 0 ? 'job' : null;
  if (checks.length === 0 && snapshot) {
    try {
      checks = runEngine(snapshot.engineInput).checks;
      checksSource = 'snapshot';
    } catch {
      checks = [];
    }
  }

  const statusClass =
    job.status === 'SUCCEEDED'
      ? 'badge badge-ok'
      : job.status === 'FAILED'
        ? 'badge badge-danger'
        : 'badge badge-warn';
  const duration = formatDuration(job.startedAt, job.completedAt);
  const warnings = jobWarnings(job.warnings);
  const isCancelled = job.failureReason === CANCELLED_BY_INSTALLER_REASON;
  const draftMissing = snapshotDraftMissing(job.inputSnapshot);

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> ›{' '}
        <Link href={`/projects/${projectId}`}>{clientName}</Link> › Dossier
      </p>
      <div className="actions" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Dossier — {clientName}</h1>
        <span className={statusClass}>
          {isCancelled ? 'Annulée' : (JOB_STATUS_LABELS[job.status] ?? job.status)}
        </span>
        {revisionLabel && <span className="muted">{revisionLabel}</span>}
      </div>

      {job.status === 'PENDING' && (
        <div className="banner banner-warn">
          Génération en attente de traitement. Elle démarrera automatiquement ; vous pouvez fermer
          cette page.
        </div>
      )}
      {job.status === 'RUNNING' && (
        <div className="banner banner-warn">
          Génération en cours. Actualisez la page pour suivre l&apos;avancement.
        </div>
      )}
      {job.status === 'FAILED' && !isCancelled && (
        <div className="banner banner-danger">
          La génération a échoué{job.failedStep ? ` à l'étape « ${job.failedStep} »` : ''}
          {job.failureReason ? ` : ${job.failureReason}` : '.'} Ce dossier n&apos;a pas été décompté
          de votre quota.
        </div>
      )}
      {job.status === 'FAILED' && isCancelled && (
        <div className="banner">Génération annulée avant traitement. Aucun dossier décompté.</div>
      )}
      {job.status === 'SUCCEEDED' && (
        <div className="banner banner-ok">Dossier généré{duration ? ` en ${duration}` : ''}.</div>
      )}
      {draftMissing.length > 0 && !isCancelled && (
        <div className="banner banner-warn">
          Brouillon : le PDF {job.status === 'SUCCEEDED' ? 'porte' : 'portera'} la mention « BROUILLON – NON RECEVABLE ».
          Pièces manquantes :{' '}
          {draftMissing.join(' ; ')}.{' '}
          <Link href={`/projects/${projectId}/summary`}>Compléter les pièces</Link>
        </div>
      )}

      <div className="card-grid" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2>Déroulement</h2>
          <dl className="dl" style={{ marginBottom: 12 }}>
            <dt>Lancée le</dt>
            <dd>{job.startedAt.toLocaleString('fr-FR')}</dd>
            <dt>Terminée le</dt>
            <dd>{job.completedAt ? job.completedAt.toLocaleString('fr-FR') : '—'}</dd>
            {duration && (
              <>
                <dt>Durée</dt>
                <dd>{duration}</dd>
              </>
            )}
          </dl>
          <ul className="section-list">
            {steps.map((step) => {
              const badge = STEP_BADGE[step.state]!;
              return (
                <li key={step.key}>
                  <span className={badge.className}>{badge.text}</span>
                  <span className="grow">{step.label}</span>
                </li>
              );
            })}
          </ul>
          <div className="actions" style={{ marginTop: 12 }}>
            {job.status === 'PENDING' && <CancelJobButton projectId={projectId} jobId={job.id} />}
            {job.status === 'FAILED' && (
              <GenerateButton
                projectId={projectId}
                disabled={false}
                reason={isCancelled ? null : 'Relance après correction des données.'}
              />
            )}
          </div>
        </section>

        <section className="card">
          <h2>Fichiers du dossier</h2>
          {files.length > 0 ? (
            <ul className="section-list">
              {files.map((file) => (
                <li key={file.kind}>
                  <span className="grow">{file.label}</span>
                  <a href={file.href} className="button small">
                    Télécharger
                  </a>
                </li>
              ))}
            </ul>
          ) : job.status === 'SUCCEEDED' ? (
            <p className="muted">
              Les fichiers Word et PDF de ce dossier seront téléchargeables ici dès
              l&apos;activation du stockage des documents générés.
            </p>
          ) : (
            <p className="muted">Les fichiers apparaîtront ici une fois la génération terminée.</p>
          )}
        </section>
      </div>

      {warnings.length > 0 && (
        <section className="card">
          <h2>Avertissements</h2>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Contrôles</h2>
        {checks.length === 0 ? (
          <p className="muted">Aucun résultat de contrôle enregistré pour cette génération.</p>
        ) : (
          <>
            {checksSource === 'snapshot' && (
              <p className="hint">
                Contrôles recalculés à partir des données figées au lancement ; le résultat
                définitif sera enregistré par la génération.
              </p>
            )}
            <ChecksPanel checks={checks} />
          </>
        )}
      </section>

      <section className="card">
        <h2>Données figées au lancement</h2>
        {!summary ? (
          <p className="muted">
            Le format des données figées de cette génération n&apos;est pas reconnu par cette
            version de l&apos;application.
          </p>
        ) : (
          <>
            <p className="hint">
              Ces valeurs sont celles utilisées pour ce dossier. Une modification ultérieure du
              projet ou du catalogue ne les change pas ; relancez une génération pour produire une
              nouvelle révision.
            </p>
            <dl className="dl">
              <dt>Date du dossier</dt>
              <dd>{new Date(summary.dossierDate).toLocaleDateString('fr-FR')}</dd>
              <dt>Modules</dt>
              <dd>
                {summary.moduleCount} × {summary.moduleBrandModel} —{' '}
                {formatNumber(summary.dcPowerW)} Wc
              </dd>
              <dt>Températures</dt>
              <dd>
                Tmin {summary.tMinC} °C · Tmax {summary.tMaxC} °C ·{' '}
                {summary.phases === 3 ? 'triphasé' : 'monophasé'}
              </dd>
              {summary.inverters.map((inverter, index) => (
                <div key={index} style={{ display: 'contents' }}>
                  <dt>Onduleur {index + 1}</dt>
                  <dd>
                    {inverter.label} —{' '}
                    {inverter.mppts
                      .map((m, i) => `MPPT ${i + 1} : ${m.np} × ${m.ns} modules`)
                      .join(' · ')}
                  </dd>
                </div>
              ))}
              {summary.protections.map((row) => (
                <div key={row.label} style={{ display: 'contents' }}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
              {summary.cableRuns.map((run) => (
                <div key={run.label} style={{ display: 'contents' }}>
                  <dt>{run.label}</dt>
                  <dd>{run.detail}</dd>
                </div>
              ))}
              {summary.structure && (
                <>
                  <dt>Structure</dt>
                  <dd>{summary.structure}</dd>
                </>
              )}
              {summary.earthing && (
                <>
                  <dt>Mise à la terre</dt>
                  <dd>{summary.earthing}</dd>
                </>
              )}
            </dl>
          </>
        )}
      </section>
    </main>
  );
}
