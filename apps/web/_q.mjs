import { db } from '@dossipv/db';
console.log('companies', await db.company.count(), 'users', await db.companyUser.count(), 'admins', await db.superAdmin.count(), 'projects', await db.project.count());
console.log((await db.companyUser.findMany({ take: 5, select: { email: true, role: true, company: { select: { id: true, name: true } } } })));
await db.$disconnect();
