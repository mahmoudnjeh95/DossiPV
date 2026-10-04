import { db } from '@dossipv/db';
import { hashPassword } from '@dossipv/auth';

const email = 'owner@solarix.tn';
const companyId = 'c9f62f55-3389-498c-b433-f2065c74a364';
const passwordHash = await hashPassword('Css1928++--');

const user = await db.companyUser.create({
  data: { email, passwordHash, companyId, role: 'OWNER', fullName: 'Solarix Owner' },
});
console.log('created company user:', { id: user.id, email: user.email, role: user.role, companyId: user.companyId });

await db.$disconnect();
