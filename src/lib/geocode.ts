import { GEOCODER_URL } from "../config";
import { t } from "../i18n";

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

/** Up to five places matching a typed address, best first, named in the browser's language. */
export async function searchAddress(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${GEOCODER_URL}?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  // Nominatim's usage policy wants to know which site asks: the origin only, never the path (the
  // pages send no referrer to other sites otherwise).
  const r = await fetch(url, { signal, referrerPolicy: "strict-origin-when-cross-origin",
    headers: { "Accept-Language": navigator.language || "en" } });
  if (!r.ok) throw new Error(t("Address search failed ({status}).", { status: r.status }));
  const rows = (await r.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((p) => ({ label: p.display_name, lat: Number(p.lat), lon: Number(p.lon) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}
