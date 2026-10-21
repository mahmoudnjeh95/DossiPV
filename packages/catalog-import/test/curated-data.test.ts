import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../../data/catalog/${name}`, import.meta.url), 'utf8'));
const source = z.string().url().startsWith('https://');

const cables = z.array(z.object({
  brand: z.string(), model: z.string(), usage: z.enum(['DC_SOLAR', 'AC', 'EARTH']), conductor: z.enum(['Cu', 'Al']),
  insulation: z.string(), standard: z.string(), source,
  sections: z.array(z.object({ sectionMm2: z.number().positive(), izA: z.number().nonnegative(), izReferenceMethod: z.string() })).min(1),
}));

const protections = z.array(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SPD'), brand: z.string(), model: z.string(), side: z.enum(['DC', 'AC']), type: z.number().int(), poles: z.number().int(), ucV: z.number(), upKV: z.number(), inKA: z.number(), imaxKA: z.number(), iscpvKA: z.number().nullable(), source }),
  z.object({ kind: z.literal('DC_SWITCH'), brand: z.string(), model: z.string(), ratedVoltageV: z.number(), ratedCurrentA: z.number(), poles: z.number().int(), source }),
  z.object({ kind: z.literal('DC_FUSE'), brand: z.string(), model: z.string(), ratedVoltageV: z.number(), ratedCurrentA: z.number(), source }),
  z.object({ kind: z.literal('AC_BREAKER'), brand: z.string(), model: z.string(), ratedCurrentA: z.number(), curve: z.string().nullable(), breakingCapacityKA: z.number().nullable(), source }),
  z.object({ kind: z.literal('AC_ISOLATOR'), brand: z.string(), model: z.string(), ratedCurrentA: z.number(), source }),
]));

describe('curated catalog data', () => {
  it('cables.json is well-formed and every entry cites its source', () => {
    expect(() => cables.parse(read('cables.json'))).not.toThrow();
  });
  it('protections.json is well-formed and every entry cites its source', () => {
    expect(() => protections.parse(read('protections.json'))).not.toThrow();
  });
  it('every DC surge protector records its Iscpv', () => {
    const parsed = protections.parse(read('protections.json'));
    const dcSpds = parsed.filter((p) => p.kind === 'SPD' && p.side === 'DC');
    expect(dcSpds.length).toBeGreaterThan(0);
    expect(dcSpds.every((p) => p.kind === 'SPD' && p.iscpvKA !== null)).toBe(true);
  });
});
