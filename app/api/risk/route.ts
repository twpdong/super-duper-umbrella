import { NextRequest, NextResponse } from "next/server";
import { computeRiskForPoints, ComputePoint } from "@/lib/compute";

export const dynamic = "force-dynamic"; // คำนวณสดตาม points ที่ส่งมา

export async function POST(req: NextRequest) {
  let points: ComputePoint[];
  try {
    const body = await req.json();
    points = Array.isArray(body?.points) ? body.points : [];
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await computeRiskForPoints(points);
  return NextResponse.json(result);
}
