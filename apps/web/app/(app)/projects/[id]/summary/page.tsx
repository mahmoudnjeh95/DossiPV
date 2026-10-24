import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { formatRunLengthFormula, groundDistanceM, runEngine, type EngineResult, type GpsPoint } from '@dossipv/engine';
import { requireAuthenticatedCompanyUser } from '../../../layout';
import {
  PROJECT_ENGINE_INCLUDE,
  buildEngineInput,
  describeAcBreakerFunction,
  type ProjectForEngine,
} from '../../../../../lib/project-engine-input';
import { unsourcedEquipment } from '../../../../../lib/project-access';
import { loadEffectiveSubscription } from '../../../../../lib/sponsorship';
import { summarizeSubscription, checkQuota, quotaJobs, quotaWindowStart, projectsCountedThisMonth } from '../../../../../lib/subscription';
import {
  LOCATIONS_PENDING_MESSAGE,
  isUploadableStegPiece,
  locationsPending,
  stegCompleteness,
} from '../../../../../lib/steg-completeness';
import { GenerateButton } from '../generate-button';
import { PieceUploadForm } from './piece-upload-form';

const kwpFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

function point(lat: number | null | undefined, lon: number | null | undefined): GpsPoint | null {
  return lat != null && lon != null ? { lat, lon } : null;
}

