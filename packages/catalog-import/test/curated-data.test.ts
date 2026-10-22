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
  z.object({
    kind: z.literal('AC_BREAKER'), brand: z.string(), model: z.string(), ratedCurrentA: z.number(), curve: z.string().nullable(), breakingCapacityKA: z.number().nullable(),
    residualCurrentMA: z.number().int().positive().nullable().optional(), rcdType: z.enum(['AC', 'A', 'F', 'B']).nullable().optional(), source,
  }).strict(),
  z.object({ kind: z.literal('AC_ISOLATOR'), brand: z.string(), model: z.string(), ratedCurrentA: z.number(), source }),
]));

const accessories = z.array(z.object({
  kind: z.enum(['MC4_CONNECTOR', 'DISTRIBUTION_BLOCK', 'CABLE_TRAY', 'DC_ENCLOSURE', 'AC_ENCLOSURE', 'EARTH_ROD', 'OTHER']),
  brand: z.string(), model: z.string(), spec: z.string().nullable(), source,
}));

describe('curated catalog data', () => {
  it('accessories.json is well-formed and covers connector, earthing block and cable tray', () => {
    const parsed = accessories.parse(read('accessories.json'));
    expect(parsed.map((a) => a.kind)).toEqual(expect.arrayContaining(['MC4_CONNECTOR', 'DISTRIBUTION_BLOCK', 'CABLE_TRAY']));
  });
  it('cables.json is well-formed and every entry cites its source', () => {
    expect(() => cables.parse(read('cables.json'))).not.toThrow();
  });
  it('protections.json is well-formed and every entry cites its source', () => {
    expect(() => protections.parse(read('protections.json'))).not.toThrow();
  });
  it('has at least four 30 mA type A differential breakers (1P+N) of the brands sold in Tunisia, rated 16 to 32 A', () => {
    const parsed = protections.parse(read('protections.json'));
    const differential = parsed.filter((p) => p.kind === 'AC_BREAKER' && p.residualCurrentMA === 30 && p.rcdType === 'A');
    expect(differential.length).toBeGreaterThanOrEqual(4);
    for (const breaker of differential) {
      expect(['Hager', 'Schneider Electric', 'Legrand', 'SIAME']).toContain(breaker.brand);
      expect(breaker.kind === 'AC_BREAKER' && breaker.curve !== null && breaker.breakingCapacityKA !== null).toBe(true);
    }
    expect(new Set(differential.map((p) => p.kind === 'AC_BREAKER' && p.ratedCurrentA))).toEqual(new Set([16, 20, 25, 32]));
  });

  it('every DC surge protector records its Iscpv', () => {
    const parsed = protections.parse(read('protections.json'));
    const dcSpds = parsed.filter((p) => p.kind === 'SPD' && p.side === 'DC');
    expect(dcSpds.length).toBeGreaterThan(0);
    expect(dcSpds.every((p) => p.kind === 'SPD' && p.iscpvKA !== null)).toBe(true);
  });
});
