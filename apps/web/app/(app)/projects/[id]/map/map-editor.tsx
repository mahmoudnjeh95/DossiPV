'use client';

import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from 'react-leaflet';
import L, { type Marker as LeafletMarker, type LeafletEvent, type LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { computePanelLayout } from '@dossipv/engine';
import { saveMapDataAction } from './actions';
import { ACTIVE_MAP_PROVIDER } from './esri-provider';
import { pointIcon } from '../../../../../components/map/point-markers';
import { Map as MapIcon, Polygon as PolygonIcon, MarkerTech, MarkerMeter, MarkerEarth, Check } from '@dossipv/icons';

// Leaflet's default marker icon paths are relative to its own CSS file and don't survive
// Next.js's bundler — without this, markers render with no icon image and two 404s.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const METERS_PER_DEGREE_LAT = 111_320;

export function computePolygonCentroid(points: { lat: number; lon: number }[]): { lat: number; lon: number } {
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
  return { lat, lon };
}

export function computePolygonAreaM2(points: { lat: number; lon: number }[]): number {
  if (points.length < 3) {
    return 0;
  }
  const originLat = points[0]!.lat;
  const originLon = points[0]!.lon;
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos((originLat * Math.PI) / 180);
  const local = points.map((p) => ({
    xM: (p.lon - originLon) * metersPerDegreeLon,
    yM: (p.lat - originLat) * METERS_PER_DEGREE_LAT,
  }));

  let twiceArea = 0;
  for (let i = 0; i < local.length; i++) {
    const current = local[i]!;
    const next = local[(i + 1) % local.length]!;
    twiceArea += current.xM * next.yM - next.xM * current.yM;
  }
  return Math.abs(twiceArea) / 2;
}

export interface MapEditorProps {
  projectId: string;
  tier: 'STANDARD' | 'PREMIUM';
  site: {
    gpsLat: number;
    gpsLon: number;
    technicalRoomPointLat: number | null;
    technicalRoomPointLon: number | null;
    meterPointLat: number | null;
    meterPointLon: number | null;
    earthPitPointLat: number | null;
    earthPitPointLon: number | null;
  };
  geometry: unknown;
  moduleInfo?: { count: number; lengthM: number; widthM: number; tiltDeg: number } | null;
}

type Point = { lat: number; lon: number };
type DrawMode = 'none' | 'polygon' | 'technicalRoom' | 'meter' | 'earthPit';

function ClickHandler({ onClick }: { onClick: (point: Point) => void }): null {
  useMapEvents({
    click: (event: LeafletMouseEvent) => {
      onClick({ lat: event.latlng.lat, lon: event.latlng.lng });
    },
  });
  return null;
}

function getLatLngFromDragEvent(event: LeafletEvent): Point {
  const latLng = (event.target as LeafletMarker).getLatLng();
  return { lat: latLng.lat, lon: latLng.lng };
}

export function MapEditor({ projectId, tier, site, moduleInfo }: MapEditorProps): React.JSX.Element {
  const [gps, setGps] = useState({ lat: site.gpsLat, lon: site.gpsLon });
  const [outline, setOutline] = useState<Point[]>([]);
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [technicalRoom, setTechnicalRoom] = useState<Point | null>(
    site.technicalRoomPointLat !== null && site.technicalRoomPointLon !== null
      ? { lat: site.technicalRoomPointLat, lon: site.technicalRoomPointLon }
      : null,
  );
  const [meter, setMeter] = useState<Point | null>(
    site.meterPointLat !== null && site.meterPointLon !== null ? { lat: site.meterPointLat, lon: site.meterPointLon } : null,
  );
  const [earthPit, setEarthPit] = useState<Point | null>(
    site.earthPitPointLat !== null && site.earthPitPointLon !== null
      ? { lat: site.earthPitPointLat, lon: site.earthPitPointLon }
      : null,
  );
  const [panelRows, setPanelRows] = useState<(Point & { rotationDeg: number })[][]>([]);
  const [fitWarning, setFitWarning] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleMapClick(point: Point): void {
    if (drawMode === 'polygon') {
      setOutline((prev) => [...prev, point]);
    } else if (drawMode === 'technicalRoom') {
      setTechnicalRoom(point);
      setDrawMode('none');
    } else if (drawMode === 'meter') {
      setMeter(point);
      setDrawMode('none');
    } else if (drawMode === 'earthPit') {
      setEarthPit(point);
      setDrawMode('none');
    }
  }

  function handleFinishPolygon(): void {
    if (outline.length < 3) {
      return;
    }
    const centroid = computePolygonCentroid(outline);
    setGps(centroid);
    setDrawMode('none');
  }

  function handleAutoFill(): void {
    if (outline.length < 3 || !moduleInfo) {
      return;
    }
    const centroid = computePolygonCentroid(outline);
    const result = computePanelLayout(outline, moduleInfo.count, moduleInfo.lengthM, moduleInfo.widthM, moduleInfo.tiltDeg, centroid.lat);
    setPanelRows(result.rows);
    setFitWarning(result.fitsAllModules ? null : `Seuls ${result.placedCount} modules sur ${moduleInfo.count} tiennent dans ce contour.`);
  }

  async function handleSave(): Promise<void> {
    const hasPremiumGeometry = tier === 'PREMIUM' && outline.length >= 3;

    const result = await saveMapDataAction(projectId, {
      gpsLat: gps.lat,
      gpsLon: gps.lon,
      ...(technicalRoom ? { technicalRoomPointLat: technicalRoom.lat, technicalRoomPointLon: technicalRoom.lon } : {}),
      ...(meter ? { meterPointLat: meter.lat, meterPointLon: meter.lon } : {}),
      ...(earthPit ? { earthPitPointLat: earthPit.lat, earthPitPointLon: earthPit.lon } : {}),
      ...(hasPremiumGeometry ? { geometry: { outline, panelRows, manualOverride: false } } : {}),
    });

    setSaveError(result?.error ?? null);
  }

  return (
    <main>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MapIcon size="lg" color="gold" />
        Carte du site
      </h1>
      {tier === 'PREMIUM' && (
        <div className="actions" style={{ marginBottom: 12 }}>
          <button type="button" onClick={() => setDrawMode('polygon')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <PolygonIcon size="sm" color="inherit" />
            Dessiner le contour
          </button>
          <button type="button" onClick={handleFinishPolygon} disabled={outline.length < 3} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Check size="sm" color="inherit" />
            Terminer le contour
          </button>
          <button type="button" onClick={() => setDrawMode('technicalRoom')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MarkerTech size="sm" color="inherit" />
            Placer : Local technique
          </button>
          <button type="button" onClick={() => setDrawMode('meter')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MarkerMeter size="sm" color="inherit" />
            Placer : Compteur STEG
          </button>
          <button type="button" onClick={() => setDrawMode('earthPit')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MarkerEarth size="sm" color="inherit" />
            Placer : Piquet de terre
          </button>
          <button type="button" onClick={handleAutoFill} disabled={outline.length < 3 || !moduleInfo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Remplissage automatique
          </button>
        </div>
      )}
      <MapContainer center={[gps.lat, gps.lon]} zoom={18} style={{ height: '500px', width: '100%' }}>
        <TileLayer url={ACTIVE_MAP_PROVIDER.tileUrlTemplate} attribution={ACTIVE_MAP_PROVIDER.attribution} maxZoom={ACTIVE_MAP_PROVIDER.maxZoom} />
        <ClickHandler onClick={handleMapClick} />
        <Marker
          position={[gps.lat, gps.lon]}
          icon={pointIcon('field')}
          draggable
          eventHandlers={{ dragend: (event: LeafletEvent) => setGps(getLatLngFromDragEvent(event)) }}
        />
        {outline.length >= 3 && <Polygon positions={outline.map((p) => [p.lat, p.lon])} />}
        {technicalRoom && (
          <Marker
            position={[technicalRoom.lat, technicalRoom.lon]}
            icon={pointIcon('technicalRoom')}
            draggable
            eventHandlers={{ dragend: (event: LeafletEvent) => setTechnicalRoom(getLatLngFromDragEvent(event)) }}
          />
        )}
        {meter && (
          <Marker
            position={[meter.lat, meter.lon]}
            icon={pointIcon('meter')}
            draggable
            eventHandlers={{ dragend: (event: LeafletEvent) => setMeter(getLatLngFromDragEvent(event)) }}
          />
        )}
        {earthPit && (
          <Marker
            position={[earthPit.lat, earthPit.lon]}
            icon={pointIcon('earthPit')}
            draggable
            eventHandlers={{ dragend: (event: LeafletEvent) => setEarthPit(getLatLngFromDragEvent(event)) }}
          />
        )}
        {panelRows.map((row, rowIndex) => (
          <Polygon key={rowIndex} positions={row.map((p) => [p.lat, p.lon])} pathOptions={{ color: 'blue' }} />
        ))}
      </MapContainer>
      {fitWarning && <p role="alert">{fitWarning}</p>}
      <button
        type="button"
        onClick={() => {
          void handleSave();
        }}
      >
        Enregistrer
      </button>
      {saveError && <p role="alert">{saveError}</p>}
    </main>
  );
}
