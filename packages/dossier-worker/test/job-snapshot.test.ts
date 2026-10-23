import { describe, it, expect } from 'vitest';
import { parseJobSnapshot } from '../src/job-snapshot';

const validSnapshot = {
  version: 1,
  projectId: 'project-1',
  companyId: 'company-1',
  engineInput: { array: [], dcFuse: null, acIsolator: null },
  projectMeta: {
    moduleBrandModel: 'X', inverterBrandModel: 'Y', gridType: 'TT', mountingType: 'ROOF', structureMaterial: 'ALUMINUM', earthRodCount: 1, earthingMode: 'DEDICATED_ROD', buildingType: 'HOUSE', floors: 1,
    protections: { dcSwitch: 'S', dcSpd: 'P', dcFuse: null, acBreaker: 'B', acSpd: 'Q' },
    acBreakerFunction: 'disjoncteur différentiel 16 A, 30 mA type A',
  },
  client: { fullName: 'Ahmed', address: 'Tunis', stegReference: 'STEG-1' },
  cableRuns: [],
};

describe('parseJobSnapshot', () => {
  it('rejects a snapshot whose projectMeta lacks the protection references (queued before they existed)', () => {
    const oldMeta = { ...validSnapshot.projectMeta, protections: undefined, acBreakerFunction: undefined };
    expect(parseJobSnapshot({ ...validSnapshot, projectMeta: oldMeta })).toBeNull();
    expect(parseJobSnapshot({ ...validSnapshot, projectMeta: { ...validSnapshot.projectMeta, protections: { dcSwitch: 'S' } } })).toBeNull();
  });

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
      projectMeta: validSnapshot.projectMeta,
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

  it('reads the missing STEG pieces, defaulting to none for an older snapshot', () => {
    expect(parseJobSnapshot(validSnapshot)!.draftMissing).toEqual([]);
    expect(parseJobSnapshot({ ...validSnapshot, draftMissing: 'Copie de la CIN' })!.draftMissing).toEqual([]);
    expect(parseJobSnapshot({ ...validSnapshot, draftMissing: ['Copie de la CIN du titulaire', 7, ''] })!.draftMissing).toEqual([
      'Copie de la CIN du titulaire',
    ]);
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
    expect(parsed!.site).toMatchObject({ tiltDeg: 30, azimuthDeg: null, installationPointLat: null, installationPointLon: null, floors: null, roofOutline: null });
  });

  it('reads the roof contour from the site row, and drops a malformed one', () => {
    const roofOutline = [
      { lat: 36.8, lon: 10.2 },
      { lat: 36.8, lon: 10.2002 },
      { lat: 36.8002, lon: 10.2002 },
    ];
    const withRoof = parseJobSnapshot({ ...validSnapshot, site: { gpsLat: 36.8, gpsLon: 10.2, roofOutline } });
    const malformed = parseJobSnapshot({ ...validSnapshot, site: { gpsLat: 36.8, gpsLon: 10.2, roofOutline: [{ lat: 36.8 }] } });

    expect(withRoof!.site?.roofOutline).toEqual(roofOutline);
    expect(malformed!.site?.roofOutline).toBeNull();
  });

  it('reads the imported satellite photo and the points placed on it, and drops points off the photo', () => {
    const siteImagePoints = { field: { x: 0.5, y: 0.5 }, technicalRoom: { x: 0.6, y: 0.3 }, meter: { x: 0.2, y: 0.8 }, earthPit: null, roofOutline: null };
    const placed = parseJobSnapshot({ ...validSnapshot, site: { gpsLat: 36.8, gpsLon: 10.2, siteImageFileId: 'photo-1', siteImagePoints } });
    const offPhoto = parseJobSnapshot({ ...validSnapshot, site: { gpsLat: 36.8, gpsLon: 10.2, siteImageFileId: 'photo-1', siteImagePoints: { ...siteImagePoints, meter: { x: 1.5, y: 0.8 } } } });
    const older = parseJobSnapshot({ ...validSnapshot, site: { gpsLat: 36.8, gpsLon: 10.2 } });

    expect(placed!.site).toMatchObject({ siteImageFileId: 'photo-1', siteImagePoints });
    expect(offPhoto!.site?.siteImagePoints).toBeNull();
    expect(older!.site).toMatchObject({ siteImageFileId: null, siteImagePoints: null });
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
      projectMeta: validSnapshot.projectMeta,
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

  it('defaults the consumption to null and parses a stored one', () => {
    expect(parseJobSnapshot(validSnapshot)!.consumption).toBeNull();

    const consumption = { annualConsumptionKWh: 4800, source: 'BILL', billedKWh: 2400, monthsBilled: 6, periodStart: '2026-01-05', periodEnd: '2026-07-04' };
    expect(parseJobSnapshot({ ...validSnapshot, consumption })!.consumption).toEqual(consumption);
  });
});
