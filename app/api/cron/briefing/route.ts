import { NextRequest, NextResponse } from "next/server";
import { computeRiskForPoints } from "@/lib/compute";
import { DEFAULT_WATCH_POINTS } from "@/lib/watchpoints";
import { sendBriefing, alertEnabled } from "@/lib/alert";
import { RISK_LABEL, levelFromScore, RISK_SECTORS, HAZARDS } from "@/lib/risk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// บรีฟรายสัปดาห์: สรุป "จุดไหนต้องระวังอะไร" เรียงตามความเสี่ยง
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await computeRiskForPoints(
    DEFAULT_WATCH_POINTS.map((p) => ({
      id: p.id, name: p.name, lat: p.lat, lon: p.lon, sectors: p.sectors,
    }))
  );

  const ranked = [...result.points].sort((a, b) => b.overall - a.overall);
  const ensoNote =
    result.oni == null ? "" :
    result.oni >= 0.5 ? `เอลนีโญ (ONI ${result.oni.toFixed(1)})` :
    result.oni <= -0.5 ? `ลานีญา (ONI ${result.oni.toFixed(1)})` :
    `ENSO เป็นกลาง (ONI ${result.oni.toFixed(1)})`;

  const lines: string[] = [];
  for (const p of ranked.slice(0, 6)) {
    const lvl = levelFromScore(p.overall);
    const hazards = [...new Set(p.readings.filter((r) => r.severity > 0.05)
      .sort((a, b) => b.severity - a.severity).map((r) => HAZARDS[r.hazard].label))].slice(0, 3).join(", ");
    lines.push(`• ${p.name} — ${p.overall}/100 (${RISK_LABEL[lvl]})${hazards ? ` · ${hazards}` : ""}`);
  }

  const title = `📋 บรีฟความเสี่ยงประจำสัปดาห์ (${result.generatedAt.slice(0, 10)})`;
  const body = `${ensoNote}\n\nจุดเฝ้าระวังเรียงตามความเสี่ยง:\n${lines.join("\n")}\n\n— Climate & Geo-Risk Monitor`;

  const sent = await sendBriefing(title, body);

  return NextResponse.json({
    ok: true,
    title,
    body,
    alertEnabled: alertEnabled(),
    sent,
    generatedAt: result.generatedAt,
  });
}
