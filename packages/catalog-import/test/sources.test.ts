import { describe, it, expect } from 'vitest';
import { filterValid } from '../src/sources';

describe('filterValid', () => {
  it('keeps listings valid on or after the given date', () => {
    const items = [
      { model: 'A', validUntil: '2026-10-06' },
      { model: 'B', validUntil: '2026-10-07' },
      { model: 'C', acceptedUntil: '2030-01-01' },
    ];
    expect(filterValid(items, '2026-10-07').map((i) => i.model)).toEqual(['B', 'C']);
  });
});
