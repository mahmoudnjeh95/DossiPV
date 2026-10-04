import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';

const email = 'owner@solarpro.tn';
const passwordHash = await hashPassword('Bn4$qLw9VeT2cXr7pM!k');
await db.companyUser.update({ where: { email }, data: { passwordHash } });
console.log('password rotated for', email);

await db.$disconnect();
