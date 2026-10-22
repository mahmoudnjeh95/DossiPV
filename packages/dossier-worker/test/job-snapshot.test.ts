import { describe, it, expect } from 'vitest';
import { parseJobSnapshot } from '../src/job-snapshot';

const validSnapshot = {
  version: 1,
  projectId: 'project-1',
  companyId: 'company-1',
  engineInput: { array: [], dcFuse: null, acIsolator: null },
  projectMeta: { moduleBrandModel: 'X', inverterBrandModel: 'Y', gridType: 'TT', mountingType: 'ROOF', structureMaterial: 'ALUMINUM', earthRodCount: 1 },
  client: { fullName: 'Ahmed', address: 'Tunis', stegReference: 'STEG-1' },
  cableRuns: [],
};

describe('parseJobSnapshot', () => {
  it('parses a valid snapshot into its typed shape', () => {
    const result = parseJobSnapshot(validSnapshot);
    expect(result?.projectId).toBe('project-1');
    expect(result?.engineInput).toEqual({ array: [], dcFuse: null, acIsolator: null });
  });

  it('returns null (never throws) for null input', () => {
    expect(parseJobSnapshot(null)).toBeNull();
  });

  it('returns null (never throws) for a string', () => {
    expect(parseJobSnapshot('not an object')).toBeNull();
  });

  it('returns null for an object missing required fields', () => {
    expect(parseJobSnapshot({ version: 1, projectId: 'p1' })).toBeNull();
  });

  it('returns null for an object with the wrong version number', () => {
    expect(parseJobSnapshot({ ...validSnapshot, version: 2 })).toBeNull();
  });

  it('extracts site, arrayConfig, protections, structure, earthing, dossierNumber, dossierDate, and tier', () => {
    const raw = {
      version: 1,
      projectId: 'p1',
      companyId: 'c1',
      tier: 'PREMIUM',
      dossierNumber: '434-303',
      dossierDate: '2026-11-25T00:00:00.000Z',
      engineInput: {},
      projectMeta: {},
      client: null,
      cableRuns: [],
      site: { gpsLat: 36.8, gpsLon: 10.2, technicalRoomPointLat: 36.801, technicalRoomPointLon: 10.201, meterPointLat: 36.799, meterPointLon: 10.199, earthPitPointLat: 36.8005, earthPitPointLon: 10.2005 },
      arrayConfig: { module: { brand: 'LONGi', model: 'LR7-72HGD-620M' }, inverters: [{ inverter: { brand: 'Sofar', model: '1-4KTL2-G3' }, mppts: [{ stringsInParallel: 1, modulesPerString: 5 }] }] },
      protections: { dcSwitch: { brand: 'ZJ BENY', model: 'BB1H-63' } },
      structure: { material: 'ALUMINIUM', frameCount: 5 },
      earthing: { rodCount: 3, distributionBlock: { brand: 'Generic', model: 'DB-1', datasheetFileId: 'file-db' } },
      cablingConfig: { connector: { brand: 'Stäubli', model: 'MC4', datasheetFileId: 'file-connector' }, cableTray: null },
    };

    const parsed = parseJobSnapshot(raw);

    expect(parsed).not.toBeNull();
    expect(parsed!.tier).toBe('PREMIUM');
    expect(parsed!.dossierNumber).toBe('434-303');
    expect(parsed!.dossierDate).toBe('2026-11-25T00:00:00.000Z');
    expect(parsed!.site?.technicalRoomPointLat).toBe(36.801);
    expect(parsed!.arrayConfig?.module.brand).toBe('LONGi');
    expect(parsed!.protections?.dcSwitch?.brand).toBe('ZJ BENY');
    expect(parsed!.structure?.frameCount).toBe(5);
    expect(parsed!.earthing?.rodCount).toBe(3);
    expect(parsed!.earthing?.distributionBlock?.brand).toBe('Generic');
    expect(parsed!.cablingConfig?.connector?.brand).toBe('Stäubli');
    expect(parsed!.cablingConfig?.cableTray).toBeNull();
  });

  it('parses a pre-round-2 snapshot', () => {
    const parsed = parseJobSnapshot({
      ...validSnapshot,
      site: { gpsLat: 36.8, gpsLon: 10.2, tiltDeg: 30 },
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.client).toEqual({
      fullName: 'Ahmed',
      address: 'Tunis',
      stegReference: 'STEG-1',
      cin: null,
      annualConsumptionKWh: null,
      subscribedPowerKVA: null,
    });
    expect(parsed!.site).toMatchObject({ tiltDeg: 30, azimuthDeg: null, installationPointLat: null, installationPointLon: null, floors: null });
  });

  it('reads tilt and installation point from the site row', () => {
    const parsed = parseJobSnapshot({
      ...validSnapshot,
      client: { ...validSnapshot.client, cin: '01234567', annualConsumptionKWh: 4200, subscribedPowerKVA: 6, phone: '20000000' },
      site: {
        gpsLat: 36.8,
        gpsLon: 10.2,
        tiltDeg: 25,
        azimuthDeg: -15,
        installationPointLat: 36.8003,
        installationPointLon: 10.2004,
        floors: 2,
        gridType: 'TT',
      },
    });

    expect(parsed!.site).toMatchObject({ tiltDeg: 25, azimuthDeg: -15, installationPointLat: 36.8003, installationPointLon: 10.2004, floors: 2 });
    expect(parsed!.client).toEqual({
      fullName: 'Ahmed',
      address: 'Tunis',
      stegReference: 'STEG-1',
      cin: '01234567',
      annualConsumptionKWh: 4200,
      subscribedPowerKVA: 6,
    });
  });

  it('parses a client without a full name as no client', () => {
    expect(parseJobSnapshot({ ...validSnapshot, client: { address: 'Tunis' } })!.client).toBeNull();
  });

  it('still parses a snapshot missing the new optional fields (back-compat with narrower snapshots already in the DB)', () => {
    const raw = {
      version: 1,
      projectId: 'p1',
      companyId: 'c1',
      engineInput: {},
      projectMeta: {},
      client: null,
      cableRuns: [],
    };

    const parsed = parseJobSnapshot(raw);

    expect(parsed).not.toBeNull();
    expect(parsed!.site).toBeNull();
    expect(parsed!.arrayConfig).toBeNull();
    expect(parsed!.cablingConfig).toBeNull();
    expect(parsed!.tier).toBe('STANDARD');
  });
});
