import { db } from '@dossipv/db';

const earthing = await db.projectEarthing.findUnique({ where: { projectId: '116c26ad-96ac-46f2-812f-84199a60cda0' } });
console.log(earthing);

await db.$disconnect();
