interface FailureRecord {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private readonly failures = new Map<string, FailureRecord>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  recordFailure(key: string): void {
    const now = Date.now();
    const existing = this.failures.get(key);
    if (existing && now - existing.windowStart < this.windowMs) {
      existing.count += 1;
    } else {
      this.failures.set(key, { count: 1, windowStart: now });
    }
  }

  isLocked(key: string): boolean {
    const existing = this.failures.get(key);
    if (!existing) return false;
    if (Date.now() - existing.windowStart >= this.windowMs) return false;
    return existing.count >= this.maxAttempts;
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}
