import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Prisma } from '@dossipv/db';
import type { SiteImagePoints } from '@dossipv/engine';

const m = vi.hoisted(() => ({
  mockRequireOwnedProject: vi.fn(),
  mockSiteUpdate: vi.fn(),
  mockSiteFindUnique: vi.fn(),
  mockFileCreate: vi.fn(),
  mockSaveFile: vi.fn(),
  mockGetFilePath: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: m.mockRedirect }));
vi.mock('@dossipv/db', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/db')>('@dossipv/db');
  return {
    ...actual,
    db: { ...actual.db, projectSite: { update: m.mockSiteUpdate, findUnique: m.mockSiteFindUnique }, file: { create: m.mockFileCreate } },
  };
});
vi.mock('@dossipv/file-storage', async () => {
  const actual = await vi.importActual<typeof import('@dossipv/file-storage')>('@dossipv/file-storage');
  return { ...actual, saveFile: m.mockSaveFile, getFilePath: m.mockGetFilePath };
});
vi.mock('../lib/project-access', async () => {
  const actual = await vi.importActual<typeof import('../lib/project-access')>('../lib/project-access');
  return { ...actual, requireOwnedProject: m.mockRequireOwnedProject };
});

import sharp from 'sharp';
import { removeSiteImageAction, saveSiteImagePointsAction, uploadSiteImageAction } from '../app/(app)/projects/[id]/locations/photo/actions';

// The map points (step 1) and a 1 000 x 800 px north-up capture of them at zoom 20.
const map = {
  field: { lat: 34.7734, lon: 10.7825 },
  technicalRoom: { lat: 34.7736, lon: 10.7826 },
  meter: { lat: 34.7733, lon: 10.78234 },
};
const SIZE = { widthPx: 1000, heightPx: 800 };
const ZOOM = 20;
function worldPixel(p: { lat: number; lon: number }): { x: number; y: number } {
  const scale = 256 * 2 ** ZOOM;
  const latRad = (p.lat * Math.PI) / 180;
  return { x: ((p.lon + 180) / 360) * scale, y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale };
}
const centre = worldPixel(map.field);
const onPhoto = (p: { lat: number; lon: number }): { x: number; y: number } => {
  const w = worldPixel(p);
  return { x: (w.x - centre.x + SIZE.widthPx / 2) / SIZE.widthPx, y: (w.y - centre.y + SIZE.heightPx / 2) / SIZE.heightPx };
};
const placed: SiteImagePoints = {
  field: onPhoto(map.field),
  technicalRoom: onPhoto(map.technicalRoom),
  meter: onPhoto(map.meter),
  earthPit: null,
  roofOutline: null,
};
const roof = [
  { x: 0.4, y: 0.4 },
  { x: 0.6, y: 0.4 },
  { x: 0.6, y: 0.6 },
  { x: 0.4, y: 0.6 },
];

function site(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    installationPointLat: map.field.lat,
    installationPointLon: map.field.lon,
    technicalRoomPointLat: map.technicalRoom.lat,
    technicalRoomPointLon: map.technicalRoom.lon,
    meterPointLat: map.meter.lat,
    meterPointLon: map.meter.lon,
    earthPitPointLat: null,
    earthPitPointLon: null,
    roofOutline: null,
    siteImage: { storageKey: 'equipment/photo.jpg' },
    ...overrides,
  };
}

let photoPath: string;
beforeAll(async () => {
  photoPath = join(mkdtempSync(join(tmpdir(), 'site-photo-')), 'photo.jpg');
  writeFileSync(photoPath, await sharp({ create: { width: SIZE.widthPx, height: SIZE.heightPx, channels: 3, background: { r: 120, g: 130, b: 140 } } }).jpeg().toBuffer());
});

beforeEach(() => {
  vi.clearAllMocks();
  m.mockRequireOwnedProject.mockResolvedValue({ id: 'p1', companyId: 'c1', tier: 'STANDARD', status: 'DRAFT' });
  m.mockGetFilePath.mockImplementation(() => photoPath);
  m.mockSiteFindUnique.mockResolvedValue(site());
});

