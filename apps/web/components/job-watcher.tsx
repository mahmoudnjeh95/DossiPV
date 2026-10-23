'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isJobActive, type JobProgressView } from '../lib/dossier-jobs';

const POLL_INTERVAL_MS = 3000;
/** After a failed poll (network down, server restarting), the next one waits longer. */
const RETRY_INTERVAL_MS = 15000;

/** A job's view and the browser time it arrived; null for the server-rendered one, not extrapolated. */
export type LiveJobView = JobProgressView & { receivedAt: number | null };

interface JobWatcher {
  jobs: Record<string, LiveJobView>;
  watch: (view: JobProgressView) => () => void;
}

interface JobToast {
  id: string;
  projectId: string;
  clientName: string;
  succeeded: boolean;
}

const JobWatcherContext = createContext<JobWatcher | null>(null);

function jobPath(job: { id: string; projectId: string }): string {
  return `/projects/${job.projectId}/jobs/${job.id}`;
}

/** Asks for the browser's notification permission once; call it from a click. */
export function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') {
    return Promise.resolve(null);
  }
  try {
    // Older Safari answers through a callback and returns undefined.
    return Promise.resolve(Notification.requestPermission()).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/** The system notification for a finished job, shown by only one of the app's open tabs. */
function notifySystem(job: JobProgressView, succeeded: boolean, open: () => void): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }
  try {
    const key = `dossipv:job-notified:${job.id}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    // No storage (private window): another open tab may announce it too.
  }
  try {
    const notification = new Notification(succeeded ? 'Dossier prêt' : 'Échec de la génération', {
      body: succeeded
        ? `Le dossier de ${job.clientName} est prêt à télécharger.`
        : `La génération du dossier de ${job.clientName} a échoué.`,
      tag: `dossier-job-${job.id}`,
    });
    notification.onclick = () => {
      window.focus();
      open();
      notification.close();
    };
  } catch {
    // Some mobile browsers only notify through a service worker: the in-app toast still shows.
  }
}

/**
 * Follows the company's queued and running generations from any page of the app: polls
 * /api/dossier-jobs while one is active, feeds the job pages' progress bars, and announces the
 * end of each generation with a toast (and a system notification when the tab is in the
 * background). Rendered once by the app shell.
 */
export function JobWatcherProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [jobs, setJobs] = useState<Record<string, LiveJobView>>({});
  const [toasts, setToasts] = useState<JobToast[]>([]);
  const jobsRef = useRef(jobs);
  const watchedRef = useRef(new Map<string, number>());
  const pathnameRef = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pollAgainRef = useRef(false);
  const lastPollRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    pathnameRef.current = pathname;
    setToasts((current) => current.filter((toast) => jobPath(toast) !== pathname));
  }, [pathname]);

  const commit = useCallback((next: Record<string, LiveJobView>) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);

  const onStatusChange = useCallback(
    (previous: JobProgressView, job: JobProgressView) => {
      const path = pathnameRef.current;
      const projectPath = `/projects/${job.projectId}`;
      const onJobPage = path === jobPath(job);
      // The pages that show this job's status are server-rendered: redraw them.
      if (onJobPage || path === projectPath || path === `${projectPath}/summary`) {
        router.refresh();
      }
      if (!isJobActive(previous.status) || isJobActive(job.status) || job.cancelled) {
        return;
      }
      const succeeded = job.status === 'SUCCEEDED';
      if (!onJobPage) {
        setToasts((current) => [
          ...current.filter((toast) => toast.id !== job.id),
          { id: job.id, projectId: job.projectId, clientName: job.clientName, succeeded },
        ]);
      }
      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        notifySystem(job, succeeded, () => router.push(jobPath(job)));
      }
    },
    [router],
  );

  const poll = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) {
      pollAgainRef.current = true;
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    inFlightRef.current = true;
    lastPollRef.current = Date.now();
    let delay: number | null = null;
    try {
      const ids = new Set(watchedRef.current.keys());
      for (const job of Object.values(jobsRef.current)) {
        if (isJobActive(job.status)) ids.add(job.id);
      }
      const response = await fetch(`/api/dossier-jobs?ids=${encodeURIComponent([...ids].join(','))}`, { cache: 'no-store' });
      if (response.status === 401) {
        return; // signed out: the next navigation goes to the login page
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const { jobs: views } = (await response.json()) as { jobs: JobProgressView[] };
      const receivedAt = Date.now();
      const previous = jobsRef.current;
      const next: Record<string, LiveJobView> = {};
      const changes: [JobProgressView, JobProgressView][] = [];
      for (const view of views) {
        const before = previous[view.id];
        // A page refreshed after this poll left may already hold a later view.
        if (before && before.asOf > view.asOf) {
          next[view.id] = before;
          continue;
        }
        next[view.id] = { ...view, receivedAt };
        if (before && before.status !== view.status) changes.push([before, view]);
      }
      commit(next);
      for (const [before, view] of changes) onStatusChange(before, view);
      delay = Object.values(next).some((job) => isJobActive(job.status)) ? POLL_INTERVAL_MS : null;
    } catch {
      delay = Object.values(jobsRef.current).some((job) => isJobActive(job.status)) ? RETRY_INTERVAL_MS : null;
    } finally {
      inFlightRef.current = false;
    }
    if (!mountedRef.current) {
      return;
    }
    if (pollAgainRef.current) {
      pollAgainRef.current = false;
      void poll();
    } else if (delay !== null) {
      timerRef.current = setTimeout(() => void poll(), delay);
    }
  }, [commit, onStatusChange]);

  const watch = useCallback(
    (view: JobProgressView) => {
      const watched = watchedRef.current;
      watched.set(view.id, (watched.get(view.id) ?? 0) + 1);
      const known = jobsRef.current[view.id];
      if (!known || known.asOf < view.asOf) {
        commit({ ...jobsRef.current, [view.id]: { ...view, receivedAt: Date.now() } });
      }
      if (isJobActive(view.status) && !timerRef.current && !inFlightRef.current) {
        timerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
      return () => {
        const count = (watched.get(view.id) ?? 1) - 1;
        if (count > 0) watched.set(view.id, count);
        else watched.delete(view.id);
      };
    },
    [commit, poll],
  );

  useEffect(() => {
    mountedRef.current = true;
    void poll();
    // A generation started from another tab is picked up when the installer comes back here.
    const onReturn = (): void => {
      if (document.visibilityState === 'visible' && Date.now() - lastPollRef.current > 1000) void poll();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [poll]);

  const dismiss = (id: string): void => setToasts((current) => current.filter((toast) => toast.id !== id));
  const value = useMemo(() => ({ jobs, watch }), [jobs, watch]);

  return (
    <JobWatcherContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.succeeded ? 'toast-ok' : 'toast-danger'}`}>
            <div className="grow">
              <strong>{toast.succeeded ? 'Dossier prêt' : 'Échec de la génération'}</strong>
              <p>{toast.clientName}</p>
              <Link href={jobPath(toast)} onClick={() => dismiss(toast.id)}>
                {toast.succeeded ? 'Ouvrir le dossier' : 'Voir le détail'}
              </Link>
            </div>
            <button type="button" className="toast-close" aria-label="Fermer" onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </JobWatcherContext.Provider>
  );
}

/**
 * One job's live state, starting from the server-rendered view: the page keeps its own copy
 * until the watcher holds a later one.
 */
export function useJobProgress(initial: JobProgressView): LiveJobView {
  const watcher = useContext(JobWatcherContext);
  const watch = watcher?.watch;
  useEffect(() => watch?.(initial), [watch, initial]);
  const live = watcher?.jobs[initial.id];
  return live && live.asOf >= initial.asOf ? live : { ...initial, receivedAt: null };
}

/** Date.now(), refreshed every `intervalMs` while `running`; null until mounted (no hydration drift). */
export function useNow(intervalMs: number, running: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, running]);
  return now;
}
