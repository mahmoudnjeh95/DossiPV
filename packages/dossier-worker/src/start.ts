// Explicit entry point for the poll loop. run-worker.ts also self-starts when executed directly,
// but that path-vs-URL guard is fragile across runners (tsx, containers); this always starts.
import { main } from './run-worker';

main().catch((error) => {
  console.error('Dossier worker crashed:', error);
  process.exit(1);
});
