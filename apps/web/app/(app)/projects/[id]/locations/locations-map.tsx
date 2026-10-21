'use client';

import { useMemo, useState, useTransition } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import type { DivIcon, LeafletEvent, LeafletMouseEvent, Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIVE_MAP_PROVIDER } from '../map/esri-provider';
import { POINT_STYLES, pointIcon, type PointKind } from '../../../../../components/map/point-markers';
import { saveLocationsAndGenerateAction } from './actions';

type Point = { lat: number; lon: number };
type Points = Record<PointKind, Point | null>;

const KINDS: PointKind[] = ['field', 'technicalRoom', 'meter', 'earthPit'];
const FLOOR_LABELS = ['RDC', 'R+1', 'R+2', 'R+3'];

export interface LocationsMapProps {
  projectId: string;
  center: Point;
  initial: Points;
  initialFloors: number;
}

function ClickHandler({ onClick }: { onClick: (point: Point) => void }): null {
  useMapEvents({
    click: (event: LeafletMouseEvent) => onClick({ lat: event.latlng.lat, lon: event.latlng.lng }),
  });
  return null;
}

function ColourDot({ color }: { color: string }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{ width: 14, height: 14, borderRadius: '50%', background: color, border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.4)', display: 'inline-block' }}
    />
  );
}

export function LocationsMap({ projectId, center, initial, initialFloors }: LocationsMapProps): React.JSX.Element {
  const [points, setPoints] = useState<Points>(initial);
  const [active, setActive] = useState<PointKind | null>(null);
  const [floors, setFloors] = useState(initialFloors);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const icons = useMemo(
    () => Object.fromEntries(KINDS.map((kind) => [kind, pointIcon(kind)])) as Record<PointKind, DivIcon>,
    [],
  );

  const ready = points.field !== null && points.technicalRoom !== null && points.meter !== null;

  function place(kind: PointKind, point: Point): void {
    setPoints((prev) => ({ ...prev, [kind]: point }));
  }

  function submit(): void {
    setError(null);
    startTransition(async () => {
      const result = await saveLocationsAndGenerateAction(projectId, { ...points, floors });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      <div className="actions" style={{ marginBottom: 12 }}>
        {KINDS.map((kind) => {
          const { label, color } = POINT_STYLES[kind];
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active === kind}
              onClick={() => setActive(kind)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, outline: active === kind ? '2px solid currentColor' : undefined }}
            >
              <ColourDot color={color} />
              {label}
              {kind === 'earthPit' ? ' (facultatif)' : ''} — {points[kind] ? '✓ placé' : 'à placer'}
            </button>
          );
        })}
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        Niveau du toit
        <select value={floors} onChange={(event) => setFloors(Number(event.target.value))}>
          {FLOOR_LABELS.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <MapContainer center={[center.lat, center.lon]} zoom={18} maxZoom={ACTIVE_MAP_PROVIDER.maxZoom} style={{ height: '500px', width: '100%' }}>
        <TileLayer url={ACTIVE_MAP_PROVIDER.tileUrlTemplate} attribution={ACTIVE_MAP_PROVIDER.attribution} maxZoom={ACTIVE_MAP_PROVIDER.maxZoom} maxNativeZoom={ACTIVE_MAP_PROVIDER.maxNativeZoom} />
        <ClickHandler
          onClick={(point) => {
            if (!active) return;
            place(active, point);
            setActive(null);
          }}
        />
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
            <ColourDot color={POINT_STYLES[kind].color} />
            {POINT_STYLES[kind].label}
          </li>
        ))}
      </ul>
      <button type="button" onClick={submit} disabled={!ready || pending}>
        {pending ? 'Génération en cours…' : 'Enregistrer et générer le dossier'}
      </button>
      {error && (
        <div className="banner banner-danger" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </>
  );
}
