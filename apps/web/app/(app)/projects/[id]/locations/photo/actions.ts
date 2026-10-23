'use server';

import { redirect } from 'next/navigation';
import sharp from 'sharp';
import { db, Prisma } from '@dossipv/db';
import { parseRoofOutline, parseSiteImagePoints, type GpsPoint, type PhotoPoint, type SiteImagePoints } from '@dossipv/engine';
import { getFilePath, saveFile, validateUploadedFile } from '@dossipv/file-storage';
import { siteImageUrl } from '../../../../../../lib/site-image';
import { requireOwnedProject, ProjectNotFoundError } from '../../../../../../lib/project-access';
import { siteImagePointsProblem } from '../../../../../../lib/site-points';

const NOT_FOUND = 'Projet introuvable.';
/** A capture smaller than this cannot beat the Mapbox photo it replaces. */
const MIN_SITE_IMAGE_SIDE_PX = 400;
/** Larger captures are scaled down: the plan prints the photo about 15 cm wide. */
const MAX_SITE_IMAGE_SIDE_PX = 4096;

async function owns(projectId: string): Promise<boolean> {
  try {
    await requireOwnedProject(projectId);
    return true;
  } catch (error) {
    if (error instanceof ProjectNotFoundError) return false;
    throw error;
  }
}

export interface SiteImageUploadResult {
  error?: string;
  image?: { url: string; widthPx: number; heightPx: number };
}

/**
 * Stores the installer's own satellite photo of the site (a Google Maps capture, ideally) as a
 * JPEG, upright and at most MAX_SITE_IMAGE_SIDE_PX on its long side. It replaces the previous
 * photo, and the points placed on that one: until they are placed again on this one, the dossier
 * keeps the Mapbox imagery.
 */
export async function uploadSiteImageAction(projectId: string, formData: FormData): Promise<SiteImageUploadResult> {
  if (!(await owns(projectId))) return { error: NOT_FOUND };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choisissez une image PNG ou JPEG.' };
  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateUploadedFile(buffer, file.type, file.size, { allowWebp: true });
  if (!validation.valid) return { error: validation.error };
  if (validation.mimeType === 'pdf') return { error: 'Choisissez une image PNG ou JPEG, pas un PDF.' };

  let jpeg: { data: Buffer; info: { width: number; height: number } };
  try {
    jpeg = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_SITE_IMAGE_SIDE_PX, height: MAX_SITE_IMAGE_SIDE_PX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return { error: 'Image illisible : choisissez une capture PNG ou JPEG.' };
  }
  if (Math.max(jpeg.info.width, jpeg.info.height) < MIN_SITE_IMAGE_SIDE_PX) {
    return { error: `Image trop petite : la capture doit faire au moins ${MIN_SITE_IMAGE_SIDE_PX} pixels de large.` };
  }

  const { storageKey } = await saveFile(jpeg.data, 'photo-satellite.jpg', 'image/jpeg');
  const stored = await db.file.create({ data: { fileName: 'photo-satellite.jpg', mimeType: 'jpeg', storageKey } });
  await db.projectSite.update({ where: { projectId }, data: { siteImageFileId: stored.id, siteImagePoints: Prisma.DbNull } });
  return { image: { url: siteImageUrl(projectId, stored.id), widthPx: jpeg.info.width, heightPx: jpeg.info.height } };
}

/** Takes the photo off the project: the dossier goes back to the Mapbox imagery. */
export async function removeSiteImageAction(projectId: string): Promise<{ error?: string }> {
  if (!(await owns(projectId))) return { error: NOT_FOUND };
  await db.projectSite.update({ where: { projectId }, data: { siteImageFileId: null, siteImagePoints: Prisma.DbNull } });
  return {};
}

const point = (lat: number | null, lon: number | null): GpsPoint | null => (lat !== null && lon !== null ? { lat, lon } : null);

/**
 * Saves where the installer placed the points and drew the roof on their photo (fractions of its
 * width and height), once they agree with the map, and opens the summary.
 */
export async function saveSiteImagePointsAction(projectId: string, payload: SiteImagePoints): Promise<{ error: string } | undefined> {
  if (!(await owns(projectId))) return { error: NOT_FOUND };
  const photo = parseSiteImagePoints(payload);
  if (!photo) return { error: 'Points de la photo invalides.' };

  const site = await db.projectSite.findUnique({ where: { projectId }, include: { siteImage: { select: { storageKey: true } } } });
  if (!site) return { error: NOT_FOUND };
  if (!site.siteImage) return { error: 'Importez d’abord la capture Google Maps.' };
  const map = {
    field: point(site.installationPointLat, site.installationPointLon),
    technicalRoom: point(site.technicalRoomPointLat, site.technicalRoomPointLon),
    meter: point(site.meterPointLat, site.meterPointLon),
    earthPit: point(site.earthPitPointLat, site.earthPitPointLon),
  };
  if (!map.field || !map.technicalRoom || !map.meter) return { error: 'Placez d’abord les points sur la carte (étape 1).' };

  let size: { widthPx: number; heightPx: number };
  try {
    const { width, height } = await sharp(getFilePath(site.siteImage.storageKey)).metadata();
    if (!width || !height) throw new Error('no size');
    size = { widthPx: width, heightPx: height };
  } catch {
    return { error: 'Capture illisible : importez-la de nouveau.' };
  }
  const problem = siteImagePointsProblem(map, parseRoofOutline(site.roofOutline) !== null, photo, size);
  if (problem) return { error: problem };

  const xy = (p: PhotoPoint | null): { x: number; y: number } | null => (p ? { x: p.x, y: p.y } : null);
  const stored = {
    field: xy(photo.field),
    technicalRoom: xy(photo.technicalRoom),
    meter: xy(photo.meter),
    earthPit: xy(photo.earthPit),
    roofOutline: photo.roofOutline ? photo.roofOutline.map((p) => ({ x: p.x, y: p.y })) : null,
  };
  await db.projectSite.update({ where: { projectId }, data: { siteImagePoints: stored } });
  redirect(`/projects/${projectId}/summary`);
}
