// Esri World Imagery is free but its Tunisian coverage is old and stops at z18. When a (public, URL-restricted)
// Mapbox token is configured we use Mapbox Satellite instead, which is fresher and sharper at high zoom.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const ESRI = {
  tileUrlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  maxZoom: 21,
  maxNativeZoom: 18,
  tileSize: 256,
  zoomOffset: 0,
} as const;

const MAPBOX = {
  tileUrlTemplate: `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN ?? ''}`,
  attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; Maxar &copy; OpenStreetMap',
  // Maxar's Tunisian imagery holds no more detail past zoom 19: zooming further only enlarges blur.
  maxZoom: 19,
  maxNativeZoom: 19,
  // 512 px tiles shifted one zoom level: the same ground scale as 256 px tiles, without seams between tiles.
  tileSize: 512,
  zoomOffset: -1,
} as const;

export const ACTIVE_MAP_PROVIDER: typeof ESRI | typeof MAPBOX = MAPBOX_TOKEN ? MAPBOX : ESRI;
