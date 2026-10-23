import L from 'leaflet';

export const POINT_STYLES = {
  field: { label: 'Champ PV', color: '#F5B800' },
  technicalRoom: { label: 'Local technique (onduleur)', color: '#1E6FD9' },
  meter: { label: 'Compteur STEG', color: '#D93025' },
  earthPit: { label: 'Piquet de terre', color: '#1E8E3E' },
} as const;

export type PointKind = keyof typeof POINT_STYLES;

/** A 24 px circle in the point's colour with a white border and a shadow, centred on the point. */
export function pointIcon(kind: PointKind): L.DivIcon {
  const { color, label } = POINT_STYLES[kind];
  return L.divIcon({
    className: '',
    html: `<div role="img" aria-label="${label}" style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.6);box-sizing:border-box"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/** The roof contour drawn on the Emplacements map; the dossier's plans use the same colour. */
export const ROOF_OUTLINE_STYLE = { label: 'Contour du toit', color: '#00B8D9' } as const;

/** A white dot ringed in the contour colour; the first corner is larger: touching it closes the contour. */
export function roofCornerIcon(first: boolean): L.DivIcon {
  const size = first ? 18 : 12;
  return L.divIcon({
    className: '',
    html: `<div role="img" aria-label="Sommet du contour du toit" style="width:${size}px;height:${size}px;border-radius:50%;background:#fff;border:3px solid ${ROOF_OUTLINE_STYLE.color};box-shadow:0 1px 3px rgba(0,0,0,.6);box-sizing:border-box"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
