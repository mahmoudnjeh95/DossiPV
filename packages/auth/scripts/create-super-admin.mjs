// Creates a super admin, or resets the password of an existing one.
//
//   SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD='...' \
//     node packages/auth/scripts/create-super-admin.mjs
//
// Credentials come from the environment so the password never lands in shell
// history via argv. Needs Node >= 25 (runs the TypeScript sources directly) and
// DATABASE_URL, either exported or in the .env of the directory you run it from.
import { db } from '@dossipv/db';
import { hashPassword } from '../src/password.ts';

const MIN_PASSWORD_LENGTH = 12;

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!email || !email.includes('@')) {
  console.error('Set SUPER_ADMIN_EMAIL to a valid email address.');
  process.exit(1);
}
if (!password || password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Set SUPER_ADMIN_PASSWORD to at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

try {
  const existing = await db.superAdmin.findUnique({ where: { email } });
  const passwordHash = await hashPassword(password);
  if (existing) {
    await db.superAdmin.update({ where: { email }, data: { passwordHash } });
    console.error(`Reset the password of existing super admin ${email}.`);
  } else {
    await db.superAdmin.create({ data: { email, passwordHash } });
    console.error(`Created super admin ${email}.`);
  }
} finally {
  await db.$disconnect();
}
