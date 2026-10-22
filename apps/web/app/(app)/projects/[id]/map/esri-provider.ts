// Esri World Imagery is free but its Tunisian coverage is old and stops at z18. When a (public, URL-restricted)
// Mapbox token is configured we use Mapbox Satellite instead, which is fresher and sharper at high zoom.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const ESRI = {
  tileUrlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  maxZoom: 21,
  maxNativeZoom: 18,
} as const;

const MAPBOX = {
  tileUrlTemplate: `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN ?? ''}`,
  attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; Maxar &copy; OpenStreetMap',
  maxZoom: 22,
  maxNativeZoom: 20,
} as const;

export const ACTIVE_MAP_PROVIDER: typeof ESRI | typeof MAPBOX = MAPBOX_TOKEN ? MAPBOX : ESRI;
