import {
  fitSiteImage,
  isSimplePolygon,
  photoPixels,
  siteImageFitIssue,
  SITE_POINT_KINDS,
  type GpsPoint,
  type SiteImagePoints,
  type SitePointKind,
} from '@dossipv/engine';

/** What each point is, as the installer reads it on the map, on the photo and in messages. */
export const SITE_POINT_LABELS: Record<SitePointKind, string> = {
  field: 'Champ PV',
  technicalRoom: 'Local technique (onduleur)',
  meter: 'Compteur STEG',
  earthPit: 'Piquet de terre',
};

/**
 * What stands between the photo's points and the dossier, in French, or null. Every point placed
 * on the map must be on the photo, and the roof too when one was drawn on the map; the points
 * then give the photo its scale (the lengths stay measured on the map), so they must agree with
 * the map: each one within a few metres of where the map has it.
 */
export function siteImagePointsProblem(
  map: Record<SitePointKind, GpsPoint | null>,
  mapHasRoof: boolean,
  photo: SiteImagePoints,
  size: { widthPx: number; heightPx: number },
): string | null {
  for (const kind of SITE_POINT_KINDS) {
    if (map[kind] && !photo[kind]) return `Placez le point « ${SITE_POINT_LABELS[kind]} » sur la photo.`;
  }
  if (mapHasRoof && !photo.roofOutline) return 'Tracez le contour du toit sur la photo.';
  // Whether edges cross does not depend on the scale: the fractions, stretched to the photo's proportions, will do.
  if (photo.roofOutline && !isSimplePolygon(photo.roofOutline.map((p) => ({ lat: -p.y, lon: (p.x * size.widthPx) / size.heightPx })))) {
    return 'Le contour du toit se croise sur la photo : déplacez ses sommets pour suivre le bord du toit.';
  }
  const fit = fitSiteImage(map, photoPixels(photo, size.widthPx, size.heightPx));
  if (!fit) return "Les points sont trop proches pour mettre la photo à l'échelle : placez-les aux bons endroits.";
  const issue = siteImageFitIssue(fit);
  if (issue?.kind === 'scale') return "L'échelle de la photo est invraisemblable : vérifiez que chaque point est au bon endroit.";
  if (issue?.kind === 'mismatch') {
    // One misplaced point pulls the others off too: name the one furthest off.
    const kind = issue.points.reduce((worst, k) => (fit.mismatchM[k]! > fit.mismatchM[worst]! ? k : worst));
    return `Le point « ${SITE_POINT_LABELS[kind]} » n'est pas au même endroit que sur la carte (écart de ${Math.round(fit.mismatchM[kind]!)} m) : replacez-le sur la photo.`;
  }
  return null;
}
