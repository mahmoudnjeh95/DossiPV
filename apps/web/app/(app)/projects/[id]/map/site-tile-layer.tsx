'use client';

import { useEffect, useState } from 'react';
import { TileLayer } from 'react-leaflet';
import { ACTIVE_MAP_PROVIDER } from './esri-provider';

// Google Map Tiles API (2D satellite). The key is public and must be restricted to our domains in Google Cloud.
// Google's terms cover interactive display only: the dossier worker keeps using Mapbox/Esri for the PDF.
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const GOOGLE_ATTRIBUTION = '&copy; Google';

async function createGoogleSession(key: string): Promise<string> {
  const response = await fetch(`https://tile.googleapis.com/v1/createSession?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'satellite', language: 'fr-FR', region: 'TN' }),
  });
  if (!response.ok) throw new Error(`Google createSession failed with status ${response.status}`);
  return ((await response.json()) as { session: string }).session;
}

export function SiteTileLayer() {
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_KEY) return;
    createGoogleSession(GOOGLE_KEY)
      .then((session) => setGoogleUrl(`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${session}&key=${GOOGLE_KEY}`))
      .catch((error) => console.warn('Google satellite unavailable, keeping the default imagery.', error));
  }, []);

  if (googleUrl) return <TileLayer url={googleUrl} attribution={GOOGLE_ATTRIBUTION} maxZoom={22} maxNativeZoom={21} />;
  return (
    <TileLayer
      url={ACTIVE_MAP_PROVIDER.tileUrlTemplate}
      attribution={ACTIVE_MAP_PROVIDER.attribution}
      maxZoom={ACTIVE_MAP_PROVIDER.maxZoom}
      maxNativeZoom={ACTIVE_MAP_PROVIDER.maxNativeZoom}
    />
  );
}
