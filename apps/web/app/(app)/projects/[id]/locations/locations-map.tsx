'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L, {
  type DivIcon,
  type LeafletEvent,
  type LeafletMouseEvent,
  type Marker as LeafletMarker,
} from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIVE_MAP_PROVIDER } from '../map/esri-provider';
import { SiteTileLayer } from '../map/site-tile-layer';
import {
  POINT_STYLES,
  ROOF_OUTLINE_STYLE,
  pointIcon,
  pointPinSvg,
  roofCornerIcon,
  type PointKind,
} from '../../../../../components/map/point-markers';
import {
  computeRunLengthsM,
  groundDistanceM,
  isInsideBounds,
  isSimplePolygon,
  polygonAreaM2,
  polygonCentroid,
  type SiteImageBounds,
} from '@dossipv/engine';
import type { BuildingTypeValue } from '../../../../../lib/building-type';
import { saveLocationsAction, uploadSiteImageAction } from './actions';
import { SiteImageOverlay, type SiteImageState } from './site-image-overlay';

type Point = { lat: number; lon: number };
type Points = Record<PointKind, Point | null>;
/** What a tap on the map does: place a point, add a roof corner, or (photo) nothing — its handles move it. */
type Tool = PointKind | 'roof' | 'photo';

const KINDS: PointKind[] = ['field', 'technicalRoom', 'meter', 'earthPit'];
const HOUSE_MAX_FLOORS = 3;
const BUILDING_MAX_FLOORS = 15;
/** Zoom from which the points stand apart enough for every name tag to show. */
const ALL_TAGS_ZOOM = 20;
/** A cable run shorter than this on screen keeps its length in the checklist: its label would cover the pins. */
const MIN_LABELLED_LEG_PX = 90;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

const SHORT_LABELS: Record<PointKind, string> = {
  field: 'Champ PV',
  technicalRoom: 'Onduleur',
  meter: 'Compteur',
  earthPit: 'Terre',
};
const PLACE_HINTS: Record<PointKind, string> = {
  field: 'Touchez la carte là où seront posés les panneaux.',
  technicalRoom: "Touchez la carte là où sera l'onduleur (local technique).",
  meter: 'Touchez la carte sur le compteur STEG.',
  earthPit: 'Touchez la carte là où sera planté le piquet de terre.',
};
// Conductor colours of the dossier's implantation plan.
const LEG_COLOURS = { dc: '#CC0000', ac: '#8C4512', earth: '#1A8C33' };

function floorLabel(level: number): string {
  return level === 0 ? 'RDC' : `R+${level}`;
}

export interface LocationsMapProps {
  projectId: string;
  center: Point;
  initial: Points;
  /** The saved roof contour; null when none was drawn. */
  initialRoofOutline: Point[] | null;
  /** The imported satellite photo and where it was aligned (null bounds: not aligned yet). */
  initialSiteImage: { url: string; bounds: SiteImageBounds | null } | null;
  initialFloors: number | null;
  initialBuildingType: BuildingTypeValue | null;
}

function ClickHandler({ onClick }: { onClick: (point: Point) => void }): null {
  useMapEvents({
    click: (event: LeafletMouseEvent) => onClick({ lat: event.latlng.lat, lon: event.latlng.lng }),
  });
  return null;
}

function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }): null {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
}

/** On opening: the placed points and the roof fill the view; else the building, close up. */
function FitOnOpen({ points, center }: { points: Point[]; center: Point }): null {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon])), {
        padding: [90, 90],
        maxZoom: 19,
      });
    } else {
      map.setView(points[0] ? [points[0].lat, points[0].lon] : [center.lat, center.lon], 19);
    }
  }, [map, points, center]);
  return null;
}

/** Leaflet measures its container once: tell it when the workspace is resized. */
function SizeWatcher({ height }: { height: number }): null {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [map, height]);
  return null;
}

/** The point's map pin, small, for its tool button and the checklist. */
function PinSwatch({ kind }: { kind: PointKind }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-block' }}
      dangerouslySetInnerHTML={{ __html: pointPinSvg(kind, 20) }}
    />
  );
}

function RoofSwatch(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 12,
        border: `3px solid ${ROOF_OUTLINE_STYLE.color}`,
        background: 'rgba(0,184,217,.15)',
        display: 'inline-block',
        boxSizing: 'border-box',
      }}
    />
  );
}

