import { db } from '@dossipv/db';
import { hashPassword } from '../../packages/auth/src/password.ts';
const mode = process.argv[2];
const pw = await hashPassword('QaUiCheck-2026!');
if (mode === 'make') {
  await db.companyUser.upsert({ where: { email: 'qa-ui@example.test' }, update: { passwordHash: pw }, create: { companyId: '2196a606-d58a-45d7-838d-4ffed18ad841', email: 'qa-ui@example.test', passwordHash: pw, fullName: 'QA UI', role: 'MEMBER', emailVerifiedAt: new Date() } });
  await db.superAdmin.upsert({ where: { email: 'qa-ui-admin@example.test' }, update: { passwordHash: pw }, create: { email: 'qa-ui-admin@example.test', passwordHash: pw } });
} else {
  await db.session.deleteMany({ where: { companyUser: { email: 'qa-ui@example.test' } } }).catch(() => {});
  await db.companyUser.deleteMany({ where: { email: 'qa-ui@example.test' } });
  await db.superAdmin.deleteMany({ where: { email: 'qa-ui-admin@example.test' } });
}
await db.$disconnect();
console.log(mode, 'done');
