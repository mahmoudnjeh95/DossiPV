'use client';

import dynamic from 'next/dynamic';

const LocationsMap = dynamic(() => import('./locations-map').then((mod) => mod.LocationsMap), { ssr: false });

export { LocationsMap as LocationsMapClientOnly };
