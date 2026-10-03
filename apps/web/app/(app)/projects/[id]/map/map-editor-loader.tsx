'use client';

import dynamic from 'next/dynamic';

const MapEditor = dynamic(() => import('./map-editor').then((mod) => mod.MapEditor), { ssr: false });

export { MapEditor as MapEditorClientOnly };
