import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn() }));

vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return { ...actual, db: { ...actual.db, paymentIntent: { findMany: mocks.findMany, updateMany: mocks.updateMany } } };
});

import { erasePaymentProofs } from '../src/erase-payment-proofs';

const NOW = new Date('2026-11-24T10:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('erasePaymentProofs', () => {
  it('does nothing when no screenshot has expired', async () => {
    mocks.findMany.mockResolvedValue([]);

    await expect(erasePaymentProofs(NOW)).resolves.toBe(0);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('selects only expired intents that still hold an image, and nulls the image and its type', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    mocks.updateMany.mockResolvedValue({ count: 2 });

    await expect(erasePaymentProofs(NOW)).resolves.toBe(2);

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proofExpiresAt: { lte: NOW }, proofImage: { not: null } }, select: { id: true } }),
    );
    // proofExpiresAt is kept: it is not part of the update.
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } }, data: { proofImage: null, proofMime: null } });
  });

  it('works through a backlog in batches', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `x${i}` }));
    mocks.findMany.mockResolvedValueOnce(full).mockResolvedValueOnce([{ id: 'last' }]);
    mocks.updateMany.mockResolvedValueOnce({ count: 100 }).mockResolvedValueOnce({ count: 1 });

    await expect(erasePaymentProofs(NOW)).resolves.toBe(101);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });
});