/**
 * The Emplacements workspace: the map fills the screen; a toolbar over it picks what the next tap
 * places (any order), a hint says what to do, a checklist tracks what is placed and the cable
 * lengths, and the footer holds the building, the roof level and the save button.
 */
export function LocationsMap({
  projectId,
  center,
  initial,
  initialRoofOutline,
  initialSiteImage,
  initialFloors,
  initialBuildingType,
}: LocationsMapProps): React.JSX.Element {
  const [points, setPoints] = useState<Points>(initial);
  const [tool, setTool] = useState<Tool | null>(null);
  const [roof, setRoof] = useState<Point[]>(initialRoofOutline ?? []);
  const [siteImage, setSiteImage] = useState<SiteImageState | null>(
    initialSiteImage ? { ...initialSiteImage, aspect: null } : null,
  );
  const [photoOpacity, setPhotoOpacity] = useState(0.85);
  const [uploading, setUploading] = useState(false);
  const [floors, setFloors] = useState<number | null>(initialFloors);
  const [buildingType, setBuildingType] = useState<BuildingTypeValue | null>(initialBuildingType);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'danger' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(19);
  const [locating, setLocating] = useState(false);
  const [height, setHeight] = useState(560);
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const mapRef = useRef<L.Map | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const icons = useMemo(
    () => ({
      normal: Object.fromEntries(KINDS.map((kind) => [kind, pointIcon(kind)])) as Record<
        PointKind,
        DivIcon
      >,
      active: Object.fromEntries(
        KINDS.map((kind) => [kind, pointIcon(kind, { active: true })]),
      ) as Record<PointKind, DivIcon>,
    }),
    [],
  );
  const cornerIcons = useMemo(
    () => ({ first: roofCornerIcon(true), other: roofCornerIcon(false) }),
    [],
  );
  const initialView = useMemo(
    () =>
      [...KINDS.map((kind) => initial[kind]), ...(initialRoofOutline ?? [])].filter(
        (p): p is Point => p !== null,
      ),
    [initial, initialRoofOutline],
  );
  const canLocate =
    typeof window !== 'undefined' && window.isSecureContext && 'geolocation' in navigator;

  // The workspace takes the rest of the screen: nothing to scroll to reach the map or the save button.
  useLayoutEffect(() => {
    const measure = (): void => {
      const el = workspaceRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(460, Math.round(window.innerHeight - top - 12)));
    };
    measure();
    window.addEventListener('resize', measure);
    return (): void => window.removeEventListener('resize', measure);
  }, []);

  // The checklist starts folded on a phone, where it would hide the map.
  useEffect(() => {
    setChecklistOpen(window.matchMedia('(min-width: 701px)').matches);
  }, []);

  // Escape leaves the current tool.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setTool(null);
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, []);

  const photoUrl = siteImage?.url ?? null;
  const photoAspectKnown = siteImage?.aspect !== null && siteImage?.aspect !== undefined;
  const setPhotoBounds = useCallback(
    (bounds: SiteImageBounds) => setSiteImage((prev) => (prev ? { ...prev, bounds } : prev)),
    [],
  );

  // A photo saved earlier: read its proportions before laying it on the map.
  useEffect(() => {
    if (!photoUrl || photoAspectKnown) return;
    const img = new Image();
    img.onload = (): void =>
      setSiteImage((prev) =>
        prev && prev.url === photoUrl
          ? { ...prev, aspect: img.naturalHeight / img.naturalWidth }
          : prev,
      );
    img.src = photoUrl;
  }, [photoUrl, photoAspectKnown]);

  const drawingRoof = tool === 'roof';
  // One or two corners are a contour in progress: it must be finished or cleared before saving.
  const roofIncomplete = roof.length > 0 && roof.length < 3;
  const roofAreaM2 = roof.length >= 3 ? polygonAreaM2(roof) : null;
  const roofCrossed = roof.length >= 4 && !isSimplePolygon(roof);
  const photoBounds = siteImage?.bounds ?? null;
  // The dossier only uses the photo when it shows every point and the whole roof.
  const photoMissesSomething =
    photoBounds !== null &&
    [...KINDS.map((kind) => points[kind]), ...roof].some(
      (p) => p !== null && !isInsideBounds(photoBounds, p),
    );
  const maxFloors = buildingType === 'APARTMENT_BUILDING' ? BUILDING_MAX_FLOORS : HOUSE_MAX_FLOORS;
  const floorOptions = Array.from({ length: maxFloors + 1 }, (_, level) => level);
  const lengths =
    points.field && points.technicalRoom && points.meter && floors !== null
      ? computeRunLengthsM(
          { field: points.field, technicalRoom: points.technicalRoom, meter: points.meter },
          floors,
        )
      : null;
  const earthRequired = buildingType === 'HOUSE';

  // What still stands between the installer and saving, in the order they would fix it.
  const missing = [
    ...(['field', 'technicalRoom', 'meter'] as const)
      .filter((kind) => !points[kind])
      .map((kind) => POINT_STYLES[kind].label),
    ...(earthRequired && !points.earthPit ? [POINT_STYLES.earthPit.label] : []),
    ...(buildingType === null ? ['type de logement'] : []),
    ...(floors === null ? ['étage du toit'] : []),
    ...(roofIncomplete ? ['contour du toit à terminer'] : []),
  ];

  function chooseBuildingType(next: BuildingTypeValue): void {
    setBuildingType(next);
    // The new type may not offer the level that was picked: ask again rather than keep a stale answer.
    setFloors((current) =>
      current !== null &&
      current > (next === 'APARTMENT_BUILDING' ? BUILDING_MAX_FLOORS : HOUSE_MAX_FLOORS)
        ? null
        : current,
    );
  }

  function place(kind: PointKind, point: Point): void {
    setPoints((prev) => ({ ...prev, [kind]: point }));
  }

  function chooseTool(next: Tool): void {
    setNotice(null);
    if (tool === 'roof') finishRoof();
    if (tool === next) {
      setTool(null);
      return;
    }
    setTool(next);
    // A point already placed: show it, ready to be moved.
    const placed = next !== 'roof' && next !== 'photo' ? points[next] : null;
    if (placed && mapRef.current) mapRef.current.panTo([placed.lat, placed.lon]);
  }

  function finishRoof(): void {
    setTool((current) => (current === 'roof' ? null : current));
    if (roof.length < 3) return;
    // The panels stand on this roof: until the installer says otherwise, the field is its middle.
    if (!points.field) place('field', polygonCentroid(roof));
  }

  function clearRoof(): void {
    setRoof([]);
  }

  function moveCorner(index: number, point: Point): void {
    setRoof((prev) => prev.map((corner, i) => (i === index ? point : corner)));
  }

  function handleMapClick(point: Point): void {
    if (tool === 'roof') {
      setRoof((prev) => [...prev, point]);
    } else if (tool && tool !== 'photo') {
      place(tool, point);
      setTool(null);
    }
  }

  /** The current point where the installer stands (phone GPS); they can still drag it after. */
  function placeHere(kind: PointKind): void {
    if (!canLocate) {
      setNotice({
        text: "La position GPS n'est disponible que sur une adresse sécurisée (https).",
        tone: 'danger',
      });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lon: position.coords.longitude };
        place(kind, here);
        setTool(null);
        mapRef.current?.flyTo([here.lat, here.lon], Math.max(mapRef.current.getZoom(), 19));
        const accuracy = Math.round(position.coords.accuracy);
        setNotice(
          accuracy > 15
            ? {
                text: `Position GPS à ± ${accuracy} m : faites glisser le point pour l'ajuster.`,
                tone: 'info',
              }
            : null,
        );
        setLocating(false);
      },
      (failure) => {
        setNotice({
          text:
            failure.code === failure.PERMISSION_DENIED
              ? 'Autorisez la localisation dans le navigateur pour utiliser votre position.'
              : 'Position GPS introuvable : touchez la carte à la place.',
          tone: 'danger',
        });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function importPhoto(file: File): Promise<void> {
    setNotice(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await uploadSiteImageAction(projectId, form);
      if (result.error || !result.image) {
        setNotice({ text: result.error ?? "La photo n'a pas pu être importée.", tone: 'danger' });
        return;
      }
      setSiteImage({
        url: result.image.url,
        aspect: result.image.heightPx / result.image.widthPx,
        bounds: null,
      });
    } finally {
      setUploading(false);
    }
  }

  function submit(): void {
    setError(null);
    // Removed: cleared; aligned: its bounds; imported but not aligned yet: left as it is.
    const photo =
      siteImage === null
        ? { siteImage: null }
        : siteImage.bounds
          ? { siteImage: { bounds: siteImage.bounds } }
          : {};
    startTransition(async () => {
      const result = await saveLocationsAction(projectId, {
        ...points,
        floors,
        buildingType,
        roofOutline: roof.length >= 3 ? roof : null,
        ...photo,
      });
      if (result?.error) setError(result.error);
    });
  }

  const legs: {
    key: string;
    from: Point;
    to: Point;
    colour: string;
    label: string;
    dashed: boolean;
  }[] = [];
  if (points.field && points.technicalRoom) {
    legs.push({
      key: 'dc',
      from: points.field,
      to: points.technicalRoom,
      colour: LEG_COLOURS.dc,
      label: lengths ? `DC ${nf0.format(lengths.dcLengthM)} m` : 'DC',
      dashed: false,
    });
  }
  if (points.technicalRoom && points.meter) {
    legs.push({
      key: 'ac',
      from: points.technicalRoom,
      to: points.meter,
      colour: LEG_COLOURS.ac,
      label: lengths ? `AC ${nf0.format(lengths.acLengthM)} m` : 'AC',
      dashed: false,
    });
  }
  if (points.technicalRoom && points.earthPit) {
    legs.push({
      key: 'earth',
      from: points.technicalRoom,
      to: points.earthPit,
      colour: LEG_COLOURS.earth,
      label: 'Terre',
      dashed: true,
    });
  }

  // Ground metres per screen pixel at this zoom (Web Mercator, 256 px tiles).
  const metresPerPx =
    (EARTH_CIRCUMFERENCE_M * Math.cos((center.lat * Math.PI) / 180)) / 2 ** (zoom + 8);
  const placedCount = KINDS.filter((kind) => points[kind]).length;
  const workspaceClass = [
    'locations-workspace',
    'locations-map',
    tool && tool !== 'photo' ? 'placing' : '',
    zoom >= ALL_TAGS_ZOOM ? 'show-tags' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={workspaceRef} className={workspaceClass} style={{ height }}>
      <div className="locations-map-area">
        <MapContainer
          ref={mapRef}
          center={[center.lat, center.lon]}
          zoom={19}
          maxZoom={ACTIVE_MAP_PROVIDER.maxZoom}
          style={{ height: '100%', width: '100%' }}
        >
          <SiteTileLayer />
          <FitOnOpen points={initialView} center={center} />
          <SizeWatcher height={height} />
          <ZoomWatcher onZoom={setZoom} />
          {siteImage && (
            <SiteImageOverlay image={siteImage} opacity={photoOpacity} onBounds={setPhotoBounds} />
          )}
          <ClickHandler onClick={handleMapClick} />
          {roof.length >= 2 && drawingRoof && (
            <Polyline
              positions={roof.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: ROOF_OUTLINE_STYLE.color, weight: 3, dashArray: '6 6' }}
            />
          )}
          {roof.length >= 3 && !drawingRoof && (
            <Polygon
              positions={roof.map((p) => [p.lat, p.lon])}
              pathOptions={{ color: ROOF_OUTLINE_STYLE.color, weight: 3, fillOpacity: 0.12 }}
            />
          )}
          {legs.map((leg) => (
            <Polyline
              key={`${leg.key}-halo`}
              positions={[
                [leg.from.lat, leg.from.lon],
                [leg.to.lat, leg.to.lon],
              ]}
              pathOptions={{ color: '#fff', weight: 7, opacity: 0.75, interactive: false }}
            />
          ))}
          {legs.map((leg) => (
            <Polyline
              key={leg.key}
              positions={[
                [leg.from.lat, leg.from.lon],
                [leg.to.lat, leg.to.lon],
              ]}
              pathOptions={{
                color: leg.colour,
                weight: 4,
                interactive: false,
                ...(leg.dashed ? { dashArray: '8 6' } : {}),
              }}
            >
              {groundDistanceM(leg.from, leg.to) / metresPerPx >= MIN_LABELLED_LEG_PX && (
                <Tooltip permanent direction="center" className="leg-label" opacity={1}>
                  {leg.label}
                </Tooltip>
              )}
            </Polyline>
          ))}
          {roof.map((corner, index) => (
            <Marker
              key={`roof-${index}`}
              position={[corner.lat, corner.lon]}
              icon={index === 0 && drawingRoof ? cornerIcons.first : cornerIcons.other}
              draggable
              eventHandlers={{
                click: () => {
                  if (index === 0 && drawingRoof) finishRoof();
                },
                dragend: (event: LeafletEvent) => {
                  const latLng = (event.target as LeafletMarker).getLatLng();
                  moveCorner(index, { lat: latLng.lat, lon: latLng.lng });
                },
              }}
            />
          ))}
          {KINDS.map((kind) => {
            const point = points[kind];
            if (!point) return null;
            return (
              <Marker
                key={kind}
                position={[point.lat, point.lon]}
                icon={tool === kind ? icons.active[kind] : icons.normal[kind]}
                zIndexOffset={tool === kind ? 1000 : 0}
                draggable
                eventHandlers={{
                  dragend: (event: LeafletEvent) => {
                    const latLng = (event.target as LeafletMarker).getLatLng();
                    place(kind, { lat: latLng.lat, lon: latLng.lng });
                  },
                }}
              />
            );
          })}
        </MapContainer>

        <div className="map-toolbar" role="toolbar" aria-label="Que placer sur la carte">
          <button
            type="button"
            className="map-tool"
            aria-pressed={tool === 'roof'}
            onClick={() => chooseTool('roof')}
          >
            <RoofSwatch />
            Toit
            {roof.length >= 3 && <span className="done">✓</span>}
          </button>
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="map-tool"
              aria-pressed={tool === kind}
              onClick={() => chooseTool(kind)}
              title={POINT_STYLES[kind].label}
            >
              <PinSwatch kind={kind} />
              {SHORT_LABELS[kind]}
              {points[kind] && <span className="done">✓</span>}
            </button>
          ))}
          <button
            type="button"
            className="map-tool"
            aria-pressed={tool === 'photo'}
            onClick={() => chooseTool('photo')}
          >
            <span aria-hidden="true">🖼</span>
            Photo
            {photoBounds && !photoMissesSomething && <span className="done">✓</span>}
          </button>
        </div>

        {tool && (
          <div className="map-hint" role="status">
            {tool === 'roof' && (
              <>
                <span>
                  {roof.length === 0
                    ? "Touchez chaque coin du toit, dans l'ordre du bord."
                    : `${roof.length} sommet${roof.length > 1 ? 's' : ''}${roofAreaM2 !== null ? ` — ${nf0.format(roofAreaM2)} m²` : ''} : touchez le premier sommet pour fermer.`}
                </span>
                <button
                  type="button"
                  className="small"
                  onClick={finishRoof}
                  disabled={roof.length < 3}
                >
                  Terminer
                </button>
                <button
                  type="button"
                  className="small secondary"
                  onClick={() => setRoof((prev) => prev.slice(0, -1))}
                  disabled={roof.length === 0}
                >
                  Annuler le dernier
                </button>
                {roof.length > 0 && (
                  <button type="button" className="small secondary" onClick={clearRoof}>
                    Effacer
                  </button>
                )}
              </>
            )}
            {tool !== 'roof' && tool !== 'photo' && (
              <>
                <span>
                  {points[tool]
                    ? `${PLACE_HINTS[tool]} Le point déjà placé se déplace aussi en le faisant glisser.`
                    : PLACE_HINTS[tool]}
                </span>
                <button
                  type="button"
                  className="small"
                  onClick={() => placeHere(tool)}
                  disabled={locating}
                  title={
                    canLocate
                      ? 'Placer le point à votre position GPS'
                      : 'Disponible sur une adresse https'
                  }
                >
                  {locating ? 'Localisation…' : '📍 Je suis sur place'}
                </button>
                <button type="button" className="small secondary" onClick={() => setTool(null)}>
                  Annuler
                </button>
              </>
            )}
            {tool === 'photo' && (
              <>
                <span>
                  Capture Google Maps (vue Satellite, relief 3D désactivé, zoom au plus près du
                  toit) : calez-la avec ✥ et ⤡. Sans photo, le dossier utilise l&apos;imagerie
                  Mapbox.
                </span>
                <label className="button small" aria-disabled={uploading}>
                  {uploading ? 'Import…' : siteImage ? 'Remplacer' : 'Importer une capture'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void importPhoto(file);
                    }}
                  />
                </label>
                {siteImage && (
                  <>
                    <button
                      type="button"
                      className="small secondary"
                      onClick={() =>
                        setSiteImage((prev) => (prev ? { ...prev, bounds: null } : prev))
                      }
                    >
                      Recentrer
                    </button>
                    <button
                      type="button"
                      className="small secondary"
                      onClick={() => setSiteImage(null)}
                    >
                      Retirer
                    </button>
                    <label className="map-hint-range">
                      Transparence
                      <input
                        type="range"
                        min={0.2}
                        max={1}
                        step={0.05}
                        value={photoOpacity}
                        onChange={(event) => setPhotoOpacity(Number(event.target.value))}
                      />
                    </label>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {(notice || roofCrossed || photoMissesSomething) && (
          <div className="map-notices">
            {notice && (
              <p role="alert" className={`map-notice ${notice.tone}`}>
                {notice.text}
              </p>
            )}
            {roofCrossed && (
              <p role="alert" className="map-notice danger">
                Le contour du toit se croise : déplacez les sommets pour suivre le bord du toit.
              </p>
            )}
            {photoMissesSomething && (
              <p role="alert" className="map-notice info">
                La photo ne montre pas tous les points et tout le toit : le dossier gardera
                l&apos;imagerie Mapbox.
              </p>
            )}
          </div>
        )}

        <details
          className="map-checklist"
          open={checklistOpen}
          onToggle={(event) => setChecklistOpen((event.target as HTMLDetailsElement).open)}
        >
          <summary>
            Points {placedCount}/4
            {lengths &&
              ` · DC ${nf0.format(lengths.dcLengthM)} m · AC ${nf0.format(lengths.acLengthM)} m`}
          </summary>
          <ul>
            {KINDS.map((kind) => (
              <li key={kind}>
                <button type="button" className="map-check" onClick={() => chooseTool(kind)}>
                  <PinSwatch kind={kind} />
                  <span className="map-check-label">
                    {POINT_STYLES[kind].label}
                    {kind === 'earthPit' && buildingType !== null && (
                      <small>{earthRequired ? ' (obligatoire)' : ' (facultatif)'}</small>
                    )}
                  </span>
                  <span className={points[kind] ? 'map-check-state done' : 'map-check-state'}>
                    {points[kind] ? '✓' : 'à placer'}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="map-check" onClick={() => chooseTool('roof')}>
                <RoofSwatch />
                <span className="map-check-label">
                  Contour du toit <small>(facultatif)</small>
                </span>
                <span className={roof.length >= 3 ? 'map-check-state done' : 'map-check-state'}>
                  {roofAreaM2 !== null ? `${nf0.format(roofAreaM2)} m²` : '—'}
                </span>
              </button>
            </li>
          </ul>
          {lengths && (
            <p className="map-check-lengths">
              Câble DC ≈ {nf0.format(lengths.dcLengthM)} m · câble AC ≈{' '}
              {nf0.format(lengths.acLengthM)} m
            </p>
          )}
        </details>
      </div>

      <div className="map-footer">
        <div className="segmented" role="group" aria-label="Type de logement du client">
          {(
            [
              ['HOUSE', 'Maison'],
              ['APARTMENT_BUILDING', 'Immeuble'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={buildingType === value}
              onClick={() => chooseBuildingType(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="map-footer-floor">
          Étage du toit
          <select
            value={floors === null ? '' : String(floors)}
            onChange={(event) =>
              setFloors(event.target.value === '' ? null : Number(event.target.value))
            }
          >
            <option value="">— étage —</option>
            {floorOptions.map((level) => (
              <option key={level} value={level}>
                {floorLabel(level)}
              </option>
            ))}
          </select>
        </label>
        <span className="map-footer-spacer" />
        {missing.length > 0 && (
          <span className="map-footer-missing">Il reste : {missing.join(', ')}</span>
        )}
        {error && (
          <span role="alert" className="map-footer-error">
            {error}
          </span>
        )}
        <button type="button" onClick={submit} disabled={missing.length > 0 || pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer et voir le récapitulatif'}
        </button>
      </div>
    </div>
  );
}
