'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { ImageOverlay, MapContainer, Marker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L, { type DivIcon, type LeafletEvent, type LeafletMouseEvent, type Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fitSiteImage,
  MAX_PHOTO_MISMATCH_M,
  photoPixels,
  SITE_POINT_KINDS,
  type GpsPoint,
  type PhotoPoint,
  type SiteImagePoints,
  type SitePointKind,
} from '@dossipv/engine';
import {
  POINT_STYLES,
  ROOF_OUTLINE_STYLE,
  pointIcon,
  pointPinSvg,
  roofCornerIcon,
} from '../../../../../../components/map/point-markers';
import { siteImagePointsProblem } from '../../../../../../lib/site-points';
import { removeSiteImageAction, saveSiteImagePointsAction, uploadSiteImageAction } from './actions';

type Tool = SitePointKind | 'roof';
type PhotoPoints = Record<SitePointKind, PhotoPoint | null>;
type Size = { widthPx: number; heightPx: number };

const SHORT_LABELS: Record<SitePointKind, string> = {
  field: 'Champ PV',
  technicalRoom: 'Onduleur',
  meter: 'Compteur',
  earthPit: 'Terre',
};
const PLACE_HINTS: Record<SitePointKind, string> = {
  field: 'Touchez la photo là où seront posés les panneaux, comme sur la carte.',
  technicalRoom: "Touchez la photo là où sera l'onduleur (local technique).",
  meter: 'Touchez la photo sur le compteur STEG.',
  earthPit: 'Touchez la photo là où sera planté le piquet de terre.',
};
const NO_POINTS: PhotoPoints = { field: null, technicalRoom: null, meter: null, earthPit: null };

export interface SitePhotoEditorProps {
  projectId: string;
  /** The points placed on the map (step 1): those to place again on the photo. */
  mapPoints: Record<SitePointKind, GpsPoint | null>;
  /** A roof drawn on the map must be drawn on the photo too. */
  mapHasRoof: boolean;
  initialImageUrl: string | null;
  initialPoints: SiteImagePoints | null;
}

// The photo is shown in Leaflet's flat (CRS.Simple) space: a photo pixel (x, y from the top) is
// the point (lat -y, lng x), so north stays up and the image keeps its proportions.
const toLatLng = (p: PhotoPoint, size: Size): [number, number] => [-p.y * size.heightPx, p.x * size.widthPx];
const fromLatLng = (latLng: L.LatLng, size: Size): PhotoPoint => ({
  x: Math.min(1, Math.max(0, latLng.lng / size.widthPx)),
  y: Math.min(1, Math.max(0, -latLng.lat / size.heightPx)),
});
const isOnPhoto = (latLng: L.LatLng, size: Size): boolean =>
  latLng.lng >= 0 && latLng.lng <= size.widthPx && latLng.lat <= 0 && latLng.lat >= -size.heightPx;

function ClickHandler({ onClick }: { onClick: (latLng: L.LatLng) => void }): null {
  useMapEvents({ click: (event: LeafletMouseEvent) => onClick(event.latlng) });
  return null;
}

