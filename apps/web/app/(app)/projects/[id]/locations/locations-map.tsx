'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { MapContainer, Marker, Polygon, Polyline, useMapEvents } from 'react-leaflet';
import type { DivIcon, LeafletEvent, LeafletMouseEvent, Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIVE_MAP_PROVIDER } from '../map/esri-provider';
import { SiteTileLayer } from '../map/site-tile-layer';
import { POINT_STYLES, ROOF_OUTLINE_STYLE, pointIcon, pointPinSvg, roofCornerIcon, type PointKind } from '../../../../../components/map/point-markers';
import { computeRunLengthsM, isInsideBounds, isSimplePolygon, polygonAreaM2, polygonCentroid, type SiteImageBounds } from '@dossipv/engine';
import type { BuildingTypeValue } from '../../../../../lib/building-type';
import { saveLocationsAction, uploadSiteImageAction } from './actions';
import { SiteImageOverlay, type SiteImageState } from './site-image-overlay';

type Point = { lat: number; lon: number };
type Points = Record<PointKind, Point | null>;

const KINDS: PointKind[] = ['field', 'technicalRoom', 'meter', 'earthPit'];
const HOUSE_MAX_FLOORS = 3;
const BUILDING_MAX_FLOORS = 15;
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

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

/** The point's map pin, small, for its button and the legend. */
function PinSwatch({ kind }: { kind: PointKind }): React.JSX.Element {
  return <span aria-hidden="true" style={{ display: 'inline-block' }} dangerouslySetInnerHTML={{ __html: pointPinSvg(kind, 20) }} />;
}

function RoofSwatch(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{ width: 16, height: 12, border: `3px solid ${ROOF_OUTLINE_STYLE.color}`, background: 'rgba(0,184,217,.15)', display: 'inline-block', boxSizing: 'border-box' }}
    />
  );
}

