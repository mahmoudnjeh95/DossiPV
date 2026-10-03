'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  nsMin,
  nsMax,
  nsOptMax,
  npMax,
  npOpt,
  ncMaxNoFuse,
  dcFuseRequired,
  totalDcPowerW,
  powerRatio,
  type PvModuleInput,
  type InverterInput,
} from '@dossipv/engine';
import { saveArrayAction, type ArrayPayload } from '../actions';
import { PHASE_CONNECTION_OPTIONS } from '../../../../../../lib/labels';

export interface ModuleChoice {
  id: string;
  label: string;
  isPrivate: boolean;
  spec: PvModuleInput;
}

export interface InverterChoice {
  id: string;
  label: string;
  isPrivate: boolean;
  spec: InverterInput;
}

type InverterRow = { inverterId: string; phaseConnection: string | null; mppts: { stringsInParallel: number; modulesPerString: number }[] };

export interface ArrayFormProps {
  projectId: string;
  companyId: string;
  defaults: { tMinC: number; tMaxC: number };
  sitePhases: number | null;
  modules: ModuleChoice[];
  inverters: InverterChoice[];
  initial: ArrayPayload | null;
}

function fmt(value: number, decimals = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimals }).format(value);
}

/**
 * Champ PV form: module, Tmin/Tmax, one or more inverters each with one or more MPPTs. Runs the
 * exact engine string-sizing functions in the browser as the installer types (spec §4 "live
 * validation"), so the Ns/Np bounds shown here are the same ones the worker will enforce.
 */