/** The whole photo fills the view when it opens. */
function FitPhoto({ size }: { size: Size }): null {
  const map = useMap();
  useEffect(() => {
    map.fitBounds([
      [-size.heightPx, 0],
      [0, size.widthPx],
    ]);
  }, [map, size]);
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

function PinSwatch({ kind }: { kind: SitePointKind }): React.JSX.Element {
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

/**
 * Step 2 of Emplacements: the installer imports a Google Maps capture and places on it again the
 * points (and the roof) of the map. The points give the photo its scale against the map, so each
 * is checked live against its map position; the dossier then draws the implantation plan and the
 * 3D annex on this photo, with the lengths measured on the map.
 */
export function SitePhotoEditor({ projectId, mapPoints, mapHasRoof, initialImageUrl, initialPoints }: SitePhotoEditorProps): React.JSX.Element {
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [size, setSize] = useState<Size | null>(null);
  const [points, setPoints] = useState<PhotoPoints>(
    initialPoints ? { field: initialPoints.field, technicalRoom: initialPoints.technicalRoom, meter: initialPoints.meter, earthPit: initialPoints.earthPit } : NO_POINTS,
  );
  const [roof, setRoof] = useState<PhotoPoint[]>(initialPoints?.roofOutline ?? []);
  const [tool, setTool] = useState<Tool | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(560);
  const [pending, startTransition] = useTransition();
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const kinds = SITE_POINT_KINDS.filter((kind) => mapPoints[kind] !== null);
  const icons = useMemo(
    () => ({
      normal: Object.fromEntries(SITE_POINT_KINDS.map((kind) => [kind, pointIcon(kind)])) as Record<SitePointKind, DivIcon>,
      active: Object.fromEntries(SITE_POINT_KINDS.map((kind) => [kind, pointIcon(kind, { active: true })])) as Record<SitePointKind, DivIcon>,
    }),
    [],
  );
  const cornerIcons = useMemo(() => ({ first: roofCornerIcon(true), other: roofCornerIcon(false) }), []);

  // The workspace takes the rest of the screen, like the map of step 1.
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

  // The photo's own size, for its place in the view and its scale.
  useEffect(() => {
    if (!imageUrl) return;
    let current = true;
    const img = new Image();
    img.onload = (): void => {
      if (current) setSize({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
    };
    img.src = imageUrl;
    return (): void => {
      current = false;
    };
  }, [imageUrl]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setTool(null);
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, []);

  const drawingRoof = tool === 'roof';
  const roofIncomplete = roof.length > 0 && roof.length < 3;
  const photo: SiteImagePoints = { ...points, roofOutline: roof.length >= 3 ? roof : null };
  const missing = [
    ...kinds.filter((kind) => !points[kind]).map((kind) => POINT_STYLES[kind].label),
    ...(mapHasRoof && roof.length < 3 ? ['contour du toit'] : []),
    ...(roofIncomplete && !mapHasRoof ? ['contour du toit à terminer'] : []),
  ];
  // How far each placed point is from where the map has it, once two of them give the photo a scale.
  const fit = size ? fitSiteImage(mapPoints, photoPixels(photo, size.widthPx, size.heightPx)) : null;
  const problem = size && missing.length === 0 ? siteImagePointsProblem(mapPoints, mapHasRoof, photo, size) : null;

  function chooseTool(next: Tool): void {
    setNotice(null);
    setTool((current) => (current === next ? null : next));
  }

  function handleClick(latLng: L.LatLng): void {
    if (!size || !tool || !isOnPhoto(latLng, size)) return;
    const at = fromLatLng(latLng, size);
    if (tool === 'roof') {
      setRoof((prev) => [...prev, at]);
    } else {
      setPoints((prev) => ({ ...prev, [tool]: at }));
      setTool(null);
    }
  }

  async function importPhoto(file: File): Promise<void> {
    setNotice(null);
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await uploadSiteImageAction(projectId, form);
      if (result.error || !result.image) {
        setNotice(result.error ?? "La capture n'a pas pu être importée.");
        return;
      }
      // A new photo: its points are placed afresh.
      setSize(null);
      setImageUrl(result.image.url);
      setPoints(NO_POINTS);
      setRoof([]);
      setTool(kinds[0] ?? null);
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(): void {
    setError(null);
    startTransition(async () => {
      const result = await removeSiteImageAction(projectId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setImageUrl(null);
      setSize(null);
      setPoints(NO_POINTS);
      setRoof([]);
      setTool(null);
    });
  }

  function submit(): void {
    setError(null);
    startTransition(async () => {
      const result = await saveSiteImagePointsAction(projectId, photo);
      if (result?.error) setError(result.error);
    });
  }

  const importButton = (text: string): React.JSX.Element => (
    <label className="button" aria-disabled={uploading}>
      {uploading ? 'Import…' : text}
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
  );

  if (!imageUrl) {
    return (
      <section className="card site-photo-intro">
        <h2>Importer une capture Google Maps</h2>
        <ol>
          <li>Ouvrez Google Maps sur l&apos;adresse du client et passez en vue <strong>Satellite</strong>.</li>
          <li>
            Désactivez le relief 3D (vue <strong>2D</strong>, du dessus) et gardez le <strong>nord en haut</strong>.
          </li>
          <li>Zoomez au plus près en gardant visibles tous les points (compteur, local technique, piquet de terre) et tout le toit.</li>
          <li>
            Faites une capture d&apos;écran (Windows : <kbd>Win</kbd> + <kbd>Maj</kbd> + <kbd>S</kbd>) et importez-la ici.
          </li>
        </ol>
        <p className="muted">Vous placerez ensuite sur la photo les mêmes points que sur la carte, puis le contour du toit.</p>
        {notice && (
          <p role="alert" className="site-photo-error">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="site-photo-error">
            {error}
          </p>
        )}
        <div className="site-photo-actions">
          {importButton('Importer la capture')}
          <Link className="button secondary" href={`/projects/${projectId}/summary`}>
            Passer cette étape
          </Link>
        </div>
      </section>
    );
  }

  const workspaceClass = ['locations-workspace', 'locations-map', 'show-tags', tool ? 'placing' : ''].filter(Boolean).join(' ');
  const mismatch = (kind: SitePointKind): number | null => {
    const value = fit?.mismatchM[kind];
    return value !== undefined && value > MAX_PHOTO_MISMATCH_M ? value : null;
  };

  return (
    <div ref={workspaceRef} className={workspaceClass} style={{ height }}>
      <div className="locations-map-area site-photo-area">
        {size && (
          <MapContainer
            key={imageUrl}
            crs={L.CRS.Simple}
            center={[-size.heightPx / 2, size.widthPx / 2]}
            zoom={0}
            minZoom={-4}
            maxZoom={3}
            zoomSnap={0.25}
            attributionControl={false}
            style={{ height: '100%', width: '100%' }}
          >
            <ImageOverlay
              url={imageUrl}
              bounds={[
                [-size.heightPx, 0],
                [0, size.widthPx],
              ]}
            />
            <FitPhoto size={size} />
            <SizeWatcher height={height} />
            <ClickHandler onClick={handleClick} />
            {roof.length >= 2 && drawingRoof && (
              <Polyline positions={roof.map((p) => toLatLng(p, size))} pathOptions={{ color: ROOF_OUTLINE_STYLE.color, weight: 3, dashArray: '6 6' }} />
            )}
            {roof.length >= 3 && !drawingRoof && (
              <Polygon positions={roof.map((p) => toLatLng(p, size))} pathOptions={{ color: ROOF_OUTLINE_STYLE.color, weight: 3, fillOpacity: 0.12 }} />
            )}
            {roof.map((corner, index) => (
              <Marker
                key={`roof-${index}`}
                position={toLatLng(corner, size)}
                icon={index === 0 && drawingRoof ? cornerIcons.first : cornerIcons.other}
                draggable
                eventHandlers={{
                  click: () => {
                    if (index === 0 && drawingRoof && roof.length >= 3) setTool(null);
                  },
                  dragend: (event: LeafletEvent) => {
                    const moved = fromLatLng((event.target as LeafletMarker).getLatLng(), size);
                    setRoof((prev) => prev.map((p, i) => (i === index ? moved : p)));
                  },
                }}
              />
            ))}
            {kinds.map((kind) => {
              const at = points[kind];
              if (!at) return null;
              return (
                <Marker
                  key={kind}
                  position={toLatLng(at, size)}
                  icon={tool === kind ? icons.active[kind] : icons.normal[kind]}
                  zIndexOffset={tool === kind ? 1000 : 0}
                  draggable
                  eventHandlers={{
                    dragend: (event: LeafletEvent) => {
                      const moved = fromLatLng((event.target as LeafletMarker).getLatLng(), size);
                      setPoints((prev) => ({ ...prev, [kind]: moved }));
                    },
                  }}
                />
              );
            })}
          </MapContainer>
        )}

        <div className="map-toolbar" role="toolbar" aria-label="Que placer sur la photo">
          <button type="button" className="map-tool" aria-pressed={tool === 'roof'} onClick={() => chooseTool('roof')}>
            <RoofSwatch />
            Toit
            {roof.length >= 3 && <span className="done">✓</span>}
          </button>
          {kinds.map((kind) => (
            <button key={kind} type="button" className="map-tool" aria-pressed={tool === kind} onClick={() => chooseTool(kind)} title={POINT_STYLES[kind].label}>
              <PinSwatch kind={kind} />
              {SHORT_LABELS[kind]}
              {points[kind] && mismatch(kind) === null && <span className="done">✓</span>}
            </button>
          ))}
        </div>

        {tool && (
          <div className="map-hint" role="status">
            {tool === 'roof' ? (
              <>
                <span>
                  {roof.length === 0
                    ? "Touchez chaque coin du toit sur la photo, dans l'ordre du bord."
                    : `${roof.length} sommet${roof.length > 1 ? 's' : ''} : touchez le premier sommet ou « Terminer » pour fermer.`}
                </span>
                <button type="button" className="small" onClick={() => setTool(null)} disabled={roof.length < 3}>
                  Terminer
                </button>
                <button type="button" className="small secondary" onClick={() => setRoof((prev) => prev.slice(0, -1))} disabled={roof.length === 0}>
                  Annuler le dernier
                </button>
                {roof.length > 0 && (
                  <button type="button" className="small secondary" onClick={() => setRoof([])}>
                    Effacer
                  </button>
                )}
              </>
            ) : (
              <>
                <span>{points[tool] ? `${PLACE_HINTS[tool]} Le point déjà placé se déplace aussi en le faisant glisser.` : PLACE_HINTS[tool]}</span>
                <button type="button" className="small secondary" onClick={() => setTool(null)}>
                  Annuler
                </button>
              </>
            )}
          </div>
        )}

        {(notice || problem) && (
          <div className="map-notices">
            {notice && (
              <p role="alert" className="map-notice danger">
                {notice}
              </p>
            )}
            {problem && (
              <p role="alert" className="map-notice danger">
                {problem}
              </p>
            )}
          </div>
        )}

        <details className="map-checklist" open>
          <summary>
            Sur la photo : {kinds.filter((kind) => points[kind]).length}/{kinds.length} points
          </summary>
          <ul>
            {kinds.map((kind) => {
              const off = mismatch(kind);
              return (
                <li key={kind}>
                  <button type="button" className="map-check" onClick={() => chooseTool(kind)}>
                    <PinSwatch kind={kind} />
                    <span className="map-check-label">{POINT_STYLES[kind].label}</span>
                    <span className={points[kind] && off === null ? 'map-check-state done' : 'map-check-state'}>
                      {!points[kind] ? 'à placer' : off !== null ? `écart ${Math.round(off)} m` : '✓'}
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" className="map-check" onClick={() => chooseTool('roof')}>
                <RoofSwatch />
                <span className="map-check-label">
                  Contour du toit {!mapHasRoof && <small>(facultatif)</small>}
                </span>
                <span className={roof.length >= 3 ? 'map-check-state done' : 'map-check-state'}>{roof.length >= 3 ? '✓' : 'à tracer'}</span>
              </button>
            </li>
          </ul>
          <p className="map-check-lengths">Chaque point doit être au même endroit que sur la carte : ils mettent la photo à l&apos;échelle.</p>
        </details>
      </div>

      <div className="map-footer">
        {importButton('Remplacer la capture')}
        <button type="button" className="secondary" onClick={removePhoto} disabled={pending}>
          Retirer
        </button>
        <span className="map-footer-spacer" />
        {missing.length > 0 && <span className="map-footer-missing">Il reste : {missing.join(', ')}</span>}
        {error && (
          <span role="alert" className="map-footer-error">
            {error}
          </span>
        )}
        <Link className="button secondary" href={`/projects/${projectId}/summary`}>
          Passer
        </Link>
        <button type="button" onClick={submit} disabled={missing.length > 0 || problem !== null || pending || !size}>
          {pending ? 'Enregistrement…' : 'Enregistrer et voir le récapitulatif'}
        </button>
      </div>
    </div>
  );
}
