import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Proposal } from '@dossipv/engine';

vi.mock('../app/(app)/projects/[id]/proposals/actions', () => ({ applyProposalAction: vi.fn() }));

import { ProposalCard } from '../app/(app)/projects/[id]/proposals/proposal-card';

afterEach(cleanup);

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    key: 'm1|i1|8x1',
    kinds: ['RECOMMENDED'],
    candidate: {
      module: { id: 'm1', brand: 'LONGi', model: 'Hi-MO 6', pmaxW: 450 },
      inverter: { id: 'i1', brand: 'Sofar', model: 'KTLX', pacW: 3000 },
    },
    moduleCount: 8,
    dcPowerKWp: 3.6,
    acPowerKW: 3,
    annualProductionKWh: 5400,
    coveragePct: 98,
    roofAreaM2: 16,
    yearlySavingTND: 380,
    explanation: 'Couvre le besoin.',
    ...overrides,
  } as unknown as Proposal;
}

describe('ProposalCard', () => {
  it('shows the figures the client decides on', () => {
    render(<ProposalCard projectId="p1" proposal={proposal()} />);
    expect(screen.getByText(/3,6\s*kWc/)).toBeTruthy();
    expect(screen.getByText(/8 panneaux LONGi Hi-MO 6 \(450 W\)/)).toBeTruthy();
    expect(screen.getByText(/Onduleur Sofar KTLX \(3 kW\)/)).toBeTruthy();
    expect(screen.getByText('Couverture de la consommation : 98 %')).toBeTruthy();
    expect(screen.getByText('Économie estimée : environ 380 DT/an')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choisir cette installation' })).toBeTruthy();
  });

  it('omits the saving line when it is unknown', () => {
    render(<ProposalCard projectId="p1" proposal={proposal({ yearlySavingTND: null })} />);
    expect(screen.queryByText(/Économie estimée/)).toBeNull();
  });

  it('shows one badge per objective won', () => {
    render(<ProposalCard projectId="p1" proposal={proposal({ kinds: ['RECOMMENDED', 'ECONOMIC'] })} />);
    expect(screen.getByText('Recommandée')).toBeTruthy();
    expect(screen.getByText('Économique')).toBeTruthy();
    expect(screen.queryByText('Production maximale')).toBeNull();
  });
});
