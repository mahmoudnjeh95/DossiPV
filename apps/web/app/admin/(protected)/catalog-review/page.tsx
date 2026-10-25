import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../layout';
import { publishCatalogItemAction, publishCleanDraftsAction, publishCuratedDraftsAction } from './actions';
import { RejectButton } from './reject-button';
import { describeInverter, describePvModule } from './describe-item';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function Notes({ notes }: { notes: string | null }): React.JSX.Element | null {
  return notes ? <pre className="text-[0.8rem] font-normal break-words text-app-muted" style={{ whiteSpace: 'pre-wrap' }}>{notes}</pre> : null;
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
      <p className="text-app-muted">
        Comparez chaque fiche avec le PDF du fabricant avant de publier. Une fois publié, l&apos;équipement devient visible par tous
        les installateurs.
      </p>

      <Card as="section">
        <h2>Modules ({modules.length})</h2>
        <form action={publishCleanDraftsAction.bind(null, 'PV_MODULE')}>
          <Button type="submit">Publier tous les modules sans remarque</Button>
        </form>
        {modules.map((m) => (
          <Card as="article" key={m.id} >
            <h3>{m.brand} {m.model}</h3>
            {describePvModule(m).map((line) => <p key={line}>{line}</p>)}
            <p>Homologation : {m.homologationReference} — jusqu&apos;au {m.homologationValidTo?.toISOString().slice(0, 10)}</p>
            {m.datasheetSourceUrl && <a href={m.datasheetSourceUrl} target="_blank" rel="noreferrer">Fiche du fabricant</a>}
            <Notes notes={m.importNotes} />
            <form action={publishCatalogItemAction.bind(null, 'PV_MODULE', m.id)}><Button type="submit">Publier</Button></form>
            <RejectButton kind="PV_MODULE" id={m.id} />
          </Card>
        ))}
      </Card>

      <Card as="section">
        <h2>Onduleurs ({inverters.length})</h2>
        <form action={publishCleanDraftsAction.bind(null, 'INVERTER')}>
          <Button type="submit">Publier tous les onduleurs sans remarque</Button>
        </form>
        {inverters.map((i) => (
          <Card as="article" key={i.id} >
            <h3>{i.brand} {i.model}</h3>
            {describeInverter(i).map((line) => <p key={line}>{line}</p>)}
            <p>Acceptation STEG jusqu&apos;au {i.homologationValidTo?.toISOString().slice(0, 10)}</p>
            {i.datasheetSourceUrl && <a href={i.datasheetSourceUrl} target="_blank" rel="noreferrer">Fiche du fabricant</a>}
            <Notes notes={i.importNotes} />
            <form action={publishCatalogItemAction.bind(null, 'INVERTER', i.id)}><Button type="submit">Publier</Button></form>
            <RejectButton kind="INVERTER" id={i.id} />
          </Card>
        ))}
      </Card>

      {([
        ['CABLE', 'Câbles', cables],
        ['SPD', 'Parafoudres', spds],
        ['DC_SWITCH', 'Interrupteurs-sectionneurs DC', dcSwitches],
        ['DC_FUSE', 'Fusibles DC', dcFuses],
        ['AC_BREAKER', 'Disjoncteurs AC', acBreakers],
        ['AC_ISOLATOR', 'Sectionneurs AC', acIsolators],
      ] as const).map(([kind, label, items]) => (
        <Card as="section" key={kind} >
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
              <Button type="submit">Tout publier</Button>
            </form>
          )}
        </Card>
      ))}
    </main>
  );
}
