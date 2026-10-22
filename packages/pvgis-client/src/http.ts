import { PvgisFetchError } from './types';

/** Wait before the single retry of a 429 / 5xx when PVGIS sends no usable Retry-After. */
export const PVGIS_RETRY_DELAY_MS = 2_000;
/** A Retry-After longer than this is capped: the job would rather fail than hang. */
const MAX_RETRY_AFTER_MS = 10_000;

/** The French operator message for an HTTP failure of PVGIS. */
export function pvgisStatusMessage(status: number): string {
  if (status === 403) return 'PVGIS refuse la requête (HTTP 403) : le service est probablement en maintenance.';
  if (status === 429) return 'PVGIS limite le nombre de requêtes (HTTP 429) : trop de demandes, réessayez plus tard.';
  if (status >= 500) return `PVGIS a rencontré une erreur serveur (HTTP ${status}).`;
  return `PVGIS a répondu avec une erreur (HTTP ${status}).`;
}

/** 429 and 5xx are transient; a 403 is PVGIS's maintenance page and is not retried. */
function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/** Retry-After in seconds (the only form PVGIS uses), capped; otherwise the default delay. */
function retryDelay(response: Response, defaultMs: number): number {
  const header = typeof response.headers?.get === 'function' ? response.headers.get('retry-after') : null;
  const seconds = header === null ? NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : defaultMs;
}

export interface PvgisRequestOptions {
  timeoutMs: number;
  /** Retry a 429 or 5xx once after a backoff (never a 403). */
  retryTransient: boolean;
  /** Backoff before that retry; PVGIS_RETRY_DELAY_MS by default. */
  retryDelayMs?: number | undefined;
  /** Report a timeout as a PvgisFetchError (status 0) rather than the raw TimeoutError. */
  timeoutAsPvgisError: boolean;
}

/**
 * GETs a PVGIS API URL and returns the parsed JSON. An HTTP failure becomes a PvgisFetchError
 * with a French message, and so does a timeout (status 0) when `timeoutAsPvgisError`. A network
 * failure (`fetch failed`) passes through unchanged so the caller's own retry can see it.
 */
export async function fetchPvgisJson(url: string, options: PvgisRequestOptions): Promise<unknown> {
  const maxAttempts = options.retryTransient ? 2 : 1;
  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(options.timeoutMs) });
    } catch (error) {
      if (options.timeoutAsPvgisError && isTimeout(error)) {
        throw new PvgisFetchError(0, `PVGIS n'a pas répondu dans le délai de ${Math.round(options.timeoutMs / 1000)} s.`);
      }
      throw error;
    }
    if (response.ok) return response.json();
    if (attempt >= maxAttempts || !isTransientStatus(response.status)) {
      throw new PvgisFetchError(response.status, pvgisStatusMessage(response.status));
    }
    const delay = retryDelay(response, options.retryDelayMs ?? PVGIS_RETRY_DELAY_MS);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