export function ArrayForm({ projectId, defaults, sitePhases, modules, inverters, initial }: ArrayFormProps): React.JSX.Element {
  const router = useRouter();
  const [moduleId, setModuleId] = useState(initial?.moduleId ?? modules[0]?.id ?? '');
  const [tMinC, setTMinC] = useState(initial?.tMinC ?? defaults.tMinC);
  const [tMaxC, setTMaxC] = useState(initial?.tMaxC ?? defaults.tMaxC);
  const [rowsDescription, setRowsDescription] = useState(initial?.rowsDescription ?? '');
  const [rows, setRows] = useState<InverterRow[]>(
    initial?.inverters ?? [{ inverterId: inverters[0]?.id ?? '', phaseConnection: null, mppts: [{ stringsInParallel: 1, modulesPerString: 1 }] }],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const module = useMemo(() => modules.find((m) => m.id === moduleId) ?? null, [modules, moduleId]);

  const totals = useMemo(() => {
    if (!module) {
      return null;
    }
    const array = rows
      .map((row) => {
        const inverter = inverters.find((i) => i.id === row.inverterId);
        return inverter ? { inverter: inverter.spec, mppts: row.mppts } : null;
      })
      .filter((entry): entry is { inverter: InverterInput; mppts: InverterRow['mppts'] } => entry !== null);
    if (array.length === 0) {
      return null;
    }
    const moduleCount = array.reduce((sum, e) => sum + e.mppts.reduce((s, m) => s + m.stringsInParallel * m.modulesPerString, 0), 0);
    return { moduleCount, dcPowerW: totalDcPowerW(module.spec, array), ratio: powerRatio(module.spec, array) };
  }, [module, rows, inverters]);

  function updateRow(index: number, patch: Partial<InverterRow>): void {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateMppt(rowIndex: number, mpptIndex: number, patch: Partial<InverterRow['mppts'][number]>): void {
    setRows((prev) =>
      prev.map((row, i) =>
        i === rowIndex ? { ...row, mppts: row.mppts.map((m, j) => (j === mpptIndex ? { ...m, ...patch } : m)) } : row,
      ),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const payload: ArrayPayload = {
      moduleId,
      tMinC,
      tMaxC,
      rowsDescription: rowsDescription.trim().length > 0 ? rowsDescription.trim() : null,
      inverters: rows,
    };
    const result = await saveArrayAction(projectId, payload);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push(`/projects/${projectId}?saved=array`);
  }

  if (modules.length === 0 || inverters.length === 0) {
    return (
      <div className="card">
        <p role="alert">La bibliothèque ne contient encore aucun module ou onduleur : impossible de configurer le champ PV.</p>
        <Link href="/library">Voir la bibliothèque</Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="card stack">
      <fieldset>
        <legend>Module et températures</legend>
        <div className="form-grid">
          <label>
            Module photovoltaïque
            <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} required>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.isPrivate ? `${m.label} (privé)` : m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tmin (°C)
            <input type="number" step="any" value={tMinC} onChange={(e) => setTMinC(Number(e.target.value))} required />
          </label>
          <label>
            Tmax cellule (°C)
            <input type="number" step="any" value={tMaxC} onChange={(e) => setTMaxC(Number(e.target.value))} required />
          </label>
          <label>
            Description des rangées
            <input type="text" value={rowsDescription} onChange={(e) => setRowsDescription(e.target.value)} maxLength={500} />
          </label>
        </div>
        {module && (
          <p className="hint">
            {fmt(module.spec.pmaxW)} Wc · Voc {fmt(module.spec.vocV, 1)} V · Isc {fmt(module.spec.iscA, 2)} A · Nc max sans fusible :{' '}
            {ncMaxNoFuse(module.spec)} chaîne(s) en parallèle.
          </p>
        )}
      </fieldset>

      {rows.map((row, rowIndex) => {
        const inverter = inverters.find((i) => i.id === row.inverterId) ?? null;
        const bounds =
          module && inverter
            ? {
                nsMin: nsMin(module.spec, inverter.spec, tMaxC),
                nsMax: nsMax(module.spec, inverter.spec, tMinC),
                nsOptMax: nsOptMax(module.spec, inverter.spec, tMinC),
                npMax: npMax(module.spec, inverter.spec, tMaxC),
                npOpt: npOpt(module.spec, inverter.spec, tMaxC),
              }
            : null;
        const phaseMismatch = inverter !== null && sitePhases !== null && inverter.spec.phases !== sitePhases;
        return (
          <fieldset key={rowIndex}>
            <legend>Onduleur {rowIndex + 1}</legend>
            <div className="form-grid">
              <label>
                Modèle
                <select value={row.inverterId} onChange={(e) => updateRow(rowIndex, { inverterId: e.target.value, mppts: row.mppts.slice(0, inverters.find((i) => i.id === e.target.value)?.spec.mpptCount ?? 1) })} required>
                  {inverters.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.isPrivate ? `${i.label} (privé)` : i.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Raccordement de phase
                <select value={row.phaseConnection ?? ''} onChange={(e) => updateRow(rowIndex, { phaseConnection: e.target.value === '' ? null : e.target.value })}>
                  <option value="">—</option>
                  {PHASE_CONNECTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {inverter && bounds && (
              <p className="hint">
                Plage MPPT {fmt(inverter.spec.mpptMinV)}–{fmt(inverter.spec.mpptMaxV)} V · Vdc max {fmt(inverter.spec.vdcMaxV)} V ·{' '}
                {inverter.spec.mpptCount} MPPT · Ns admissible {bounds.nsMin}–{bounds.nsMax} (optimal ≤ {bounds.nsOptMax}) · Np max {bounds.npMax}{' '}
                (optimal {bounds.npOpt}).{!inverter.spec.stegApproved && ' Onduleur absent de la liste STEG (C21).'}
              </p>
            )}
            {phaseMismatch && <p className="live-hint bad">Le site est {sitePhases === 3 ? 'triphasé' : 'monophasé'} mais cet onduleur ne l&apos;est pas (C19).</p>}

            <div className="stack" style={{ marginTop: 8 }}>
              {row.mppts.map((mppt, mpptIndex) => {
                const nsBad = bounds !== null && (mppt.modulesPerString < bounds.nsMin || mppt.modulesPerString > bounds.nsMax);
                const nsWarn = bounds !== null && !nsBad && mppt.modulesPerString > bounds.nsOptMax;
                const npBad = bounds !== null && mppt.stringsInParallel > bounds.npMax;
                const fuse = module ? dcFuseRequired(module.spec, mppt.stringsInParallel) : false;
                return (
                  <div key={mpptIndex} className="form-grid" style={{ alignItems: 'end' }}>
                    <label>
                      MPPT {mpptIndex + 1} — modules par chaîne (Ns)
                      <input type="number" min={1} max={100} step={1} value={mppt.modulesPerString} onChange={(e) => updateMppt(rowIndex, mpptIndex, { modulesPerString: Number(e.target.value) })} required />
                    </label>
                    <label>
                      Chaînes en parallèle (Np)
                      <input type="number" min={1} max={50} step={1} value={mppt.stringsInParallel} onChange={(e) => updateMppt(rowIndex, mpptIndex, { stringsInParallel: Number(e.target.value) })} required />
                    </label>
                    <div className="stack" style={{ gap: 4 }}>
                      {bounds && (
                        <span className={`live-hint ${nsBad ? 'bad' : nsWarn ? '' : 'good'}`}>
                          {nsBad ? `Ns doit être entre ${bounds.nsMin} et ${bounds.nsMax} pour cet onduleur.` : nsWarn ? `Ns au-dessus de l'optimal (${bounds.nsOptMax}) : écrêtage possible (C03).` : `Ns dans la plage ${bounds.nsMin}–${bounds.nsMax}.`}
                        </span>
                      )}
                      {bounds && (
                        <span className={`live-hint ${npBad ? 'bad' : 'good'}`}>
                          {npBad ? `Np dépasse le maximum ${bounds.npMax} (C04).` : `Np ≤ ${bounds.npMax}.`}
                          {fuse ? ' Fusibles DC requis.' : ''}
                        </span>
                      )}
                      {row.mppts.length > 1 && (
                        <button type="button" className="secondary small" onClick={() => updateRow(rowIndex, { mppts: row.mppts.filter((_, j) => j !== mpptIndex) })}>
                          Retirer ce MPPT
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="secondary small"
                disabled={inverter !== null && row.mppts.length >= inverter.spec.mpptCount}
                onClick={() => updateRow(rowIndex, { mppts: [...row.mppts, { stringsInParallel: 1, modulesPerString: row.mppts[0]?.modulesPerString ?? 1 }] })}
              >
                Ajouter un MPPT
              </button>
              {rows.length > 1 && (
                <button type="button" className="secondary small" onClick={() => setRows((prev) => prev.filter((_, i) => i !== rowIndex))}>
                  Retirer cet onduleur
                </button>
              )}
            </div>
          </fieldset>
        );
      })}

      <div className="actions">
        <button
          type="button"
          className="secondary"
          onClick={() => setRows((prev) => [...prev, { inverterId: prev[0]?.inverterId ?? inverters[0]!.id, phaseConnection: null, mppts: [{ stringsInParallel: 1, modulesPerString: 1 }] }])}
        >
          Ajouter un onduleur
        </button>
      </div>

      {totals && (
        <div className={`live-hint ${totals.ratio < 0.9 || totals.ratio > 1.3 ? '' : 'good'}`}>
          {totals.moduleCount} modules · {fmt(totals.dcPowerW)} Wc DC · ratio DC/AC {fmt(totals.ratio, 2)}
          {totals.ratio < 0.9 || totals.ratio > 1.3 ? ' (hors plage 0,9–1,3 — avertissement C06)' : ''}
        </div>
      )}

      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <Link href={`/projects/${projectId}`} className="button secondary">
          Retour au projet
        </Link>
      </div>
    </form>
  );
}
