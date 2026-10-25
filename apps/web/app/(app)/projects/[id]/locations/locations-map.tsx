'use client';

import {
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
  isSimplePolygon,
  polygonAreaM2,
  polygonCentroid,
} from '@dossipv/engine';
import type { BuildingTypeValue } from '../../../../../lib/building-type';
import { saveLocationsAction } from './actions';
import {
  FloorField,
  FloorSelect,
  MapArea,
  MapCheck,
  MapCheckLabel,
  MapCheckLengths,
  MapCheckState,
  MapChecklist,
  MapDone,
  MapError,
  MapFooter,
  MapFooterSpacer,
  MapHint,
  MapHintButton,
  MapMissing,
  MapNotice,
  MapNotices,
  MapTool,
  MapToolbar,
  MapWorkspace,
  Segmented,
  SegmentedButton,
} from '@/components/map-ui';
import { Button } from '@/components/ui/button';

type Point = { lat: number; lon: number };
type Points = Record<PointKind, Point | null>;
/** What a tap on the map does: place a point or add a roof corner. */
type Tool = PointKind | 'roof';

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
 * The Emplacements workspace, where every length is measured: the map fills the screen; a toolbar
 * over it picks what the next tap places (any order), a hint says what to do, a checklist tracks
 * what is placed and the cable lengths, and the footer holds the building, the roof level and the
 * save button, which goes on to the photo for the 3D annex.
 */
