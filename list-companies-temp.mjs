import { db } from '@dossipv/db';

const companies = await db.company.findMany({ select: { id: true, name: true } });
console.log(companies);

await db.$disconnect();