export function LocationsMap({ projectId, center, initial, initialRoofOutline, initialSiteImage, initialFloors, initialBuildingType }: LocationsMapProps): React.JSX.Element {
  const [points, setPoints] = useState<Points>(initial);
  const [active, setActive] = useState<PointKind | null>(null);
  const [roof, setRoof] = useState<Point[]>(initialRoofOutline ?? []);
  const [drawingRoof, setDrawingRoof] = useState(false);
  const [siteImage, setSiteImage] = useState<SiteImageState | null>(initialSiteImage ? { ...initialSiteImage, aspect: null } : null);
  const [photoOpacity, setPhotoOpacity] = useState(0.85);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [floors, setFloors] = useState<number | null>(initialFloors);
  const [buildingType, setBuildingType] = useState<BuildingTypeValue | null>(initialBuildingType);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const icons = useMemo(
    () => Object.fromEntries(KINDS.map((kind) => [kind, pointIcon(kind)])) as Record<PointKind, DivIcon>,
    [],
  );
  const cornerIcons = useMemo(() => ({ first: roofCornerIcon(true), other: roofCornerIcon(false) }), []);
  const photoUrl = siteImage?.url ?? null;
  const photoAspectKnown = siteImage?.aspect !== null && siteImage?.aspect !== undefined;
  const setPhotoBounds = useCallback((bounds: SiteImageBounds) => setSiteImage((prev) => (prev ? { ...prev, bounds } : prev)), []);

  // A photo saved earlier: read its proportions before laying it on the map.
  useEffect(() => {
    if (!photoUrl || photoAspectKnown) return;
    const img = new Image();
    img.onload = (): void => setSiteImage((prev) => (prev && prev.url === photoUrl ? { ...prev, aspect: img.naturalHeight / img.naturalWidth } : prev));
    img.src = photoUrl;
  }, [photoUrl, photoAspectKnown]);

  // The dossier only uses the photo when it shows every point and the whole roof.
  const photoBounds = siteImage?.bounds ?? null;
  const photoMissesSomething =
    photoBounds !== null && [...KINDS.map((kind) => points[kind]), ...roof].some((p) => p !== null && !isInsideBounds(photoBounds, p));

  // One or two corners are a contour in progress: it must be finished or cleared before saving.
  const roofIncomplete = roof.length > 0 && roof.length < 3;
  const roofAreaM2 = roof.length >= 3 ? polygonAreaM2(roof) : null;
  const roofCrossed = roof.length >= 4 && !isSimplePolygon(roof);
  const ready = points.field !== null && points.technicalRoom !== null && points.meter !== null && !roofIncomplete;
  const maxFloors = buildingType === 'APARTMENT_BUILDING' ? BUILDING_MAX_FLOORS : HOUSE_MAX_FLOORS;
  const floorOptions = Array.from({ length: maxFloors + 1 }, (_, level) => level);
  const lengths =
    points.field && points.technicalRoom && points.meter && floors !== null
      ? computeRunLengthsM({ field: points.field, technicalRoom: points.technicalRoom, meter: points.meter }, floors)
      : null;

  function chooseBuildingType(next: BuildingTypeValue): void {
    setBuildingType(next);
    // The new type may not offer the level that was picked: ask again rather than keep a stale answer.
    setFloors((current) => (current !== null && current > (next === 'APARTMENT_BUILDING' ? BUILDING_MAX_FLOORS : HOUSE_MAX_FLOORS) ? null : current));
  }

  function place(kind: PointKind, point: Point): void {
    setPoints((prev) => ({ ...prev, [kind]: point }));
  }

  function startRoof(): void {
    setActive(null);
    setDrawingRoof(true);
  }

  function finishRoof(): void {
    if (roof.length < 3) return;
    setDrawingRoof(false);
    // The panels stand on this roof: until the installer says otherwise, the field is its middle.
    if (!points.field) place('field', polygonCentroid(roof));
  }

  function clearRoof(): void {
    setRoof([]);
    setDrawingRoof(false);
  }

  function moveCorner(index: number, point: Point): void {
    setRoof((prev) => prev.map((corner, i) => (i === index ? point : corner)));
  }

  async function importPhoto(file: File): Promise<void> {
    setPhotoError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await uploadSiteImageAction(projectId, form);
      if (result.error || !result.image) {
        setPhotoError(result.error ?? "La photo n'a pas pu être importée.");
        return;
      }
      setSiteImage({ url: result.image.url, aspect: result.image.heightPx / result.image.widthPx, bounds: null });
    } finally {
      setUploading(false);
    }
  }

  function submit(): void {
    setError(null);
    // Removed: cleared; aligned: its bounds; imported but not aligned yet: left as it is.
    const photo = siteImage === null ? { siteImage: null } : siteImage.bounds ? { siteImage: { bounds: siteImage.bounds } } : {};
    startTransition(async () => {
      const result = await saveLocationsAction(projectId, { ...points, floors, buildingType, roofOutline: roof.length >= 3 ? roof : null, ...photo });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      <div className="actions" style={{ marginBottom: 12 }}>
        {KINDS.map((kind) => {
          const { label } = POINT_STYLES[kind];
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active === kind}
              onClick={() => {
                setDrawingRoof(false);
                setActive(kind);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, outline: active === kind ? '2px solid currentColor' : undefined }}
            >
              <PinSwatch kind={kind} />
              {label}
              {kind === 'earthPit' ? (buildingType === null ? '' : buildingType === 'HOUSE' ? ' (obligatoire)' : ' (facultatif : sinon terre du bâtiment)') : ''} — {points[kind] ? '✓ placé' : 'à placer'}
            </button>
          );
        })}
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
        <legend>Photo satellite du site (recommandé)</legend>
        <p className="muted" style={{ margin: '0 0 6px' }}>
          Pour un plan d&apos;implantation plus net : dans Google Maps, passez en vue Satellite (relief 3D désactivé), zoomez au
          plus près du toit, faites une capture d&apos;écran et importez-la. Calez-la ensuite sur la carte : ✥ la déplace, ⤡ change
          sa taille, la transparence aide à superposer les toits. Sans photo, le dossier utilise l&apos;imagerie Mapbox.
        </p>
        <div className="actions">
          <label className="button secondary" aria-disabled={uploading}>
            {uploading ? 'Import…' : siteImage ? 'Remplacer la photo' : 'Importer une capture'}
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
              <button type="button" onClick={() => setSiteImage((prev) => (prev ? { ...prev, bounds: null } : prev))}>
                Replacer au centre de la carte
              </button>
              <button type="button" onClick={() => setSiteImage(null)}>
                Retirer la photo
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Transparence
                <input type="range" min={0.2} max={1} step={0.05} value={photoOpacity} onChange={(event) => setPhotoOpacity(Number(event.target.value))} />
              </label>
            </>
          )}
        </div>
        {photoError && (
          <p role="alert" style={{ margin: '4px 0 0', color: '#D93025' }}>
            {photoError}
          </p>
        )}
        {photoMissesSomething && (
          <p role="alert" style={{ margin: '4px 0 0', color: '#B35C00' }}>
            La photo ne couvre pas tous les points et tout le toit : le dossier gardera l&apos;imagerie Mapbox tant qu&apos;elle ne
            les montre pas tous.
          </p>
        )}
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
        <legend>Contour du toit (facultatif)</legend>
        <div className="actions">
          {!drawingRoof && (
            <button type="button" onClick={startRoof} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RoofSwatch />
              {roof.length === 0 ? 'Tracer le contour du toit' : 'Reprendre le tracé'}
            </button>
          )}
          {drawingRoof && (
            <>
              <button
                type="button"
                onClick={finishRoof}
                disabled={roof.length < 3}
                style={{ outline: `3px solid ${ROOF_OUTLINE_STYLE.color}`, outlineOffset: 2 }}
              >
                Terminer le contour
              </button>
              <button type="button" onClick={() => setRoof((prev) => prev.slice(0, -1))} disabled={roof.length === 0}>
                Annuler le dernier sommet
              </button>
            </>
          )}
          {roof.length > 0 && (
            <button type="button" onClick={clearRoof}>
              Effacer le contour
            </button>
          )}
        </div>
        {drawingRoof && (
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Touchez la carte à chaque coin du toit, dans l&apos;ordre du bord. Touchez le premier sommet ou « Terminer le contour »
            pour le fermer. Les sommets restent déplaçables.
          </p>
        )}
        {roofAreaM2 !== null && <p style={{ margin: '4px 0 0' }}>Surface du toit : {nf0.format(roofAreaM2)} m²</p>}
        {roofCrossed && (
          <p role="alert" style={{ margin: '4px 0 0', color: '#D93025' }}>
            Le contour se croise : déplacez les sommets pour suivre le bord du toit.
          </p>
        )}
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
        <legend>Type de logement du client</legend>
        <div className="actions">
          {(
            [
              ['HOUSE', 'Maison individuelle'],
              ['APARTMENT_BUILDING', 'Immeuble (appartement)'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={buildingType === value}
              onClick={() => chooseBuildingType(value)}
              style={{ outline: buildingType === value ? '3px solid #f5b800' : undefined, outlineOffset: 2 }}
            >
              {buildingType === value ? '✓ ' : ''}
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          Étage du toit où seront posés les panneaux
          <select
            value={floors === null ? '' : String(floors)}
            onChange={(event) => setFloors(event.target.value === '' ? null : Number(event.target.value))}
          >
            <option value="">— choisir —</option>
            {floorOptions.map((level) => (
              <option key={level} value={level}>
                {floorLabel(level)}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Sert à calculer la longueur du câble DC (3,5 m par niveau).
        </p>
        {lengths && (
          <p style={{ margin: '4px 0 0' }}>
            Câble DC estimé : {nf.format(lengths.dcLengthM)} m — câble AC estimé : {nf.format(lengths.acLengthM)} m
          </p>
        )}
      </div>
      <MapContainer center={[center.lat, center.lon]} zoom={18} maxZoom={ACTIVE_MAP_PROVIDER.maxZoom} style={{ height: '500px', width: '100%' }}>
        <SiteTileLayer />
        {siteImage && <SiteImageOverlay image={siteImage} opacity={photoOpacity} onBounds={setPhotoBounds} />}
        <ClickHandler
          onClick={(point) => {
            if (drawingRoof) {
              setRoof((prev) => [...prev, point]);
              return;
            }
            if (!active) return;
            place(active, point);
            setActive(null);
          }}
        />
        {roof.length >= 2 && drawingRoof && (
          <Polyline positions={roof.map((p) => [p.lat, p.lon])} pathOptions={{ color: ROOF_OUTLINE_STYLE.color, weight: 3, dashArray: '6 6' }} />
        )}
        {roof.length >= 3 && !drawingRoof && (
          <Polygon positions={roof.map((p) => [p.lat, p.lon])} pathOptions={{ color: ROOF_OUTLINE_STYLE.color, weight: 3, fillOpacity: 0.12 }} />
        )}
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
              icon={icons[kind]}
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
      <ul className="actions" style={{ listStyle: 'none', padding: 0, margin: '8px 0 16px' }}>
        {KINDS.map((kind) => (
          <li key={kind} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <PinSwatch kind={kind} />
            {POINT_STYLES[kind].label}
          </li>
        ))}
        <li style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RoofSwatch />
          {ROOF_OUTLINE_STYLE.label}
        </li>
      </ul>
      {roofIncomplete && <p className="muted">Terminez le contour du toit (au moins 3 sommets) ou effacez-le pour enregistrer.</p>}
      <button type="button" onClick={submit} disabled={!ready || pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer et voir le récapitulatif'}
      </button>
      {error && (
        <div className="banner banner-danger" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </>
  );
}