export function LocationsMap({
  projectId,
  center,
  initial,
  initialRoofOutline,
  initialFloors,
  initialBuildingType,
}: LocationsMapProps): React.JSX.Element {
  const [points, setPoints] = useState<Points>(initial);
  const [tool, setTool] = useState<Tool | null>(null);
  const [roof, setRoof] = useState<Point[]>(initialRoofOutline ?? []);
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

  const drawingRoof = tool === 'roof';
  // One or two corners are a contour in progress: it must be finished or cleared before saving.
  const roofIncomplete = roof.length > 0 && roof.length < 3;
  const roofAreaM2 = roof.length >= 3 ? polygonAreaM2(roof) : null;
  const roofCrossed = roof.length >= 4 && !isSimplePolygon(roof);
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
    const placed = next !== 'roof' ? points[next] : null;
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
    } else if (tool) {
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

  function submit(): void {
    setError(null);
    startTransition(async () => {
      const result = await saveLocationsAction(projectId, {
        ...points,
        floors,
        buildingType,
        roofOutline: roof.length >= 3 ? roof : null,
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

  return (
    <MapWorkspace ref={workspaceRef} placing={tool !== null} showTags={zoom >= ALL_TAGS_ZOOM} style={{ height }}>
      <MapArea >
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

        <MapToolbar  role="toolbar" aria-label="Que placer sur la carte">
          <MapTool
            type="button"
            
            aria-pressed={tool === 'roof'}
            onClick={() => chooseTool('roof')}
          >
            <RoofSwatch />
            Toit
            {roof.length >= 3 && <MapDone />}
          </MapTool>
          {KINDS.map((kind) => (
            <MapTool
              key={kind}
              type="button"
              
              aria-pressed={tool === kind}
              onClick={() => chooseTool(kind)}
              title={POINT_STYLES[kind].label}
            >
              <PinSwatch kind={kind} />
              {SHORT_LABELS[kind]}
              {points[kind] && <MapDone />}
            </MapTool>
          ))}
        </MapToolbar>

        {tool && (
          <MapHint  role="status">
            {tool === 'roof' && (
              <>
                <span>
                  {roof.length === 0
                    ? "Touchez chaque coin du toit, dans l'ordre du bord."
                    : `${roof.length} sommet${roof.length > 1 ? 's' : ''}${roofAreaM2 !== null ? ` — ${nf0.format(roofAreaM2)} m²` : ''} : touchez le premier sommet pour fermer.`}
                </span>
                <MapHintButton
                  type="button"
                  
                  onClick={finishRoof}
                  disabled={roof.length < 3}
                >
                  Terminer
                </MapHintButton>
                <MapHintButton secondary
                  type="button"
                  
                  onClick={() => setRoof((prev) => prev.slice(0, -1))}
                  disabled={roof.length === 0}
                >
                  Annuler le dernier
                </MapHintButton>
                {roof.length > 0 && (
                  <MapHintButton secondary type="button"  onClick={clearRoof}>
                    Effacer
                  </MapHintButton>
                )}
              </>
            )}
            {tool !== 'roof' && (
              <>
                <span>
                  {points[tool]
                    ? `${PLACE_HINTS[tool]} Le point déjà placé se déplace aussi en le faisant glisser.`
                    : PLACE_HINTS[tool]}
                </span>
                <MapHintButton
                  type="button"
                  
                  onClick={() => placeHere(tool)}
                  disabled={locating}
                  title={
                    canLocate
                      ? 'Placer le point à votre position GPS'
                      : 'Disponible sur une adresse https'
                  }
                >
                  {locating ? 'Localisation…' : '📍 Je suis sur place'}
                </MapHintButton>
                <MapHintButton secondary type="button"  onClick={() => setTool(null)}>
                  Annuler
                </MapHintButton>
              </>
            )}
          </MapHint>
        )}

        {(notice || roofCrossed) && (
          <MapNotices >
            {notice && (
              <MapNotice tone={notice.tone}>{notice.text}</MapNotice>
            )}
            {roofCrossed && (
              <MapNotice tone="danger" role="alert" >
                Le contour du toit se croise : déplacez les sommets pour suivre le bord du toit.
              </MapNotice>
            )}
          </MapNotices>
        )}

        <MapChecklist
          
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
                <MapCheck type="button"  onClick={() => chooseTool(kind)}>
                  <PinSwatch kind={kind} />
                  <MapCheckLabel >
                    {POINT_STYLES[kind].label}
                    {kind === 'earthPit' && buildingType !== null && (
                      <small>{earthRequired ? ' (obligatoire)' : ' (facultatif)'}</small>
                    )}
                  </MapCheckLabel>
                  <MapCheckState done={points[kind]}>
                    {points[kind] ? '✓' : 'à placer'}
                  </MapCheckState>
                </MapCheck>
              </li>
            ))}
            <li>
              <MapCheck type="button"  onClick={() => chooseTool('roof')}>
                <RoofSwatch />
                <MapCheckLabel >
                  Contour du toit <small>(facultatif)</small>
                </MapCheckLabel>
                <MapCheckState done={roof.length >= 3}>
                  {roofAreaM2 !== null ? `${nf0.format(roofAreaM2)} m²` : '—'}
                </MapCheckState>
              </MapCheck>
            </li>
          </ul>
          {lengths && (
            <MapCheckLengths >
              Câble DC ≈ {nf0.format(lengths.dcLengthM)} m · câble AC ≈{' '}
              {nf0.format(lengths.acLengthM)} m
            </MapCheckLengths>
          )}
        </MapChecklist>
      </MapArea>

      <MapFooter >
        <Segmented  role="group" aria-label="Type de logement du client">
          {(
            [
              ['HOUSE', 'Maison'],
              ['APARTMENT_BUILDING', 'Immeuble'],
            ] as const
          ).map(([value, label]) => (
            <SegmentedButton
              key={value}
              aria-pressed={buildingType === value}
              onClick={() => chooseBuildingType(value)}
            >
              {label}
            </SegmentedButton>
          ))}
        </Segmented>
        <FloorField >
          Étage du toit
          <FloorSelect
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
          </FloorSelect>
        </FloorField>
        <MapFooterSpacer />
        {missing.length > 0 && (
          <MapMissing >Il reste : {missing.join(', ')}</MapMissing>
        )}
        {error && (
          <MapError>
            {error}
          </MapError>
        )}
        <Button type="button" onClick={submit} disabled={missing.length > 0 || pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer et continuer'}
        </Button>
      </MapFooter>
    </MapWorkspace>
  );
}
