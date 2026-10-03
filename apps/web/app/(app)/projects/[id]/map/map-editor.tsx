'use client';

import { useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import type { Marker as LeafletMarker, LeafletEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { saveMapDataAction } from './actions';
import { ACTIVE_MAP_PROVIDER } from './esri-provider';

interface MapEditorProps {
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
}

export function MapEditor({ projectId, tier, site }: MapEditorProps): React.JSX.Element {
  const [gps, setGps] = useState({ lat: site.gpsLat, lon: site.gpsLon });
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave(): Promise<void> {
    const result = await saveMapDataAction(projectId, { gpsLat: gps.lat, gpsLon: gps.lon });
    setSaveError(result?.error ?? null);
  }

  return (
    <main>
      <h1>Carte du site</h1>
      <MapContainer center={[gps.lat, gps.lon]} zoom={18} style={{ height: '500px', width: '100%' }}>
        <TileLayer url={ACTIVE_MAP_PROVIDER.tileUrlTemplate} attribution={ACTIVE_MAP_PROVIDER.attribution} maxZoom={ACTIVE_MAP_PROVIDER.maxZoom} />
        <Marker
          position={[gps.lat, gps.lon]}
          draggable
          eventHandlers={{
            dragend: (event: LeafletEvent) => {
              const latLng = (event.target as LeafletMarker).getLatLng();
              setGps({ lat: latLng.lat, lon: latLng.lng });
            },
          }}
        />
        {tier === 'PREMIUM' && (
          <p role="note">
            Les outils de contour et de remplissage automatique arrivent dans une prochaine mise à jour de cet
            éditeur.
          </p>
        )}
      </MapContainer>
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
