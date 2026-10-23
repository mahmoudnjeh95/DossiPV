'use client';

import { useMemo, useState, useTransition } from 'react';
import { MapContainer, Marker, useMapEvents } from 'react-leaflet';
import type { DivIcon, LeafletEvent, LeafletMouseEvent, Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ACTIVE_MAP_PROVIDER } from '../map/esri-provider';
import { SiteTileLayer } from '../map/site-tile-layer';
import { POINT_STYLES, pointIcon, type PointKind } from '../../../../../components/map/point-markers';
import { computeRunLengthsM } from '@dossipv/engine';
import type { BuildingTypeValue } from '../../../../../lib/building-type';
import { saveLocationsAction } from './actions';

type Point = { lat: number; lon: number };
type Points = Record<PointKind, Point | null>;

const KINDS: PointKind[] = ['field', 'technicalRoom', 'meter', 'earthPit'];
const HOUSE_MAX_FLOORS = 3;
const BUILDING_MAX_FLOORS = 15;
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

function floorLabel(level: number): string {
  return level === 0 ? 'RDC' : `R+${level}`;
}

export interface LocationsMapProps {
  projectId: string;
  center: Point;
  initial: Points;
  initialFloors: number | null;
  initialBuildingType: BuildingTypeValue | null;
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

export function LocationsMap({ projectId, center, initial, initialFloors, initialBuildingType }: LocationsMapProps): React.JSX.Element {
  const [points, setPoints] = useState<Points>(initial);
  const [active, setActive] = useState<PointKind | null>(null);
  const [floors, setFloors] = useState<number | null>(initialFloors);
  const [buildingType, setBuildingType] = useState<BuildingTypeValue | null>(initialBuildingType);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const icons = useMemo(
    () => Object.fromEntries(KINDS.map((kind) => [kind, pointIcon(kind)])) as Record<PointKind, DivIcon>,
    [],
  );

  const ready = points.field !== null && points.technicalRoom !== null && points.meter !== null;
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

  function submit(): void {
    setError(null);
    startTransition(async () => {
      const result = await saveLocationsAction(projectId, { ...points, floors, buildingType });
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
              {kind === 'earthPit' ? (buildingType === null ? '' : buildingType === 'HOUSE' ? ' (obligatoire)' : ' (facultatif : sinon terre du bâtiment)') : ''} — {points[kind] ? '✓ placé' : 'à placer'}
            </button>
          );
        })}
      </div>
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
