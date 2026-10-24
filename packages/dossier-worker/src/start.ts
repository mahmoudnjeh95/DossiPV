// Explicit entry point for the poll loop. run-worker.ts also self-starts when executed directly,
// but that path-vs-URL guard is fragile across runners (tsx, containers); this always starts.
import { flushMonitoring, initMonitoring, reportError } from './monitoring';
import { main } from './run-worker';

// Before the loop starts, so errors from the first poll on are reported (no-op without SENTRY_DSN).
initMonitoring();

main().catch(async (error) => {
  console.error('Dossier worker crashed:', error);
  reportError(error, { stage: 'worker-main' });
  await flushMonitoring();
  process.exit(1);
});
