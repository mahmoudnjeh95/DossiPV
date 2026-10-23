'use client';

import { useState, useTransition } from 'react';
import type { Proposal, ProposalKind } from '@dossipv/engine';
import type { EquipmentChoice, EquipmentSelection } from '../../../../../lib/project-proposals';
import { applyProposalAction } from './actions';

const KIND_LABELS: Record<ProposalKind, string> = {
  RECOMMENDED: 'Recommandée',
  ECONOMIC: 'Économique',
  MAX_PRODUCTION: 'Production maximale',
};

const fr = (value: number, decimals = 0, minDecimals = decimals): string =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: minDecimals, maximumFractionDigits: decimals }).format(value);

/** One installation the installer shows the client; choosing it writes every technical section. */
export function ProposalCard({
  projectId,
  proposal,
  selection = {},
  choices,
}: {
  projectId: string;
  proposal: Proposal;
  selection?: EquipmentSelection;
  /** The library items the installer may swap in; without them the equipment is shown as plain text. */
  choices?: { modules: EquipmentChoice[]; inverters: EquipmentChoice[] };
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { module, inverter } = proposal.candidate;

  /** Reloads the proposals with this equipment fixed; the page recomputes every figure. */
  function swap(key: 'module' | 'inverter', id: string): void {
    const params = new URLSearchParams(window.location.search);
    params.set('module', selection.moduleId ?? module.id);
    params.set('inverter', selection.inverterId ?? inverter.id);
    params.set(key, id);
    window.location.search = params.toString();
  }

  function choose(): void {
    if (!window.confirm('Le client a validé cette installation ?')) return;
    setError(null);
    startTransition(async () => {
      const result = await applyProposalAction(projectId, proposal.key, selection);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <section className="card">
      <div className="actions" style={{ marginBottom: 8 }}>
        {proposal.kinds.map((kind) => (
          <span key={kind} className={kind === 'RECOMMENDED' ? 'badge badge-ok' : 'badge'}>
            {KIND_LABELS[kind]}
          </span>
        ))}
      </div>
      <p style={{ fontSize: '2rem', fontWeight: 700, margin: '4px 0' }}>{fr(proposal.dcPowerKWp, 1)} kWc</p>
      <p>
        {proposal.moduleCount} panneaux{' '}
        {choices ? (
          <select aria-label="Changer les panneaux" value={module.id} onChange={(event) => swap('module', event.target.value)}>
            {choices.modules.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        ) : (
          `${module.brand} ${module.model} (${fr(module.pmaxW)} W)`
        )}
      </p>
      <p>
        Onduleur{' '}
        {choices ? (
          <select aria-label="Changer l'onduleur" value={inverter.id} onChange={(event) => swap('inverter', event.target.value)}>
            {choices.inverters.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        ) : (
          `${inverter.brand} ${inverter.model} (${fr(inverter.pacW / 1000, 1, 0)} kW)`
        )}
      </p>
      <p>Production estimée : {fr(proposal.annualProductionKWh)} kWh/an</p>
      <p>Couverture de la consommation : {fr(proposal.coveragePct)} %</p>
      <p>Surface de toiture : environ {fr(proposal.roofAreaM2)} m²</p>
      {proposal.yearlySavingTND !== null && <p>Économie estimée : environ {fr(proposal.yearlySavingTND)} DT/an</p>}
      <p className="muted">{proposal.explanation}</p>
      <button type="button" onClick={choose} disabled={pending}>
        Choisir cette installation
      </button>
      {error && <div className="banner banner-danger" role="alert" style={{ marginTop: 12 }}>{error}</div>}
    </section>
  );
}
