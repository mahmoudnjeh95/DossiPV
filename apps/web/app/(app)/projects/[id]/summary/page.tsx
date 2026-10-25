import { badgeVariants } from '@/components/ui/badge';
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
import { buttonVariants } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';

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
      <p className="mb-2 text-[0.9rem] [&_a]:no-underline">
        <Link href="/projects">Projets</Link> › <Link href={`/projects/${project.id}`}>{fullName}</Link> › Récapitulatif
      </p>
      <h1>Récapitulatif avant génération — {fullName}</h1>
      {!isDraft && generateReason === null && (
        <p>
          <a className={buttonVariants()} href="#generation">
            Tout est prêt : aller à la génération du dossier final
          </a>
        </p>
      )}

      {pending && (
        <Alert variant="danger" role="alert">
          <p style={{ margin: '0 0 8px' }}>{LOCATIONS_PENDING_MESSAGE}</p>
          <Link className={buttonVariants()} href={locationsHref}>
            {project.flowStep === 'PROPOSALS' ? "Choisir l'installation" : 'Placer les points'}
          </Link>
        </Alert>
      )}

      <Card as="section">
        <h2>L&apos;installation</h2>
        {!engineInput.ok ? (
          <ul className="m-0 grid list-none gap-1.5 p-0 [&>li]:flex [&>li]:items-baseline [&>li]:gap-2.5 [&>li]:text-[0.95rem]">
            {engineInput.missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 [&_dt]:text-app-muted [&_dd]:m-0">
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
      </Card>

      <Card as="section">
        <h2>Câbles</h2>
        {project.cableRuns.length === 0 ? (
          <p className="text-app-muted">Aucune liaison définie.</p>
        ) : (
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 [&_dt]:text-app-muted [&_dd]:m-0">
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
      </Card>

      <Card as="section">
        <h2>
          Pièces STEG — {donePieces}/{pieces.length}
        </h2>
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 [&>li]:flex [&>li]:items-start [&>li]:gap-3 [&>li]:rounded-ui [&>li]:border [&>li]:border-app-border [&>li]:bg-app-surface [&>li]:px-3 [&>li]:py-2.5 [&_.grow]:min-w-0">
          {pieces.map((piece) => (
            <li key={piece.key}>
              <span className="grow">
                {/* The mark sits right next to the label it speaks about, with the status spelled out. */}
                <span className={badgeVariants({ variant: piece.done ? 'ok' : 'danger' })} aria-hidden="true">
                  {piece.done ? '✓' : '✗'}
                </span>{' '}
                {piece.label}
                <span className={piece.done ? 'text-app-muted' : badgeVariants({ variant: 'danger' })} style={{ marginLeft: 8 }}>
                  {piece.done ? 'fourni' : 'manquant'}
                </span>
                {piece.detail && (
                  <>
                    <br />
                    <span className="text-[0.8rem] font-normal text-app-muted">{piece.detail}</span>
                  </>
                )}
                {isUploadableStegPiece(piece.key) && (
                  <PieceUploadForm projectId={project.id} piece={piece.key} label={piece.label} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section">
        <h2>
          Contrôles électriques : {passedChecks}/{checks.length} OK
        </h2>
        {engineError && <Alert variant="danger">{engineError}</Alert>}
        <Link href={`/projects/${project.id}`}>Voir le détail des contrôles</Link>
      </Card>

      <Card as="section" id="generation">
        <h2>Génération</h2>
        {!isDraft && generateReason === null && (
          <Alert variant="ok" role="status">
            Tout est complet : vous pouvez générer le dossier final.
          </Alert>
        )}
        {quota && (
          <p className="text-app-muted">
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
          label={isDraft ? 'Générer un brouillon (pièces manquantes)' : 'Générer le dossier final'}
        />
      </Card>
    </main>
  );
}
