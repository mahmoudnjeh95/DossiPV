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
