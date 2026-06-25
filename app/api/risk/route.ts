import { NextRequest, NextResponse } from "next/server";
import { fetchWeatherForPoints } from "@/lib/openmeteo";
import { parseOni, parseQuakes } from "@/lib/sources";
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
} from "@/lib/risk";

export const dynamic = "force-dynamic"; // คำนวณสดตาม points ที่ส่งมา

interface InPoint {
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
  overall: number; // คะแนนสูงสุดในบรรดาภาคส่วนของจุดนี้
}

async function getOni(): Promise<number | null> {
  try {
    const res = await fetch("https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt", {
      next: { revalidate: 21600 },
    });
    if (!res.ok) return 1.7; // ค่าสำรอง (เอลนีโญกำลังแรง มิ.ย. 2026)
    return parseOni(await res.text()).oni ?? 1.7;
  } catch {
    return 1.7;
  }
}

async function getQuakes() {
  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
      { next: { revalidate: 1800 } }
    );
    if (!res.ok) return [];
    return parseQuakes(await res.json());
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  let points: InPoint[];
  try {
    const body = await req.json();
    points = Array.isArray(body?.points) ? body.points : [];
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (points.length === 0) return NextResponse.json({ points: [], generatedAt: new Date().toISOString() });

  const [weather, oni, quakes] = await Promise.all([
    fetchWeatherForPoints(points.map((p) => ({ lat: p.lat, lon: p.lon }))),
    getOni(),
    getQuakes(),
  ]);

  const results: PointRisk[] = points.map((p, i) => {
    const w = weather[i] ?? {
      apparentMaxC: null, maxDailyRainMm: null, total16dRainMm: null, maxGustKmh: null, maxPm25: null,
    };

    // แผ่นดินไหวที่ใกล้จุดที่สุด (ในรัศมีพิจารณา 700 กม.)
    let nearestMag: number | null = null;
    let nearestDist: number | null = null;
    for (const q of quakes) {
      if (q.lat == null || q.lon == null) continue;
      const d = haversineKm(p.lat, p.lon, q.lat, q.lon);
      if (d > 700) continue;
      if (nearestDist == null || q.mag > (nearestMag ?? 0)) {
        // เลือกเหตุที่แรงสุดในรัศมี
        if (nearestMag == null || q.mag > nearestMag) {
          nearestMag = q.mag;
          nearestDist = d;
        }
      }
    }

    const readings: HazardReading[] = [
      heatSeverity(w.apparentMaxC),
      rainFloodSeverity(w.maxDailyRainMm),
      droughtSeverity(w.total16dRainMm, oni),
      cycloneSeverity(w.maxGustKmh),
      pm25Severity(w.maxPm25),
      earthquakeSeverity(nearestMag, nearestDist),
    ];

    const sectors = p.sectors.map((s) => scoreSector(s, readings));
    const overall = sectors.length ? Math.max(...sectors.map((s) => s.score)) : 0;

    return { id: p.id, name: p.name, readings, sectors, overall };
  });

  return NextResponse.json({
    points: results,
    oni,
    generatedAt: new Date().toISOString(),
  });
}
