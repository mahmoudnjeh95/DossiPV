'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveCablingAction, type CablingPayload } from '../actions';
import {
  INSTALL_METHOD_OPTIONS,
  INSTALL_METHODS_WITH_K1,
  AMBIENT_CONTEXT_OPTIONS,
  AMBIENT_TEMP_BY_CONTEXT,
} from '../../../../../../lib/labels';

export interface CableChoice {
  id: string;
  label: string;
  isPrivate: boolean;
  usage: 'DC' | 'AC';
  sections: number[];
}

export interface AccessoryChoice {
  id: string;
  label: string;
  isPrivate: boolean;
}

type Run = CablingPayload['runs'][number];

export interface CablingFormProps {
  projectId: string;
  defaults: { cosPhi: number; maxVoltageDropPct: number; maxAcVoltageDropPct: number };
  cables: CableChoice[];
  connectors: AccessoryChoice[];
  cableTrays: AccessoryChoice[];
  initial: CablingPayload | null;
}

function defaultRun(circuitType: 'DC' | 'AC', cables: CableChoice[]): Run {
  const cable = cables.find((c) => c.usage === circuitType);
  return {
    circuitType,
    label: circuitType === 'DC' ? 'Liaison modules → onduleur' : 'Liaison onduleur → TGBT',
    cableId: cable?.id ?? '',
    sectionMm2: cable?.sections[0] ?? 6,
    lengthM: 10,
    // pv_dossier_input_schema.json CableRun.installMethod x-defaults: DC "13", AC "3A".
    installMethod: circuitType === 'DC' ? '13' : '3A',
    ambientContext: circuitType === 'DC' ? 'TRAY_SUN' : 'TECHNICAL_ROOM',
    groupedCircuits: 1,
    layers: 1,
  };
}

/**
 * Câblage form: general parameters plus the list of cable runs. The engine sizes the DC and AC
 * voltage drop and ampacity from the *first* DC run and the *first* AC run, so the form keeps
 * those two first and lets the installer add further runs for documentation.
 */
