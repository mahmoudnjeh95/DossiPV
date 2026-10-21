import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { publishCatalogItemAction, publishCleanDraftsAction, rejectCatalogItemAction } from './actions';
import { describeInverter, describePvModule } from './describe-item';

function Notes({ notes }: { notes: string | null }): React.JSX.Element | null {
  return notes ? <pre className="hint" style={{ whiteSpace: 'pre-wrap' }}>{notes}</pre> : null;
}

export default async function CatalogReviewPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const draftWhere = { ownerCompanyId: null, catalogStatus: 'DRAFT' as const };
  const [modules, inverters] = await Promise.all([
    db.pvModule.findMany({ where: draftWhere, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
    db.inverter.findMany({ where: draftWhere, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
  ]);

  return (
    <main>
      <h1>Catalogue à valider</h1>
      <p className="muted">
        Comparez chaque fiche avec le PDF du fabricant avant de publier. Une fois publié, l&apos;équipement devient visible par tous
        les installateurs.
      </p>

      <section className="card">
        <h2>Modules ({modules.length})</h2>
        <form action={publishCleanDraftsAction.bind(null, 'PV_MODULE')}>
          <button type="submit">Publier tous les modules sans remarque</button>
        </form>
        {modules.map((m) => (
          <article key={m.id} className="card">
            <h3>{m.brand} {m.model}</h3>
            {describePvModule(m).map((line) => <p key={line}>{line}</p>)}
            <p>Homologation : {m.homologationReference} — jusqu&apos;au {m.homologationValidTo?.toISOString().slice(0, 10)}</p>
            {m.datasheetSourceUrl && <a href={m.datasheetSourceUrl} target="_blank" rel="noreferrer">Fiche du fabricant</a>}
            <Notes notes={m.importNotes} />
            <form action={publishCatalogItemAction.bind(null, 'PV_MODULE', m.id)}><button type="submit">Publier</button></form>
            <form action={async () => { 'use server'; await rejectCatalogItemAction('PV_MODULE', m.id); }}><button type="submit" className="danger">Rejeter</button></form>
          </article>
        ))}
      </section>

      <section className="card">
        <h2>Onduleurs ({inverters.length})</h2>
        <form action={publishCleanDraftsAction.bind(null, 'INVERTER')}>
          <button type="submit">Publier tous les onduleurs sans remarque</button>
        </form>
        {inverters.map((i) => (
          <article key={i.id} className="card">
            <h3>{i.brand} {i.model}</h3>
            {describeInverter(i).map((line) => <p key={line}>{line}</p>)}
            <p>Acceptation STEG jusqu&apos;au {i.homologationValidTo?.toISOString().slice(0, 10)}</p>
            {i.datasheetSourceUrl && <a href={i.datasheetSourceUrl} target="_blank" rel="noreferrer">Fiche du fabricant</a>}
            <Notes notes={i.importNotes} />
            <form action={publishCatalogItemAction.bind(null, 'INVERTER', i.id)}><button type="submit">Publier</button></form>
            <form action={async () => { 'use server'; await rejectCatalogItemAction('INVERTER', i.id); }}><button type="submit" className="danger">Rejeter</button></form>
          </article>
        ))}
      </section>
    </main>
  );
}
