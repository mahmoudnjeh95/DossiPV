import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';

const passwordHash = await hashPassword('Verify-Pass-123!');
await db.companyUser.update({ where: { email: 'owner@solarpro.tn' }, data: { passwordHash } });
console.log('password set for owner@solarpro.tn');

await db.$disconnect();
