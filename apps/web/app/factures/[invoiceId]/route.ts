import { cookies } from 'next/headers';
import { readFile } from 'fs/promises';
import { db } from '@dossipv/db';
import { validateSession, validateSuperAdminSession } from '@dossipv/auth';
import { getFilePath } from '@dossipv/file-storage';
import { attachmentDisposition } from '../../../lib/dossier-files';
import { invoiceDownloadName, regenerateInvoicePdf } from '../../../lib/invoices';

const COMPANY_SESSION_COOKIE = 'dossipv_session';
const ADMIN_SESSION_COOKIE = 'dossipv_admin_session';

/**
 * The invoice PDF, for the company it was issued to or a super admin. Another company gets a 404,
 * as for a project that is not its own. A missing or unreadable PDF is rebuilt on the fly.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ invoiceId: string }> }): Promise<Response> {
  const { invoiceId } = await params;

  const cookieStore = await cookies();
  const companyToken = cookieStore.get(COMPANY_SESSION_COOKIE)?.value;
  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const user = companyToken ? await validateSession(companyToken) : null;
  const admin = adminToken ? await validateSuperAdminSession(adminToken) : null;
  if (!user && !admin) {
    return new Response(null, { status: 401 });
  }

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { pdfFile: true } });
  if (!invoice || (!admin && invoice.companyId !== user?.companyId)) {
    return new Response(null, { status: 404 });
  }

  let bytes: Buffer | null = null;
  if (invoice.pdfFile) {
    bytes = await readFile(getFilePath(invoice.pdfFile.storageKey)).catch(() => null);
  }
  if (!bytes) {
    try {
      const fileId = await regenerateInvoicePdf(invoice.id);
      const file = await db.file.findUnique({ where: { id: fileId } });
      bytes = file ? await readFile(getFilePath(file.storageKey)).catch(() => null) : null;
    } catch (error) {
      console.error(`[invoices] PDF de la facture ${invoice.number} indisponible :`, error);
    }
  }
  if (!bytes) {
    return new Response(null, { status: 500 });
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachmentDisposition(invoiceDownloadName(invoice.number)),
      'Cache-Control': 'private, no-store',
    },
  });
}
