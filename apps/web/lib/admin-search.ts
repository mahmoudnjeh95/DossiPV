/** Reads the `q` search query param: trimmed, one value, capped, null when empty. */
export function readSearchQuery(raw: string | string[] | undefined): string | null {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100);
  return value ? value : null;
}

/** Prisma filter for the admin company lists: the query is looked for in the name, email, phone and contact. */
export function companySearchWhere(query: string | null): { OR: Record<string, { contains: string; mode: 'insensitive' }>[] } | Record<string, never> {
  if (query === null) {
    return {};
  }
  const contains = { contains: query, mode: 'insensitive' as const };
  return { OR: [{ name: contains }, { email: contains }, { phone: contains }, { legalRepFullName: contains }] };
}

export const EXPIRING_WINDOW_DAYS = 30;

/** Prisma filter: an active subscription whose end falls within the next 30 days (the dashboard's "expirant" count and list filter). */
export function expiringSubscriptionWhere(now: Date): { subscription: { is: { status: 'ACTIVE'; periodEnd: { gte: Date; lte: Date } } } } {
  const limit = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { subscription: { is: { status: 'ACTIVE', periodEnd: { gte: now, lte: limit } } } };
}
