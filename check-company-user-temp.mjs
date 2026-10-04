import { db } from '@dossipv/db';

const company = await db.company.findFirst({ where: { name: 'SolarPro Tunisie' }, include: { users: true } });
console.log(company?.id, company?.users.map((u) => ({ email: u.email, role: u.role })));

await db.$disconnect();
