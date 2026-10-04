import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';

const email = 'mahmoud-admin@solarix.tn';
const passwordHash = await hashPassword('Css1928++--');
await db.superAdmin.upsert({ where: { email }, create: { email, passwordHash }, update: { passwordHash } });
console.log('password rotated for', email);
await db.$disconnect();
