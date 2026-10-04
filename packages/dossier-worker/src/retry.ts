const RETRYABLE_PATTERNS = [/fetch failed/i, /ECONNRESET/i, /ETIMEDOUT/i, /\b5\d\d\b/];

export function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_PATTERNS.some((pattern) => pattern.test(message));
}

export interface RetryOptions {
  maxAttempts?: number;
  delaysMs?: number[];
  /**
   * Overrides which errors are retried (default: transient network/5xx errors). A caller can
   * widen it — e.g. the page-37 call also retries a layout that failed validation (spec §5).
   */
  isRetryable?: (error: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const delaysMs = options?.delaysMs ?? [1000, 2000];
  const isRetryable = options?.isRetryable ?? isRetryableError;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxAttempts) {
        throw error;
      }
      const delay = delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1] ?? 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
