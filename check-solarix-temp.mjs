import { db } from '@dossipv/db';

const superAdmin = await db.superAdmin.findUnique({ where: { email: 'owner@solarix.tn' } });
console.log('superAdmin owner@solarix.tn:', superAdmin ? { id: superAdmin.id, email: superAdmin.email } : null);

const companyUser = await db.companyUser.findUnique({ where: { email: 'owner@solarix.tn' } });
console.log('companyUser owner@solarix.tn:', companyUser ? { id: companyUser.id, email: companyUser.email, role: companyUser.role } : null);

await db.$disconnect();