export function CablingForm({ projectId, defaults, cables, connectors, cableTrays, initial }: CablingFormProps): React.JSX.Element {
  const router = useRouter();
  const [cosPhi, setCosPhi] = useState(initial?.cosPhi ?? defaults.cosPhi);
  const [lambdaOhmPerM, setLambda] = useState(initial?.lambdaOhmPerM ?? 0.00008);
  const [maxVoltageDropPct, setMaxDrop] = useState(initial?.maxVoltageDropPct ?? defaults.maxVoltageDropPct);
  const [maxAcVoltageDropPct, setMaxAcDrop] = useState(initial?.maxAcVoltageDropPct ?? defaults.maxAcVoltageDropPct);
  const [connectorId, setConnectorId] = useState(initial?.connectorId ?? null);
  const [cableTrayId, setCableTrayId] = useState(initial?.cableTrayId ?? null);
  const [runs, setRuns] = useState<Run[]>(initial?.runs && initial.runs.length > 0 ? initial.runs : [defaultRun('DC', cables), defaultRun('AC', cables)]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasDcCable = cables.some((c) => c.usage === 'DC');
  const hasAcCable = cables.some((c) => c.usage === 'AC');

  function updateRun(index: number, patch: Partial<Run>): void {
    setRuns((prev) => prev.map((run, i) => (i === index ? { ...run, ...patch } : run)));
  }

  function changeCable(index: number, cableId: string): void {
    const cable = cables.find((c) => c.id === cableId);
    updateRun(index, { cableId, sectionMm2: cable?.sections[0] ?? runs[index]?.sectionMm2 ?? 6 });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const result = await saveCablingAction(projectId, { cosPhi, lambdaOhmPerM, maxVoltageDropPct, maxAcVoltageDropPct, connectorId, cableTrayId, runs });
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push(`/projects/${projectId}?saved=cabling`);
  }

  if (!hasDcCable || !hasAcCable) {
    return (
      <div className="card">
        <p role="alert">La bibliothèque doit contenir au moins un câble DC solaire et un câble AC pour renseigner le câblage.</p>
        <Link href="/library">Voir la bibliothèque</Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="card stack">
      <fieldset>
        <legend>Paramètres généraux</legend>
        <div className="form-grid">
          <label>
            cos φ
            <input type="number" step="any" min={0} max={1} value={cosPhi} onChange={(e) => setCosPhi(Number(e.target.value))} required />
          </label>
          <label>
            Réactance linéique λ (Ω/m)
            <input type="number" step="any" min={0} value={lambdaOhmPerM} onChange={(e) => setLambda(Number(e.target.value))} required />
            <span className="hint">0,00008 Ω/m est la valeur usuelle pour les câbles BT.</span>
          </label>
          <label>
            Chute de tension maximale DC (%)
            <input type="number" step="any" min={0} max={10} value={maxVoltageDropPct} onChange={(e) => setMaxDrop(Number(e.target.value))} required />
          </label>
          <label>
            Chute de tension maximale AC (%)
            <input type="number" step="any" min={0} max={10} value={maxAcVoltageDropPct} onChange={(e) => setMaxAcDrop(Number(e.target.value))} required />
            <span className="hint">1 % selon la norme UTE C15-712-1.</span>
          </label>
          <label>
            Connecteurs
            <select value={connectorId ?? ''} onChange={(e) => setConnectorId(e.target.value === '' ? null : e.target.value)}>
              <option value="">—</option>
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isPrivate ? `${c.label} (privé)` : c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chemin de câbles
            <select value={cableTrayId ?? ''} onChange={(e) => setCableTrayId(e.target.value === '' ? null : e.target.value)}>
              <option value="">—</option>
              {cableTrays.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isPrivate ? `${c.label} (privé)` : c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      {runs.map((run, index) => {
        const cable = cables.find((c) => c.id === run.cableId) ?? null;
        const usableCables = cables.filter((c) => c.usage === run.circuitType);
        const k1Missing = !INSTALL_METHODS_WITH_K1.has(run.installMethod);
        const ambientTemp = AMBIENT_TEMP_BY_CONTEXT[run.ambientContext];
        const isSizingRun = runs.findIndex((r) => r.circuitType === run.circuitType) === index;
        return (
          <fieldset key={index}>
            <legend>
              Liaison {index + 1} — {run.circuitType}
              {isSizingRun ? ' (dimensionnante)' : ''}
            </legend>
            <div className="form-grid">
              <label>
                Type de circuit
                <select
                  value={run.circuitType}
                  onChange={(e) => {
                    const circuitType = e.target.value === 'AC' ? 'AC' : 'DC';
                    const fresh = defaultRun(circuitType, cables);
                    updateRun(index, { circuitType, cableId: fresh.cableId, sectionMm2: fresh.sectionMm2, installMethod: fresh.installMethod, ambientContext: fresh.ambientContext });
                  }}
                >
                  <option value="DC">DC</option>
                  <option value="AC">AC</option>
                </select>
              </label>
              <label>
                Libellé
                <input type="text" value={run.label} onChange={(e) => updateRun(index, { label: e.target.value })} maxLength={100} required />
              </label>
              <label>
                Câble
                <select value={run.cableId} onChange={(e) => changeCable(index, e.target.value)} required>
                  {usableCables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.isPrivate ? `${c.label} (privé)` : c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Section (mm²)
                <select value={run.sectionMm2} onChange={(e) => updateRun(index, { sectionMm2: Number(e.target.value) })} required>
                  {(cable?.sections ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Longueur (m)
                <input type="number" step="any" min={0.1} value={run.lengthM} onChange={(e) => updateRun(index, { lengthM: Number(e.target.value) })} required />
              </label>
              <label>
                Mode de pose (NF C 15-100 tab. 52C)
                <select value={run.installMethod} onChange={(e) => updateRun(index, { installMethod: e.target.value })}>
                  {INSTALL_METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Contexte ambiant
                <select value={run.ambientContext} onChange={(e) => updateRun(index, { ambientContext: e.target.value })}>
                  {AMBIENT_CONTEXT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Circuits groupés
                <input type="number" step={1} min={1} value={run.groupedCircuits} onChange={(e) => updateRun(index, { groupedCircuits: Number(e.target.value) })} required />
              </label>
              <label>
                Couches
                <input type="number" step={1} min={1} value={run.layers} onChange={(e) => updateRun(index, { layers: Number(e.target.value) })} required />
              </label>
            </div>
            <div className="stack" style={{ gap: 4, marginTop: 8 }}>
              {ambientTemp !== undefined && <span className="live-hint">Température ambiante retenue : {ambientTemp} °C.</span>}
              {k1Missing && (
                <span className="live-hint bad">
                  Le mode de pose {run.installMethod} n&apos;a pas de facteur K1 tabulé : la génération sera bloquée tant qu&apos;un mode
                  de pose supporté n&apos;est pas choisi.
                </span>
              )}
            </div>
            {runs.length > 1 && (
              <div className="actions" style={{ marginTop: 8 }}>
                <button type="button" className="secondary small" onClick={() => setRuns((prev) => prev.filter((_, i) => i !== index))}>
                  Retirer cette liaison
                </button>
              </div>
            )}
          </fieldset>
        );
      })}

      <div className="actions">
        <button type="button" className="secondary" onClick={() => setRuns((prev) => [...prev, defaultRun('DC', cables)])}>
          Ajouter une liaison DC
        </button>
        <button type="button" className="secondary" onClick={() => setRuns((prev) => [...prev, defaultRun('AC', cables)])}>
          Ajouter une liaison AC
        </button>
      </div>

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
