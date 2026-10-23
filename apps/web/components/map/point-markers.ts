import L from 'leaflet';
import { SITE_POINT_LABELS } from '../../lib/site-points';

export const POINT_STYLES = {
  field: { label: SITE_POINT_LABELS.field, tag: 'Champ PV', color: '#F5B800' },
  technicalRoom: { label: SITE_POINT_LABELS.technicalRoom, tag: 'Local technique', color: '#1E6FD9' },
  meter: { label: SITE_POINT_LABELS.meter, tag: 'Compteur STEG', color: '#D93025' },
  earthPit: { label: SITE_POINT_LABELS.earthPit, tag: 'Piquet de terre', color: '#1E8E3E' },
} as const;

export type PointKind = keyof typeof POINT_STYLES;

const PIN_WIDTH = 34;
const PIN_HEIGHT = 44;
// A teardrop whose tip (17, 43) is the point itself.
const PIN_PATH = 'M17 43C17 43 3 27.5 3 16a14 14 0 1 1 28 0c0 11.5-14 27-14 27z';

/** What each point is, drawn in white inside its pin (24 px box centred on 17, 16). */
const GLYPHS: Record<PointKind, string> = {
  // A PV module: cells in a frame.
  field: 'M10 11h14v10H10z M14.7 11v10 M19.3 11v10 M10 16h14',
  // The inverter symbol: = above the diagonal, ~ below it.
  technicalRoom: 'M10 9.5h14v13H10z M10 22.5L24 9.5 M12 13h4 M12 15h4 M17.5 19.5c.9-1.3 1.9-1.3 2.8 0s1.9 1.3 2.8 0',
  // A meter dial with its needle.
  meter: 'M10.5 19a6.5 6.5 0 1 1 13 0 M17 19l3.2-4.6 M10 21.5h14',
  // The earth symbol.
  earthPit: 'M17 8.5v6.5 M11 15h12 M13.2 18.2h7.6 M15.4 21.4h3.2',
};

/** The point's pin as standalone SVG markup, `height` px tall (also used for legend swatches). */
export function pointPinSvg(kind: PointKind, height = PIN_HEIGHT): string {
  const { color } = POINT_STYLES[kind];
  const width = (height * PIN_WIDTH) / PIN_HEIGHT;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${PIN_WIDTH} ${PIN_HEIGHT}" aria-hidden="true" style="display:block;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">` +
    `<path d="${PIN_PATH}" fill="${color}" stroke="#fff" stroke-width="2.5"/>` +
    `<path d="${GLYPHS[kind]}" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>` +
    '</svg>'
  );
}

/**
 * A location tag: the pin, its tip on the point, with what the point is written beside it, so
 * the map reads without a legend. `active` marks the point the current tool would move (the
 * Emplacements map shows its tag even when the others are hidden).
 */
export function pointIcon(kind: PointKind, { active = false }: { active?: boolean } = {}): L.DivIcon {
  const { color, label, tag } = POINT_STYLES[kind];
  return L.divIcon({
    className: active ? 'pin pin-active' : 'pin',
    html:
      `<div role="img" aria-label="${label}" style="position:relative;width:${PIN_WIDTH}px;height:${PIN_HEIGHT}px">` +
      pointPinSvg(kind) +
      `<span class="pin-tag" style="position:absolute;left:${PIN_WIDTH - 4}px;top:6px;white-space:nowrap;background:#fff;color:#1a1a1a;border:2px solid ${color};border-radius:10px;padding:0 7px;font:600 11px/16px system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.4)">${tag}</span>` +
      '</div>',
    iconSize: [PIN_WIDTH, PIN_HEIGHT],
    iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT - 1],
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
