'use client';
import { liveHint } from '@/components/ui/live-hint';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LibraryPrerequisite } from '../../../../../../components/library-prerequisite';
import { saveCablingAction, type CablingPayload } from '../actions';
import {
  INSTALL_METHOD_OPTIONS,
  INSTALL_METHODS_WITH_K1,
  AMBIENT_CONTEXT_OPTIONS,
  AMBIENT_TEMP_BY_CONTEXT,
} from '../../../../../../lib/labels';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      <LibraryPrerequisite
        missing={[
          ...(!hasDcCable ? [{ label: 'câble DC solaire', type: 'CABLE' }] : []),
          ...(!hasAcCable ? [{ label: 'câble AC', type: 'CABLE' }] : []),
        ]}
      />
    );
  }

  return (
    <Card as="form" onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <fieldset>
        <legend>Paramètres généraux</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            cos φ
            <Input type="number" step="any" min={0} max={1} value={cosPhi} onChange={(e) => setCosPhi(Number(e.target.value))} required />
          </Label>
          <Label>
            Réactance linéique λ (Ω/m)
            <Input type="number" step="any" min={0} value={lambdaOhmPerM} onChange={(e) => setLambda(Number(e.target.value))} required />
            <span className="text-[0.8rem] font-normal text-app-muted">0,00008 Ω/m est la valeur usuelle pour les câbles BT.</span>
          </Label>
          <Label>
            Chute de tension maximale DC (%)
            <Input type="number" step="any" min={0} max={10} value={maxVoltageDropPct} onChange={(e) => setMaxDrop(Number(e.target.value))} required />
          </Label>
          <Label>
            Chute de tension maximale AC (%)
            <Input type="number" step="any" min={0} max={10} value={maxAcVoltageDropPct} onChange={(e) => setMaxAcDrop(Number(e.target.value))} required />
            <span className="text-[0.8rem] font-normal text-app-muted">1 % selon la norme UTE C15-712-1.</span>
          </Label>
          <Label>
            Connecteurs
            <Select value={connectorId ?? ''} onChange={(e) => setConnectorId(e.target.value === '' ? null : e.target.value)}>
              <option value="">—</option>
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isPrivate ? `${c.label} (privé)` : c.label}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            Chemin de câbles
            <Select value={cableTrayId ?? ''} onChange={(e) => setCableTrayId(e.target.value === '' ? null : e.target.value)}>
              <option value="">—</option>
              {cableTrays.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isPrivate ? `${c.label} (privé)` : c.label}
                </option>
              ))}
            </Select>
          </Label>
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
              <Label>
                Type de circuit
                <Select
                  value={run.circuitType}
                  onChange={(e) => {
                    const circuitType = e.target.value === 'AC' ? 'AC' : 'DC';
                    const fresh = defaultRun(circuitType, cables);
                    updateRun(index, { circuitType, cableId: fresh.cableId, sectionMm2: fresh.sectionMm2, installMethod: fresh.installMethod, ambientContext: fresh.ambientContext });
                  }}
                >
                  <option value="DC">DC</option>
                  <option value="AC">AC</option>
                </Select>
              </Label>
              <Label>
                Libellé
                <Input type="text" value={run.label} onChange={(e) => updateRun(index, { label: e.target.value })} maxLength={100} required />
              </Label>
              <Label>
                Câble
                <Select value={run.cableId} onChange={(e) => changeCable(index, e.target.value)} required>
                  {usableCables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.isPrivate ? `${c.label} (privé)` : c.label}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label>
                Section (mm²)
                <Select value={run.sectionMm2} onChange={(e) => updateRun(index, { sectionMm2: Number(e.target.value) })} required>
                  {(cable?.sections ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label>
                Longueur (m)
                <Input type="number" step="any" min={0.1} value={run.lengthM} onChange={(e) => updateRun(index, { lengthM: Number(e.target.value) })} required />
              </Label>
              <Label>
                Mode de pose (NF C 15-100 tab. 52C)
                <Select value={run.installMethod} onChange={(e) => updateRun(index, { installMethod: e.target.value })}>
                  {INSTALL_METHOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label>
                Contexte ambiant
                <Select value={run.ambientContext} onChange={(e) => updateRun(index, { ambientContext: e.target.value })}>
                  {AMBIENT_CONTEXT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label>
                Circuits groupés
                <Input type="number" step={1} min={1} value={run.groupedCircuits} onChange={(e) => updateRun(index, { groupedCircuits: Number(e.target.value) })} required />
              </Label>
              <Label>
                Couches
                <Input type="number" step={1} min={1} value={run.layers} onChange={(e) => updateRun(index, { layers: Number(e.target.value) })} required />
              </Label>
            </div>
            <div className="flex flex-col gap-3" style={{ gap: 4, marginTop: 8 }}>
              {ambientTemp !== undefined && <span className={liveHint()}>Température ambiante retenue : {ambientTemp} °C.</span>}
              {k1Missing && (
                <span className={liveHint({ tone: 'bad' })}>
                  Le mode de pose {run.installMethod} n&apos;a pas de facteur K1 tabulé : la génération sera bloquée tant qu&apos;un mode
                  de pose supporté n&apos;est pas choisi.
                </span>
              )}
            </div>
            {runs.length > 1 && (
              <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 8 }}>
                <Button variant="secondary" size="sm" type="button"  onClick={() => setRuns((prev) => prev.filter((_, i) => i !== index))}>
                  Retirer cette liaison
                </Button>
              </div>
            )}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" type="button"  onClick={() => setRuns((prev) => [...prev, defaultRun('DC', cables)])}>
          Ajouter une liaison DC
        </Button>
        <Button variant="secondary" type="button"  onClick={() => setRuns((prev) => [...prev, defaultRun('AC', cables)])}>
          Ajouter une liaison AC
        </Button>
      </div>

      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Link href={`/projects/${projectId}`} className={buttonVariants({ variant: 'secondary' })}>
          Retour au projet
        </Link>
      </div>
    </Card>
  );
}
