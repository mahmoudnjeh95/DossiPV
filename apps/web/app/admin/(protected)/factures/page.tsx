import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { formatTnd, tndToMillimes } from '../../../../lib/invoicing/amounts';

const INVOICE_ROWS = 200;

export default async function AdminInvoicesPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const invoices = await db.invoice.findMany({
    orderBy: [{ issuedAt: 'desc' }, { sequence: 'desc' }],
    take: INVOICE_ROWS,
    include: { company: { select: { id: true, name: true } } },
  });

  return (
    <main>
      <h1>Factures</h1>
      <p className="hint">Une facture numérotée est émise pour chaque paiement enregistré ou réglé en ligne.</p>
      {invoices.length === 0 ? (
        <p>Aucune facture émise.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Date</th>
              <th>Société</th>
              <th>Total TTC</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.number}</td>
                <td>{invoice.issuedAt.toLocaleDateString('fr-FR')}</td>
                <td>
                  <Link href={`/admin/installers/${invoice.company.id}`}>{invoice.company.name}</Link>
                </td>
                <td>{formatTnd(tndToMillimes(invoice.totalTtcTnd))} TND</td>
                <td>
                  <a href={`/factures/${invoice.id}`}>Télécharger</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
