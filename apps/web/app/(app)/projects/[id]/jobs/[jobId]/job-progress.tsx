'use client';

import { badgeVariants } from '@/components/ui/badge';
import { useEffect, useState } from 'react';
import { requestNotificationPermission, useJobProgress, useNow, type LiveJobView } from '../../../../../../components/job-watcher';
import { derivePipelineSteps, isJobActive, jobProgressPercent, type JobProgressView } from '../../../../../../lib/dossier-jobs';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STEP_BADGE: Record<string, { className: string; text: string }> = {
  done: { className: badgeVariants({ variant: 'ok' }), text: 'OK' },
  running: { className: badgeVariants({ variant: 'warn' }), text: 'En cours' },
  failed: { className: badgeVariants({ variant: 'danger' }), text: 'Échec' },
  pending: { className: badgeVariants(), text: 'À venir' },
};

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
}

/** The view's server-measured durations, moved on by the time since it arrived. */
function extrapolate(view: LiveJobView, now: number | null): { elapsedMs: number; stepElapsedMs: number | null } {
  const extra = view.receivedAt !== null && now !== null ? Math.max(0, now - view.receivedAt) : 0;
  return {
    elapsedMs: view.elapsedMs + extra,
    stepElapsedMs: view.stepElapsedMs === null ? null : view.stepElapsedMs + extra,
  };
}

type PermissionState = NotificationPermission | 'unsupported';

function useNotificationPermission(): [PermissionState | null, () => void] {
  const [permission, setPermission] = useState<PermissionState | null>(null);
  useEffect(() => {
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);
  const ask = (): void => {
    void requestNotificationPermission().then((answer) => {
      if (answer) setPermission(answer);
    });
  };
  return [permission, ask];
}

/** The live progress bar of a queued or running generation, in place of a "refresh the page" note. */
export function JobProgressBanner({ initial }: { initial: JobProgressView }): React.JSX.Element {
  const view = useJobProgress(initial);
  const now = useNow(1000, isJobActive(view.status));
  const [permission, askPermission] = useNotificationPermission();
  const { elapsedMs, stepElapsedMs } = extrapolate(view, now);
  const percent = Math.round(jobProgressPercent(view, stepElapsedMs));
  const currentStep = derivePipelineSteps(view).find((step) => step.state === 'running');

  let title: string;
  let detail: string;
  if (view.status === 'PENDING') {
    title = 'En attente de traitement';
    detail = 'La génération démarrera automatiquement.';
  } else if (view.status === 'RUNNING') {
    title = `Génération en cours — ${percent} %`;
    detail = `${currentStep ? `${currentStep.label} · ` : ''}écoulé : ${formatElapsed(elapsedMs)}`;
  } else if (view.status === 'SUCCEEDED') {
    title = 'Dossier généré';
    detail = 'Chargement des fichiers…';
  } else {
    title = 'Génération interrompue';
    detail = 'Chargement du détail…';
  }

  return (
    <Alert variant="info" className="grid gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <strong>{title}</strong>
        <span className="text-app-muted">{detail}</span>
      </div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-app-accent/15"
        role="progressbar"
        aria-label="Avancement de la génération"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.status === 'PENDING' ? undefined : percent}
        aria-valuetext={view.status === 'PENDING' ? 'En attente' : `${percent} %`}
      >
        <div
          className={cn(
            'h-full rounded-[inherit] bg-app-accent transition-[width] duration-900 ease-linear',
            view.status === 'PENDING' && 'w-[30%] animate-[progress-waiting_1.6s_ease-in-out_infinite] motion-reduce:animate-none',
            view.status === 'FAILED' && 'bg-app-danger',
          )}
          style={view.status === 'PENDING' ? undefined : { width: `${percent}%` }}
        />
      </div>
      {isJobActive(view.status) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[0.9rem]">
          <span className="text-app-muted">
            Vous pouvez quitter cette page et continuer à travailler : vous serez prévenu à la fin.
            {permission === 'granted' && " Une notification du navigateur s'affichera aussi si l'onglet est en arrière-plan."}
          </span>
          {permission === 'default' && (
            <Button variant="secondary" size="sm" type="button"  onClick={askPermission}>
              Activer les notifications du navigateur
            </Button>
          )}
        </div>
      )}
    </Alert>
  );
}

/** The pipeline steps of the job, kept current while it runs. */
export function JobStepList({ initial }: { initial: JobProgressView }): React.JSX.Element {
  const view = useJobProgress(initial);
  return (
    <ul className="m-0 grid list-none gap-2 p-0 [&>li]:flex [&>li]:items-center [&>li]:gap-3 [&>li]:rounded-ui [&>li]:border [&>li]:border-app-border [&>li]:bg-app-surface [&>li]:px-3 [&>li]:py-2.5">
      {derivePipelineSteps(view).map((step) => {
        const badge = STEP_BADGE[step.state]!;
        return (
          <li key={step.key}>
            <span className={badge.className}>{badge.text}</span>
            <span className="grow">{step.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
