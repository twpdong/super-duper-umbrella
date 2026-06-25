import { NextResponse } from "next/server";
import { parseQuakes } from "@/lib/sources";

export const revalidate = 1800; // cache 30 นาที

export async function GET() {
  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
      { next: { revalidate: 1800 } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const quakes = parseQuakes(json).slice(0, 20);
    return NextResponse.json({ quakes, source: "USGS", fetchedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ quakes: [], source: "USGS (ดึงไม่สำเร็จ)", fetchedAt: new Date().toISOString() });
  }
}
