'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ImageOverlay, Marker, useMap } from 'react-leaflet';
import L, { type LeafletEvent, type Marker as LeafletMarker } from 'leaflet';
import type { SiteImageBounds } from '@dossipv/engine';
import { photoHandleIcon } from '../../../../../components/map/point-markers';

/** The imported photo on the map: `aspect` is its height / width, null until the image is read. */
export interface SiteImageState {
  url: string;
  aspect: number | null;
  bounds: SiteImageBounds | null;
}

// The photo's geometry is worked out at this Web-Mercator zoom, far finer than any screen zoom, so
// moving or resizing it never rounds its edges to screen pixels.
const Z = 22;
/** About 3 m at Tunisian latitudes: a smaller photo cannot be grabbed again. */
const MIN_WIDTH_AT_Z = 100;

/** A photo-shaped rectangle in the middle of the current view, 60 % of its width (or 80 % of its height). */
function boundsInView(map: L.Map, aspect: number): SiteImageBounds {
  const size = map.getSize();
  const scale = 2 ** (Z - map.getZoom());
  let width = 0.6 * size.x * scale;
  if (width * aspect > 0.8 * size.y * scale) width = (0.8 * size.y * scale) / aspect;
  const centre = map.project(map.getCenter(), Z);
  return boundsFrom(map, centre.subtract([width / 2, (width * aspect) / 2]), width, aspect);
}

function boundsFrom(map: L.Map, topLeft: L.Point, width: number, aspect: number): SiteImageBounds {
  const northWest = map.unproject(topLeft, Z);
  const southEast = map.unproject(topLeft.add([width, width * aspect]), Z);
  return { north: northWest.lat, west: northWest.lng, south: southEast.lat, east: southEast.lng };
}

const toLeaflet = (b: SiteImageBounds): L.LatLngBounds => L.latLngBounds([b.south, b.west], [b.north, b.east]);
const latLngOf = (event: LeafletEvent): L.LatLng => (event.target as LeafletMarker).getLatLng();

/**
 * The installer's photo laid over the map, with a ✥ handle on its north-west corner to move it
 * and a ⤡ handle on its south-east corner to resize it (its proportions are kept: a Google Maps
 * capture is north-up Web Mercator like the map). The photo follows a handle while it is dragged;
 * the new bounds are handed over on release. A photo with no bounds yet is placed in the view.
 */
export function SiteImageOverlay({ image, opacity, onBounds }: { image: SiteImageState; opacity: number; onBounds: (bounds: SiteImageBounds) => void }): React.JSX.Element | null {
  const map = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const icons = useMemo(() => ({ move: photoHandleIcon('move'), resize: photoHandleIcon('resize') }), []);
  const { bounds, aspect } = image;

  useEffect(() => {
    if (!bounds && aspect !== null) onBounds(boundsInView(map, aspect));
  }, [bounds, aspect, map, onBounds]);

  if (!bounds || aspect === null) return null;
  const topLeft = map.project([bounds.north, bounds.west], Z);
  const width = map.project([bounds.south, bounds.east], Z).x - topLeft.x;
  const moved = (latLng: L.LatLng): SiteImageBounds => boundsFrom(map, map.project(latLng, Z), width, aspect);
  const resized = (latLng: L.LatLng): SiteImageBounds => boundsFrom(map, topLeft, Math.max(MIN_WIDTH_AT_Z, map.project(latLng, Z).x - topLeft.x), aspect);
  const follow = (next: SiteImageBounds): void => {
    overlayRef.current?.setBounds(toLeaflet(next));
  };

  return (
    <>
      <ImageOverlay ref={overlayRef} url={image.url} bounds={toLeaflet(bounds)} opacity={opacity} />
      <Marker
        position={[bounds.north, bounds.west]}
        icon={icons.move}
        draggable
        eventHandlers={{ drag: (event) => follow(moved(latLngOf(event))), dragend: (event) => onBounds(moved(latLngOf(event))) }}
      />
      <Marker
        position={[bounds.south, bounds.east]}
        icon={icons.resize}
        draggable
        eventHandlers={{ drag: (event) => follow(resized(latLngOf(event))), dragend: (event) => onBounds(resized(latLngOf(event))) }}
      />
    </>
  );
}
