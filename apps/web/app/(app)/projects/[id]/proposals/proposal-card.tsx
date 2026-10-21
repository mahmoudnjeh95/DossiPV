'use client';

import { useState, useTransition } from 'react';
import type { Proposal, ProposalKind } from '@dossipv/engine';
import { applyProposalAction } from './actions';

const KIND_LABELS: Record<ProposalKind, string> = {
  RECOMMENDED: 'Recommandée',
  ECONOMIC: 'Économique',
  MAX_PRODUCTION: 'Production maximale',
};

const fr = (value: number, decimals = 0, minDecimals = decimals): string =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: minDecimals, maximumFractionDigits: decimals }).format(value);

/** One installation the installer shows the client; choosing it writes every technical section. */
export function ProposalCard({ projectId, proposal }: { projectId: string; proposal: Proposal }): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { module, inverter } = proposal.candidate;

  function choose(): void {
    if (!window.confirm('Le client a validé cette installation ?')) return;
    setError(null);
    startTransition(async () => {
      const result = await applyProposalAction(projectId, proposal.key);
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
        {proposal.moduleCount} panneaux {module.brand} {module.model} ({fr(module.pmaxW)} W)
      </p>
      <p>
        Onduleur {inverter.brand} {inverter.model} ({fr(inverter.pacW / 1000, 1, 0)} kW)
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
