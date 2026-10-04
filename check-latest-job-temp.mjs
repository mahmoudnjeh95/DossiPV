import { db } from '@dossipv/db';

const job = await db.dossierJob.findFirst({
  where: { projectId: '116c26ad-96ac-46f2-812f-84199a60cda0' },
  orderBy: { startedAt: 'desc' },
});
console.log({
  id: job?.id, status: job?.status, failedStep: job?.failedStep, failureReason: job?.failureReason,
  docxFileId: job?.docxFileId, pdfFileId: job?.pdfFileId, annexesPdfFileId: job?.annexesPdfFileId,
});

await db.$disconnect();
