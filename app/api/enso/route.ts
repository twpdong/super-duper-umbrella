import { NextResponse } from "next/server";
import { parseOni, EnsoStatus } from "@/lib/sources";

export const revalidate = 21600; // cache 6 ชม.

// ค่าสำรองกรณีดึงไม่ได้ (อิงข้อมูล NOAA/IRI มิ.ย. 2026)
const FALLBACK: EnsoStatus = {
  oni: 1.7,
  season: "AMJ",
  year: 2026,
  state: "el-nino",
  strength: "ปานกลาง–รุนแรง (กำลังแรงขึ้น)",
  source: "NOAA CPC ONI (ค่าสำรอง — ดึงสดไม่สำเร็จ)",
  fetchedAt: new Date().toISOString(),
};

export async function GET() {
  try {
    const res = await fetch("https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt", {
      next: { revalidate: 21600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const status = parseOni(text);
    if (status.oni === null) return NextResponse.json(FALLBACK);
    return NextResponse.json(status);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
