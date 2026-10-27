import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { rememberPref } from "../../lib/prefs";
import { MAP_TILES, SATELLITE_ATTRIBUTION } from "../../config";

// OpenStreetMap's tile servers refuse a request with no Referer ("403 Access blocked", their
// usage policy), and Pilot's pages send none to other sites (Referrer-Policy: same-origin, so a
// link never carries a path out). The tiles alone send the site's origin — never the path.
const TILE_REFERRER = "strict-origin-when-cross-origin";
import { useT } from "../../i18n";

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

type Layer = "street" | "satellite";
const LAYER_KEY = "pilot.mapLayer";
function savedLayer(): Layer {
  try {
    return localStorage.getItem(LAYER_KEY) === "street" ? "street" : "satellite";
  } catch {
    return "satellite";
  }
}

export function SiteMap({ lat, lon, onPick, focus = 0, satellite = null, className = "" }: {
  lat: number | null;
  lon: number | null;
  onPick?: (lat: number, lon: number) => void;
  /** Bump to fly to the pin at street level (an address search moved it far away). */
  focus?: number;
  /** The satellite tile URL, when the server has a key for one (GET /api/fleet). */
  satellite?: string | null;
  /** Must position the box (relative, absolute…): the layer switch sits inside it. */
  className?: string;
}) {
  const t = useT();
  const [layer, setLayer] = useState<Layer>(savedLayer);
  const tiles = useRef<L.TileLayer | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const framed = useRef(false);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: !!onPick, attributionControl: true, scrollWheelZoom: !!onPick });
    m.attributionControl.setPrefix(false);
    m.on("click", (e: L.LeafletMouseEvent) => pickRef.current?.(e.latlng.lat, e.latlng.lng));
    map.current = m;
    // The tile credit is a licence term (OSM, Esri), so it stays — but quiet: shown when the
    // map opens, folded into an (i) after a few seconds or the first touch, open on hover.
    const fold = () => box.current?.classList.add("credit-folded");
    const timer = window.setTimeout(fold, 5000);
    m.once("movestart click", fold);
    // Leaflet measures its box once; inside a dialog that is still animating open, or a card
    // that resizes, that size is wrong and the tiles stay grey. Re-measure on every resize.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
      m.remove();
      tiles.current = null;
      map.current = null;
      pin.current = null;
      framed.current = false;
    };
    // Built once; the pin and the view follow the props below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown: Layer = satellite && layer === "satellite" ? "satellite" : "street";
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    tiles.current?.remove();
    tiles.current = (shown === "satellite" && satellite
      ? L.tileLayer(satellite, { attribution: SATELLITE_ATTRIBUTION, maxZoom: 19, referrerPolicy: TILE_REFERRER })
      : L.tileLayer(MAP_TILES.url, { attribution: MAP_TILES.attribution, maxZoom: MAP_TILES.maxZoom, referrerPolicy: TILE_REFERRER })).addTo(m);
  }, [shown, satellite]);

  const pick = (l: Layer) => {
    setLayer(l);
    try {
      rememberPref(LAYER_KEY, l);
    } catch {
      /* a private window: the choice lasts this page only */
    }
  };

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
    // Frame the pin once: a saved site opens close enough to see its buildings; a first click on the world view
    // zooms in a few steps. After that a click in the editor only moves the pin, so the person
    // can zoom in and nudge it without the view jumping under the cursor.
    if (!framed.current) {
      framed.current = true;
      const loaded = (m as unknown as { _loaded?: boolean })._loaded;
      m.setView([lat, lon], loaded && pickRef.current ? Math.min(m.getZoom() + 4, 16) : 17);
    } else if (!pickRef.current) {
      m.setView([lat, lon], m.getZoom());
    }
  }, [lat, lon]);

  useEffect(() => {
    if (focus && lat !== null && lon !== null) map.current?.flyTo([lat, lon], 17, { duration: 0.8 });
    // Only a new `focus` flies; the pin moving by a click must not drag the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className={`z-0 ${className}`}>
      <div ref={box} className={`pilot-map absolute inset-0 ${onPick ? "cursor-crosshair" : ""}`} />
      {satellite && (
        <div className="absolute top-2.5 right-2.5 z-[1000] flex rounded-lg bg-panel/90 p-0.5 shadow-card backdrop-blur">
          {(["satellite", "street"] as const).map((l) => (
            <button key={l} type="button" onClick={() => pick(l)} aria-pressed={shown === l}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold ${shown === l ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}>
              {l === "satellite" ? t("Satellite") : t("Map")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
