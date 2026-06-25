// แหล่งข้อมูลทางการที่ดึงอัตโนมัติ (ฟรี ไม่ต้องใช้ API key สำหรับ MVP)

export const SOURCES = [
  { key: "enso-cpc", name: "NOAA CPC — ONI / ENSO", url: "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt", topic: "เอลนีโญ" },
  { key: "enso-iri", name: "IRI ENSO Forecast", url: "https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/", topic: "เอลนีโญ" },
  { key: "usgs", name: "USGS Earthquakes", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson", topic: "แผ่นดินไหว" },
  { key: "tmd", name: "กรมอุตุนิยมวิทยา (TMD)", url: "https://www.tmd.go.th/", topic: "อากาศ/พายุ ไทย" },
  { key: "jtwc", name: "JTWC — Tropical Cyclones", url: "https://www.metoc.navy.mil/jtwc/jtwc.html", topic: "ไต้ฝุ่น" },
  { key: "onwr", name: "สทนช. / กรมชลประทาน", url: "https://www.onwr.go.th/", topic: "น้ำ/แล้ง ไทย" },
];

export type EnsoState = "el-nino" | "la-nina" | "neutral";

export interface EnsoStatus {
  oni: number | null; // ค่า ONI ล่าสุด
  season: string; // ไตรมาส 3 เดือนล่าสุด เช่น "MAM"
  year: number | null;
  state: EnsoState;
  strength: string;
  source: string;
  fetchedAt: string;
}

function classifyOni(oni: number): { state: EnsoState; strength: string } {
  if (oni >= 0.5) {
    let strength = "อ่อน";
    if (oni >= 2.0) strength = "รุนแรงมาก (Super)";
    else if (oni >= 1.5) strength = "รุนแรง";
    else if (oni >= 1.0) strength = "ปานกลาง";
    return { state: "el-nino", strength };
  }
  if (oni <= -0.5) {
    let strength = "อ่อน";
    if (oni <= -1.5) strength = "รุนแรง";
    else if (oni <= -1.0) strength = "ปานกลาง";
    return { state: "la-nina", strength };
  }
  return { state: "neutral", strength: "เป็นกลาง" };
}

// ONI ascii: header row "SEAS YR TOTAL ANOM" then rows e.g. "DJF 1950 24.72 -1.53"
export function parseOni(text: string): EnsoStatus {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  let last: { season: string; year: number; anom: number } | null = null;
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    const [seas, yr, , anom] = parts;
    const y = Number(yr);
    const a = Number(anom);
    if (Number.isNaN(y) || Number.isNaN(a)) continue; // skip header
    last = { season: seas, year: y, anom: a };
  }
  if (!last) {
    return {
      oni: null, season: "", year: null, state: "neutral",
      strength: "ไม่ทราบ", source: "NOAA CPC ONI", fetchedAt: new Date().toISOString(),
    };
  }
  const { state, strength } = classifyOni(last.anom);
  return {
    oni: last.anom, season: last.season, year: last.year,
    state, strength, source: "NOAA CPC ONI", fetchedAt: new Date().toISOString(),
  };
}

export interface Quake {
  id: string;
  mag: number;
  place: string;
  time: number;
  url: string;
  depth: number | null;
  lon: number | null;
  lat: number | null;
}

export function parseQuakes(geojson: any): Quake[] {
  if (!geojson?.features) return [];
  return geojson.features
    .map((f: any): Quake => ({
      id: f.id,
      mag: f.properties?.mag ?? 0,
      place: f.properties?.place ?? "ไม่ทราบตำแหน่ง",
      time: f.properties?.time ?? 0,
      url: f.properties?.url ?? "",
      depth: f.geometry?.coordinates?.[2] ?? null,
      lon: f.geometry?.coordinates?.[0] ?? null,
      lat: f.geometry?.coordinates?.[1] ?? null,
    }))
    .sort((a: Quake, b: Quake) => b.time - a.time);
}