/** One line per cable run: how its length was obtained from the map, or that it was typed in. */
function cableLines(project: ProjectForEngine): { key: string; label: string; text: string }[] {
  const site = project.site;
  const field = point(site?.installationPointLat, site?.installationPointLon);
  const room = point(site?.technicalRoomPointLat, site?.technicalRoomPointLon);
  const meter = point(site?.meterPointLat, site?.meterPointLon);
  return project.cableRuns.map((run) => {
    const kind = run.circuitType === 'AC' ? 'AC' : 'DC';
    const [from, to] = kind === 'DC' ? [field, room] : [room, meter];
    const formula = from && to ? formatRunLengthFormula(groundDistanceM(from, to), run.lengthM, site?.floors ?? null, kind) : null;
    const length = formula ?? `${decimalFormat.format(run.lengthM)} m (longueur saisie par l'installateur)`;
    return {
      key: run.id,
      label: `Câble ${kind}`,
      text: `${run.label} : ${length} — ${decimalFormat.format(run.sectionMm2)} mm²`,
    };
  });
}

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  const user = await requireAuthenticatedCompanyUser();
  const now = new Date();

  const project = await db.project.findFirst({
    where: { id, companyId: user.companyId },
    include: PROJECT_ENGINE_INCLUDE,
  });
  if (!project) {
    notFound();
  }

  const [subscriptionRow, anmeListCount] = await Promise.all([
    loadEffectiveSubscription(user.companyId),
    db.catalogSourceDocument.count({ where: { kind: 'ANME_PANEL_LIST' } }),
  ]);
  const subscription = summarizeSubscription(subscriptionRow, now);
  const jobsInWindow = await quotaJobs(user.companyId, subscription, now);
  const windowStart = quotaWindowStart(subscription, now);
  const quota = subscription ? checkQuota(jobsInWindow, subscription.monthlyDossierLimit, project.id, now, windowStart) : null;
  const hasPlace = projectsCountedThisMonth(jobsInWindow, now, windowStart).has(project.id);

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

  const { pieces, missingLabels } = stegCompleteness(project, project.dossierDate ?? now, anmeListCount > 0);
  const donePieces = pieces.filter((piece) => piece.done).length;
  const pending = locationsPending(project.flowStep);
  const isDraft = missingLabels.length > 0;

  const activeJob = project.jobs.find((job) => job.status === 'PENDING' || job.status === 'RUNNING');
  const unsourced = unsourcedEquipment(project);
  let generateReason: string | null = null;
  if (pending) {
    generateReason = 'Placez les points avant de générer.';
  } else if (!project.company.profileComplete) {
    generateReason = 'Complétez le profil de votre société dans Paramètres.';
  } else if (!project.company.anmeCertificateFileId) {
    generateReason = "Ajoutez l'attestation d'agrément ANME dans Paramètres.";
  } else if (unsourced.length > 0) {
    generateReason = `Équipement sans fiche technique : ${unsourced.join(', ')}. Remplacez-le avant de générer.`;
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

  const fullName = project.client?.fullName ?? 'Projet';
  const locationsHref = `/projects/${project.id}/${project.flowStep === 'PROPOSALS' ? 'proposals' : 'locations'}`;
  const module = project.arrayConfig?.module;
  const inverters = project.arrayConfig?.inverters ?? [];
  const breaker = project.protections?.acBreaker;
  const moduleCount = engineResult?.derived['MODULE_COUNT'];
  const dcPowerW = engineResult?.derived['P_DC_W'];
  const annualKWh = project.simulation?.annualProductionKWh ?? null;
  const checks = engineResult?.checks ?? [];
  const passedChecks = checks.filter((check) => check.pass).length;

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> › <Link href={`/projects/${project.id}`}>{fullName}</Link> › Récapitulatif
      </p>
      <h1>Récapitulatif avant génération — {fullName}</h1>

      {pending && (
        <div className="banner banner-danger" role="alert">
          <p style={{ margin: '0 0 8px' }}>{LOCATIONS_PENDING_MESSAGE}</p>
          <Link className="button" href={locationsHref}>
            {project.flowStep === 'PROPOSALS' ? "Choisir l'installation" : 'Placer les points'}
          </Link>
        </div>
      )}

      <section className="card">
        <h2>L&apos;installation</h2>
        {!engineInput.ok ? (
          <ul className="check-list">
            {engineInput.missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <dl className="dl">
            <dt>Puissance crête</dt>
            <dd>{dcPowerW !== undefined ? `${kwpFormat.format(dcPowerW / 1000)} kWc` : '—'}</dd>
            <dt>Panneaux</dt>
            <dd>
              {module
                ? `${moduleCount !== undefined ? `${integerFormat.format(moduleCount)} × ` : ''}${module.brand} ${module.model} (${integerFormat.format(module.pmaxW)} Wc)`
                : '—'}
            </dd>
            <dt>Onduleur</dt>
            <dd>
              {inverters.length > 0
                ? inverters
                    .map(({ inverter }) => `${inverter.brand} ${inverter.model} (${decimalFormat.format(inverter.pacW / 1000)} kW)`)
                    .join(', ')
                : '—'}
            </dd>
            <dt>{breaker?.residualCurrentMA != null ? 'Disjoncteur différentiel' : 'Disjoncteur AC'}</dt>
            <dd>{breaker ? `${breaker.brand} ${breaker.model} — ${describeAcBreakerFunction(breaker)}` : '—'}</dd>
            <dt>Production estimée</dt>
            <dd>
              {annualKWh !== null
                ? `${integerFormat.format(annualKWh)} kWh/an (recalculée par PVGIS au point exact à la génération)`
                : 'Calculée par PVGIS au point exact à la génération'}
            </dd>
          </dl>
        )}
      </section>

      <section className="card">
        <h2>Câbles</h2>
        {project.cableRuns.length === 0 ? (
          <p className="muted">Aucune liaison définie.</p>
        ) : (
          <dl className="dl">
            {cableLines(project).map((line) => (
              <div key={line.key} style={{ display: 'contents' }}>
                <dt>{line.label}</dt>
                <dd>{line.text}</dd>
              </div>
            ))}
          </dl>
        )}
        {project.site && (
          <p style={{ margin: '12px 0 0' }}>
            <Link href={`/projects/${project.id}/locations`}>Modifier les points</Link>
            {' · '}
            <Link href={`/projects/${project.id}/locations/photo`}>
              {project.site.siteImagePoints ? "Modifier la photo de l'annexe 3D" : "Ajouter la photo Google Maps (annexe 3D)"}
            </Link>
          </p>
        )}
      </section>

      <section className="card">
        <h2>
          Pièces STEG — {donePieces}/{pieces.length}
        </h2>
        <ul className="section-list piece-list">
          {pieces.map((piece) => (
            <li key={piece.key}>
              <span className={`badge ${piece.done ? 'badge-ok' : 'badge-danger'}`}>{piece.done ? '✓' : 'manquant'}</span>
              <span className="grow">
                {piece.label}
                {piece.detail && (
                  <>
                    <br />
                    <span className="hint">{piece.detail}</span>
                  </>
                )}
                {isUploadableStegPiece(piece.key) && (
                  <PieceUploadForm projectId={project.id} piece={piece.key} label={piece.label} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>
          Contrôles électriques : {passedChecks}/{checks.length} OK
        </h2>
        {engineError && <div className="banner banner-danger">{engineError}</div>}
        <Link href={`/projects/${project.id}`}>Voir le détail des contrôles</Link>
      </section>

      <section className="card">
        <h2>Génération</h2>
        {quota && (
          <p className="muted">
            {hasPlace
              ? subscription?.isTrial
                ? 'Ce projet a déjà sa place dans votre essai.'
                : 'Ce projet a déjà sa place ce mois-ci.'
              : `Ce dossier utilisera 1 des ${Math.max(0, quota.limit - quota.used)} dossiers restants ${subscription?.isTrial ? 'de votre essai' : 'ce mois'}.`}
          </p>
        )}
        {isDraft && <p>Le PDF portera la mention « BROUILLON – NON RECEVABLE ».</p>}
        <GenerateButton
          projectId={project.id}
          disabled={generateReason !== null}
          reason={generateReason}
          label={isDraft ? 'Générer un brouillon (pièces manquantes)' : 'Générer le dossier'}
        />
      </section>
    </main>
  );
}
