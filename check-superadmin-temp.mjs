import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';

const email = 'verify-admin@dossipv.tn';
const passwordHash = await hashPassword('Verify-Pass-123!');
await db.superAdmin.upsert({ where: { email }, create: { email, passwordHash }, update: { passwordHash } });
console.log('Super-admin ready:', email);

await db.$disconnect();
