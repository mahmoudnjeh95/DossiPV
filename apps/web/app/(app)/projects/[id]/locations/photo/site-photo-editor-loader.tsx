'use client';

import dynamic from 'next/dynamic';

const SitePhotoEditor = dynamic(() => import('./site-photo-editor').then((mod) => mod.SitePhotoEditor), { ssr: false });

export { SitePhotoEditor as SitePhotoEditorClientOnly };
