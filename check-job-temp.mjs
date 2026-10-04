import { db } from '@dossipv/db';

const job = await db.dossierJob.findUnique({ where: { id: 'afd079e5-5705-49c0-bb53-786daae6c451' } });
console.log(job);

await db.$disconnect();
