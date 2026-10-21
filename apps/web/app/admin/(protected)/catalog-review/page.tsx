import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { publishCatalogItemAction, publishCleanDraftsAction, publishCuratedDraftsAction } from './actions';
import { RejectButton } from './reject-button';
import { describeInverter, describePvModule } from './describe-item';

function Notes({ notes }: { notes: string | null }): React.JSX.Element | null {
  return notes ? <pre className="hint" style={{ whiteSpace: 'pre-wrap' }}>{notes}</pre> : null;
}

export default async function CatalogReviewPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const draftWhere = { ownerCompanyId: null, catalogStatus: 'DRAFT' as const };
  const orderBy = [{ brand: 'asc' as const }, { model: 'asc' as const }];
  const [modules, inverters, cables, spds, dcSwitches, dcFuses, acBreakers, acIsolators] = await Promise.all([
    db.pvModule.findMany({ where: draftWhere, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
    db.inverter.findMany({ where: draftWhere, orderBy: [{ brand: 'asc' }, { model: 'asc' }] }),
    db.cable.findMany({ where: draftWhere, orderBy }),
    db.spd.findMany({ where: draftWhere, orderBy }),
    db.dcSwitch.findMany({ where: draftWhere, orderBy }),
    db.dcFuse.findMany({ where: draftWhere, orderBy }),
    db.acBreaker.findMany({ where: draftWhere, orderBy }),
    db.acIsolator.findMany({ where: draftWhere, orderBy }),
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
            <RejectButton kind="PV_MODULE" id={m.id} />
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
            <RejectButton kind="INVERTER" id={i.id} />
          </article>
        ))}
      </section>

      {([
        ['CABLE', 'Câbles', cables],
        ['SPD', 'Parafoudres', spds],
        ['DC_SWITCH', 'Interrupteurs-sectionneurs DC', dcSwitches],
        ['DC_FUSE', 'Fusibles DC', dcFuses],
        ['AC_BREAKER', 'Disjoncteurs AC', acBreakers],
        ['AC_ISOLATOR', 'Sectionneurs AC', acIsolators],
      ] as const).map(([kind, label, items]) => (
        <section key={kind} className="card">
          <h2>{label} ({items.length})</h2>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                {item.brand} {item.model}{' '}
                {item.datasheetSourceUrl && <a href={item.datasheetSourceUrl} target="_blank" rel="noreferrer">source</a>}
              </li>
            ))}
          </ul>
          {items.length > 0 && (
            <form action={publishCuratedDraftsAction.bind(null, kind)}>
              <button type="submit">Tout publier</button>
            </form>
          )}
        </section>
      ))}
    </main>
  );
}
