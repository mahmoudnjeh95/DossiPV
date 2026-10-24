import { db } from '@dossipv/db';

/** Self sign-ups the admin has not contacted yet: the badge in the menu and the dashboard card. */
export function countSignupsToContact(): Promise<number> {
  return db.company.count({ where: { signupAt: { not: null }, signupContactedAt: null } });
}
