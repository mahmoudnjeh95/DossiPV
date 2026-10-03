import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import { catalogScope } from '../../../lib/project-access';

function PrivateBadge({ ownerCompanyId }: { ownerCompanyId: string | null }): React.JSX.Element {
  return ownerCompanyId ? <span className="badge">Privé</span> : <span className="badge badge-ok">Catalogue partagé</span>;
}

function homologation(ref: string | null, validTo: Date | null): string {
  if (!ref) {
    return '—';
  }
  return validTo ? `${ref} (jusqu'au ${validTo.toLocaleDateString('fr-FR')})` : ref;
}

/**
 * Read-only view of the equipment the installer can pick in a project: the super-admin's shared
 * catalog plus this company's private items (spec §3). Adding private items is a later slice.
 */
export default async function LibraryPage(): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const scope = catalogScope(user.companyId);
  const order = [{ brand: 'asc' as const }, { model: 'asc' as const }];

  const [modules, inverters, spds, dcSwitches, dcFuses, acBreakers, acIsolators, cables, accessories] = await Promise.all([
    db.pvModule.findMany({ where: scope, orderBy: order }),
    db.inverter.findMany({ where: scope, orderBy: order }),
    db.spd.findMany({ where: scope, orderBy: order }),
    db.dcSwitch.findMany({ where: scope, orderBy: order }),
    db.dcFuse.findMany({ where: scope, orderBy: order }),
    db.acBreaker.findMany({ where: scope, orderBy: order }),
    db.acIsolator.findMany({ where: scope, orderBy: order }),
    db.cable.findMany({ where: scope, include: { sections: true }, orderBy: order }),
    db.accessory.findMany({ where: scope, orderBy: order }),
  ]);

  return (
    <main>
      <h1>Bibliothèque d&apos;équipements</h1>
      <p className="muted">
        Le catalogue partagé est maintenu par DossiPV ; vos équipements privés ne sont visibles que par votre société. Pour
        ajouter un équipement privé, contactez DossiPV en attendant le formulaire dédié.
      </p>

      <section className="card table-wrap">
        <h2>Modules photovoltaïques ({modules.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Marque / modèle</th>
              <th>Pmax</th>
              <th>Voc / Vmp</th>
              <th>Isc / Imp</th>
              <th>Dimensions</th>
              <th>Homologation</th>
              <th>Origine</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.id}>
                <td>{m.brand} {m.model}</td>
                <td>{m.pmaxW} Wc</td>
                <td>{m.vocV} / {m.vmpV} V</td>
                <td>{m.iscA} / {m.impA} A</td>
                <td>{m.lengthMm} × {m.widthMm} mm, {m.weightKg} kg</td>
                <td>{homologation(m.homologationReference, m.homologationValidTo)}</td>
                <td><PrivateBadge ownerCompanyId={m.ownerCompanyId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card table-wrap">
        <h2>Onduleurs ({inverters.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Marque / modèle</th>
              <th>Pac</th>
              <th>Phases</th>
              <th>Plage MPPT</th>
              <th>MPPT × entrées</th>
              <th>Iac max</th>
              <th>STEG</th>
              <th>Origine</th>
            </tr>
          </thead>
          <tbody>
            {inverters.map((i) => (
              <tr key={i.id}>
                <td>{i.brand} {i.model}</td>
                <td>{i.pacW} W</td>
                <td>{i.phases}</td>
                <td>{i.mpptMinV}–{i.mpptMaxV} V (max {i.vdcMaxV} V)</td>
                <td>{i.mpptCount} × {i.inputsPerMppt}</td>
                <td>{i.iacMaxA} A</td>
                <td>{i.stegApproved ? <span className="badge badge-ok">Agréé</span> : <span className="badge badge-warn">Non listé</span>}</td>
                <td><PrivateBadge ownerCompanyId={i.ownerCompanyId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card table-wrap">
        <h2>Parafoudres ({spds.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Marque / modèle</th>
              <th>Côté</th>
              <th>Type</th>
              <th>Uc</th>
              <th>Up</th>
              <th>In / Imax</th>
              <th>Iscpv</th>
              <th>Origine</th>
            </tr>
          </thead>
          <tbody>
            {spds.map((s) => (
              <tr key={s.id}>
                <td>{s.brand} {s.model}</td>
                <td>{s.side}</td>
                <td>T{s.type}</td>
                <td>{s.ucV} V</td>
                <td>{s.upKV} kV</td>
                <td>{s.inKA} / {s.imaxKA} kA</td>
                <td>{s.iscpvKA !== null ? `${s.iscpvKA} kA` : '—'}</td>
                <td><PrivateBadge ownerCompanyId={s.ownerCompanyId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="card-grid">
        <section className="card table-wrap">
          <h2>Interrupteurs-sectionneurs DC ({dcSwitches.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Marque / modèle</th>
                <th>Tension / courant</th>
                <th>Origine</th>
              </tr>
            </thead>
            <tbody>
              {dcSwitches.map((s) => (
                <tr key={s.id}>
                  <td>{s.brand} {s.model}</td>
                  <td>{s.ratedVoltageV} V / {s.ratedCurrentA} A, {s.poles}P</td>
                  <td><PrivateBadge ownerCompanyId={s.ownerCompanyId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card table-wrap">
          <h2>Fusibles DC ({dcFuses.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Marque / modèle</th>
                <th>Tension / courant</th>
                <th>Origine</th>
              </tr>
            </thead>
            <tbody>
              {dcFuses.map((f) => (
                <tr key={f.id}>
                  <td>{f.brand} {f.model}</td>
                  <td>{f.ratedVoltageV} V / {f.ratedCurrentA} A</td>
                  <td><PrivateBadge ownerCompanyId={f.ownerCompanyId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card table-wrap">
          <h2>Disjoncteurs AC ({acBreakers.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Marque / modèle</th>
                <th>Calibre</th>
                <th>Origine</th>
              </tr>
            </thead>
            <tbody>
              {acBreakers.map((b) => (
                <tr key={b.id}>
                  <td>{b.brand} {b.model}</td>
                  <td>{b.ratedCurrentA} A{b.curve ? ` courbe ${b.curve}` : ''}{b.breakingCapacityKA ? `, ${b.breakingCapacityKA} kA` : ''}</td>
                  <td><PrivateBadge ownerCompanyId={b.ownerCompanyId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card table-wrap">
          <h2>Interrupteurs-sectionneurs AC ({acIsolators.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Marque / modèle</th>
                <th>Calibre</th>
                <th>Origine</th>
              </tr>
            </thead>
            <tbody>
              {acIsolators.map((i) => (
                <tr key={i.id}>
                  <td>{i.brand} {i.model}</td>
                  <td>{i.ratedCurrentA} A</td>
                  <td><PrivateBadge ownerCompanyId={i.ownerCompanyId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card table-wrap">
        <h2>Câbles ({cables.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Marque / modèle</th>
              <th>Usage</th>
              <th>Conducteur / isolant</th>
              <th>Sections (mm² — Iz A, méthode)</th>
              <th>Origine</th>
            </tr>
          </thead>
          <tbody>
            {cables.map((c) => (
              <tr key={c.id}>
                <td>{c.brand} {c.model}</td>
                <td>{c.usage}</td>
                <td>{c.conductor} / {c.insulation}</td>
                <td>{c.sections.map((s) => `${s.sectionMm2} — ${s.izA} A, ${s.izReferenceMethod}`).join(' · ')}</td>
                <td><PrivateBadge ownerCompanyId={c.ownerCompanyId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card table-wrap">
        <h2>Accessoires ({accessories.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Marque / modèle</th>
              <th>Type</th>
              <th>Spécification</th>
              <th>Origine</th>
            </tr>
          </thead>
          <tbody>
            {accessories.map((a) => (
              <tr key={a.id}>
                <td>{a.brand} {a.model}</td>
                <td>{a.kind}</td>
                <td>{a.spec ?? '—'}</td>
                <td><PrivateBadge ownerCompanyId={a.ownerCompanyId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
