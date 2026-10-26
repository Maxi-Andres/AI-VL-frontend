import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_TILES } from "../../config";

// A site's location on a street map. Read-only by default; with `onPick`, a click moves the
// pin (the site editor). Leaflet is driven directly — one small component does not need a
// React wrapper library on top of it.

// The pin is drawn in CSS, not Leaflet's PNG marker: bundlers break its image paths, and the
// brand colours read better than the stock blue.
const PIN = L.divIcon({
  className: "",
  html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#2fc1b1;border:3px solid #fff;box-shadow:0 0 0 2px rgba(47,193,177,.45),0 4px 10px rgba(0,0,0,.4)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const WORLD: L.LatLngExpression = [-34.6, -58.4]; // first view with no pin yet

export function SiteMap({ lat, lon, onPick, className = "" }: {
  lat: number | null;
  lon: number | null;
  onPick?: (lat: number, lon: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const framed = useRef(false);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: !!onPick, attributionControl: true, scrollWheelZoom: !!onPick });
    L.tileLayer(MAP_TILES.url, { attribution: MAP_TILES.attribution, maxZoom: MAP_TILES.maxZoom }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => pickRef.current?.(e.latlng.lat, e.latlng.lng));
    map.current = m;
    // Leaflet measures its box once; inside a dialog that is still animating open, or a card
    // that resizes, that size is wrong and the tiles stay grey. Re-measure on every resize.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      pin.current = null;
      framed.current = false;
    };
    // Built once; the pin and the view follow the props below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (lat === null || lon === null) {
      pin.current?.remove();
      pin.current = null;
      framed.current = false;
      m.setView(WORLD, 4);
      return;
    }
    if (pin.current) pin.current.setLatLng([lat, lon]);
    else pin.current = L.marker([lat, lon], { icon: PIN }).addTo(m);
    // Frame the pin once: a saved site opens at street level; a first click on the world view
    // zooms in a few steps. After that a click in the editor only moves the pin, so the person
    // can zoom in and nudge it without the view jumping under the cursor.
    if (!framed.current) {
      framed.current = true;
      const shown = (m as unknown as { _loaded?: boolean })._loaded;
      m.setView([lat, lon], shown && pickRef.current ? Math.min(m.getZoom() + 4, 16) : 15);
    } else if (!pickRef.current) {
      m.setView([lat, lon], m.getZoom());
    }
  }, [lat, lon]);

  return <div ref={box} className={`z-0 ${onPick ? "cursor-crosshair" : ""} ${className}`} />;
}