describe('saveSiteImagePointsAction', () => {
  const siteData = (): Record<string, unknown> => (m.mockSiteUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;

  it('saves the points placed where the map has them, then opens the summary', async () => {
    await expect(saveSiteImagePointsAction('p1', placed)).rejects.toThrow('NEXT_REDIRECT:/projects/p1/summary');

    expect(siteData()).toEqual({ siteImagePoints: { ...placed } });
  });

  it('saves the roof drawn on the photo when the map has one', async () => {
    m.mockSiteFindUnique.mockResolvedValue(site({ roofOutline: [{ lat: 34.7734, lon: 10.7825 }, { lat: 34.7735, lon: 10.7825 }, { lat: 34.7735, lon: 10.7826 }] }));

    expect(await saveSiteImagePointsAction('p1', placed)).toEqual({ error: 'Tracez le contour du toit sur la photo.' });
    await expect(saveSiteImagePointsAction('p1', { ...placed, roofOutline: roof })).rejects.toThrow('NEXT_REDIRECT:/projects/p1/summary');
    expect(siteData()).toEqual({ siteImagePoints: { ...placed, roofOutline: roof } });
  });

  it.each([
    ['a map point not placed on the photo', { ...placed, meter: null }, 'Placez le point « Compteur STEG » sur la photo.'],
    ['a crossing roof', { ...placed, roofOutline: [roof[0]!, roof[2]!, roof[1]!, roof[3]!] }, 'Le contour du toit se croise sur la photo : déplacez ses sommets pour suivre le bord du toit.'],
  ])('refuses %s', async (_label, points, error) => {
    expect(await saveSiteImagePointsAction('p1', points)).toEqual({ error });
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('names a point placed away from where the map has it, with how far', async () => {
    // The meter put 25 m east of its map position.
    const metresPerPx = (156543.03392 * Math.cos((34.7734 * Math.PI) / 180)) / 2 ** ZOOM;
    const offMeter = { ...placed, meter: { x: placed.meter!.x + 25 / metresPerPx / SIZE.widthPx, y: placed.meter!.y } };

    const result = await saveSiteImagePointsAction('p1', offMeter);

    expect(result?.error).toMatch(/^Le point « Compteur STEG » n'est pas au même endroit que sur la carte \(écart de \d+ m\) : replacez-le sur la photo\.$/);
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });

  it('refuses points with no photo imported, or off the photo', async () => {
    m.mockSiteFindUnique.mockResolvedValue(site({ siteImage: null }));
    expect(await saveSiteImagePointsAction('p1', placed)).toEqual({ error: 'Importez d’abord la capture Google Maps.' });
    expect(await saveSiteImagePointsAction('p1', { ...placed, field: { x: 1.4, y: 0.5 } })).toEqual({ error: 'Points de la photo invalides.' });
  });
});

describe('removeSiteImageAction', () => {
  it('takes the photo and its points off the project', async () => {
    expect(await removeSiteImageAction('p1')).toEqual({});
    expect(m.mockSiteUpdate).toHaveBeenCalledWith({ where: { projectId: 'p1' }, data: { siteImageFileId: null, siteImagePoints: Prisma.DbNull } });
  });
});

describe('uploadSiteImageAction', () => {
  async function upload(file: File): Promise<Awaited<ReturnType<typeof uploadSiteImageAction>>> {
    const form = new FormData();
    form.append('file', file);
    return uploadSiteImageAction('p1', form);
  }

  async function png(width: number, height: number): Promise<File> {
    const bytes = await sharp({ create: { width, height, channels: 4, background: { r: 120, g: 130, b: 140, alpha: 1 } } }).png().toBuffer();
    return new File([new Uint8Array(bytes)], 'capture.png', { type: 'image/png' });
  }

  beforeEach(() => {
    m.mockSaveFile.mockResolvedValue({ storageKey: 'equipment/photo.jpg' });
    m.mockFileCreate.mockResolvedValue({ id: 'photo-9' });
  });

  it('stores a capture as JPEG, forgets the points placed on the previous one and gives the browser its URL and size', async () => {
    const result = await upload(await png(1600, 900));

    expect(result).toEqual({ image: { url: '/projects/p1/site-image?v=photo-9', widthPx: 1600, heightPx: 900 } });
    const saved = m.mockSaveFile.mock.calls[0]![0] as Buffer;
    expect([...saved.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(m.mockFileCreate).toHaveBeenCalledWith({ data: { fileName: 'photo-satellite.jpg', mimeType: 'jpeg', storageKey: 'equipment/photo.jpg' } });
    expect(m.mockSiteUpdate).toHaveBeenCalledWith({ where: { projectId: 'p1' }, data: { siteImageFileId: 'photo-9', siteImagePoints: Prisma.DbNull } });
  });

  it('scales a very large capture down to 4 096 px', async () => {
    const result = await upload(await png(5000, 2500));

    expect(result.image).toMatchObject({ widthPx: 4096, heightPx: 2048 });
  });

  it.each([
    ['a capture too small to help', (): Promise<File> => png(300, 200), 'Image trop petite : la capture doit faire au moins 400 pixels de large.'],
    ['a PDF', (): Promise<File> => Promise.resolve(new File([new Uint8Array(Buffer.from('%PDF-1.4 fake'))], 'plan.pdf', { type: 'application/pdf' })), 'Choisissez une image PNG ou JPEG, pas un PDF.'],
    ['bytes that are not the declared image', (): Promise<File> => Promise.resolve(new File([new Uint8Array(Buffer.from('not a png'))], 'fake.png', { type: 'image/png' })), 'Le contenu du fichier ne correspond pas au type déclaré.'],
    ['no file', (): Promise<File> => Promise.resolve(new File([], 'empty.png', { type: 'image/png' })), 'Choisissez une image PNG ou JPEG.'],
  ])('refuses %s without storing anything', async (_label, makeFile, error) => {
    expect(await upload(await makeFile())).toEqual({ error });
    expect(m.mockSaveFile).not.toHaveBeenCalled();
    expect(m.mockSiteUpdate).not.toHaveBeenCalled();
  });
});
