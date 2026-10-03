import Link from 'next/link';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../layout';
import { DeletePvModuleButton } from './delete-button';
import { PvModule, Add } from '@dossipv/icons';

export default async function PvModuleListPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();

  const modules = await db.pvModule.findMany({ where: { ownerCompanyId: null }, orderBy: { brand: 'asc' } });

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PvModule size="lg" color="gold" />
        Modules photovoltaïques
      </h1>
      <Link href="/admin/equipment/pv-modules/new" className="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <Add size="sm" color="inherit" />
        Ajouter un module
      </Link>
      <table>
        <thead>
          <tr>
            <th>Marque</th>
            <th>Modèle</th>
            <th>Puissance (Wc)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {modules.map((module) => (
            <tr key={module.id}>
              <td>{module.brand}</td>
              <td>{module.model}</td>
              <td>{module.pmaxW}</td>
              <td>
                <Link href={`/admin/equipment/pv-modules/${module.id}`}>Modifier</Link>
                <DeletePvModuleButton moduleId={module.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
