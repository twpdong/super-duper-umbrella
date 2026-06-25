// ─────────────────────────────────────────────────────────────────────────────
// Risk computation orchestrator — ดึงข้อมูลสด + คำนวณความเสี่ยงรายจุด
// ใช้ร่วมกันโดย /api/risk (on-demand) และ /api/cron/ingest (scheduled)
// ─────────────────────────────────────────────────────────────────────────────

import { fetchWeatherForPoints } from "./openmeteo";
import { parseOni, parseQuakes, Quake } from "./sources";
import {
  heatSeverity,
  rainFloodSeverity,
  droughtSeverity,
  cycloneSeverity,
  pm25Severity,
  earthquakeSeverity,
  scoreSector,
  haversineKm,
  HazardReading,
  SectorRisk,
  RiskSectorKey,
} from "./risk";

export interface ComputePoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sectors: RiskSectorKey[];
}

export interface PointRisk {
  id: string;
  name: string;
  readings: HazardReading[];
  sectors: SectorRisk[];
  overall: number;
}

export interface ComputeResult {
  points: PointRisk[];
  oni: number | null;
  quakeCount: number;
  generatedAt: string;
}

const ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";
const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";

async function getOni(): Promise<number | null> {
  try {
    const res = await fetch(ONI_URL, { next: { revalidate: 21600 } });
    if (!res.ok) return 1.7;
    return parseOni(await res.text()).oni ?? 1.7;
  } catch {
    return 1.7;
  }
}

async function getQuakes(): Promise<Quake[]> {
  try {
    const res = await fetch(USGS_URL, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    return parseQuakes(await res.json());
  } catch {
    return [];
  }
}

// แผ่นดินไหวแรงสุดในรัศมี 700 กม. จากจุด
function nearestStrongQuake(lat: number, lon: number, quakes: Quake[]) {
  let mag: number | null = null;
  let dist: number | null = null;
  for (const q of quakes) {
    if (q.lat == null || q.lon == null) continue;
    const d = haversineKm(lat, lon, q.lat, q.lon);
    if (d > 700) continue;
    if (mag == null || q.mag > mag) {
      mag = q.mag;
      dist = d;
    }
  }
  return { mag, dist };
}

export async function computeRiskForPoints(points: ComputePoint[]): Promise<ComputeResult> {
  if (points.length === 0)
    return { points: [], oni: null, quakeCount: 0, generatedAt: new Date().toISOString() };

  const [weather, oni, quakes] = await Promise.all([
    fetchWeatherForPoints(points.map((p) => ({ lat: p.lat, lon: p.lon }))),
    getOni(),
    getQuakes(),
  ]);

  const results: PointRisk[] = points.map((p, i) => {
    const w = weather[i] ?? {
      apparentMaxC: null, maxDailyRainMm: null, total16dRainMm: null, maxGustKmh: null, maxPm25: null,
    };
    const { mag, dist } = nearestStrongQuake(p.lat, p.lon, quakes);

    const readings: HazardReading[] = [
      heatSeverity(w.apparentMaxC),
      rainFloodSeverity(w.maxDailyRainMm),
      droughtSeverity(w.total16dRainMm, oni),
      cycloneSeverity(w.maxGustKmh),
      pm25Severity(w.maxPm25),
      earthquakeSeverity(mag, dist),
    ];
    const sectors = p.sectors.map((s) => scoreSector(s, readings));
    const overall = sectors.length ? Math.max(...sectors.map((s) => s.score)) : 0;
    return { id: p.id, name: p.name, readings, sectors, overall };
  });

  return {
    points: results,
    oni,
    quakeCount: quakes.length,
    generatedAt: new Date().toISOString(),
  };
}
