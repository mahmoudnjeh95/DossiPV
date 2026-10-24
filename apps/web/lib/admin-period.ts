/** Rules for the subscription end dates an admin types, shared by every admin form that takes one. */

const PAST_ERROR = 'Fin de période : la date ne peut pas être dans le passé.';

/**
 * Reads a `<input type="date">` value as a subscription end. Returns a French error when the value
 * is empty, not a date, or before today (today itself is accepted, the date input has no time).
 */
export function parseFuturePeriodEnd(raw: string, now: Date): { date: Date } | { error: string } {
  const value = raw.trim();
  if (value.length === 0) {
    return { error: 'Fin de période : date requise.' };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: 'Fin de période : date invalide.' };
  }
  const today = now.toISOString().slice(0, 10);
  if (date.toISOString().slice(0, 10) < today) {
    return { error: PAST_ERROR };
  }
  return { date };
}

/** The status an admin should read: an ACTIVE row whose end has passed is shown as expired. */
export function displayedSubscriptionStatus(status: string, periodEnd: Date, now: Date): string {
  return status === 'ACTIVE' && periodEnd.getTime() < now.getTime() ? 'EXPIRED' : status;
}

/** `https://…?access_token=pk.abc123xyz` becomes `https://…?access_token=••••3xyz`: the token is never displayed in full. */
export function maskAccessToken(url: string): string {
  return url.replace(/([?&]access_token=)([^&]*)/, (_match, prefix: string, token: string) =>
    token.length === 0 ? `${prefix}(non configuré)` : `${prefix}••••${token.slice(-4)}`,
  );
}
