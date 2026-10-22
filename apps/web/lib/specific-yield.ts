import { db } from '@dossipv/db';
import { fetchPvgisSpecificYield } from '@dossipv/pvgis-client';

const DEFAULT_SPECIFIC_YIELD_KWH_PER_KWP = 1600;
const FALLBACK_WARNING = 'Estimation rapide : PVGIS momentanément indisponible, moyenne de 1 600 kWh/kWc utilisée. Le dossier utilisera la simulation PVGIS au point exact.';

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Yearly kWh per kWp for a site, cached per rounded position; falls back to a default when PVGIS fails. */
export async function getSpecificYield(
  lat: number,
  lon: number,
  tiltDeg: number,
  azimuthDeg: number,
): Promise<{ value: number; warning: string | null }> {
  const latRounded = roundToCents(lat);
  const lonRounded = roundToCents(lon);

  const cached = await db.pvgisYieldCache.findUnique({
    where: { latRounded_lonRounded_tiltDeg_azimuthDeg: { latRounded, lonRounded, tiltDeg, azimuthDeg } },
  });
  if (cached) {
    return { value: cached.specificYieldKWhPerKWp, warning: null };
  }

  try {
    const value = await fetchPvgisSpecificYield(latRounded, lonRounded, tiltDeg, azimuthDeg);
    await db.pvgisYieldCache.create({
      data: { latRounded, lonRounded, tiltDeg, azimuthDeg, specificYieldKWhPerKWp: value },
    });
    return { value, warning: null };
  } catch {
    return { value: DEFAULT_SPECIFIC_YIELD_KWH_PER_KWP, warning: FALLBACK_WARNING };
  }
}
