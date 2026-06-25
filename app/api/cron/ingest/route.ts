import { NextRequest, NextResponse } from "next/server";
import { computeRiskForPoints } from "@/lib/compute";
import { DEFAULT_WATCH_POINTS } from "@/lib/watchpoints";
import { insertRows, logSource, dbEnabled } from "@/lib/db";
import { sendAlert, alertEnabled } from "@/lib/alert";
import { RISK_LABEL, levelFromScore, RISK_SECTORS, HAZARDS } from "@/lib/risk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron แนบ Authorization: Bearer ${CRON_SECRET} อัตโนมัติเมื่อมี env นี้
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: ไม่ตั้ง secret → ปล่อยผ่าน
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await computeRiskForPoints(
    DEFAULT_WATCH_POINTS.map((p) => ({
      id: p.id, name: p.name, lat: p.lat, lon: p.lon, sectors: p.sectors,
    }))
  );

  const now = new Date().toISOString();
  await logSource("openmeteo+oni+usgs", "ok", undefined, {
    oni: result.oni, quakeCount: result.quakeCount, points: result.points.length,
  });

  // ── persist (ถ้าเปิด DB) ──
  let persisted = { indicators: 0, risk_scores: 0 };
  if (dbEnabled()) {
    if (result.oni != null) {
      await insertRows("indicators", [
        { indicator: "oni", region: "nino3.4", value: result.oni, unit: "degC", observed_at: now, source: "NOAA CPC" },
      ]);
      persisted.indicators = 1;
    }
    const riskRows = result.points.flatMap((p) =>
      p.sectors.map((s) => ({
        project_id: null,
        sector: s.sector,
        period: now.slice(0, 10),
        level: s.level,
        score: s.score,
        rationale: `${p.name}: ${s.topHazards.map((t) => HAZARDS[t.hazard].label).join(", ") || "ไม่มีภัยเด่น"}`,
      }))
    );
    const r = await insertRows("risk_scores", riskRows);
    persisted.risk_scores = r.count ?? 0;
  }

  // ── alerts: จุดที่ความเสี่ยงรวมถึงระดับสูง/รุนแรง ──
  const alerts: { point: string; level: string; sent: boolean; deduped?: boolean }[] = [];
  for (const p of result.points) {
    const lvl = levelFromScore(p.overall);
    if (lvl !== "high" && lvl !== "severe") continue;
    const top = p.sectors.sort((a, b) => b.score - a.score)[0];
    const hazards = [...new Set(p.sectors.flatMap((s) => s.topHazards.map((t) => HAZARDS[t.hazard].label)))]
      .slice(0, 3).join(", ");
    const title = `⚠️ เสี่ยง${RISK_LABEL[lvl]}: ${p.name}`;
    const body =
      `คะแนนรวม ${p.overall}/100 (${RISK_LABEL[lvl]})\n` +
      `ภาคส่วนเสี่ยงสุด: ${RISK_SECTORS[top.sector].label} ${top.score}\n` +
      `ภัยหลัก: ${hazards || "—"}`;
    const res = await sendAlert({ level: lvl, title, body });
    alerts.push({ point: p.name, level: lvl, sent: res.sent, deduped: res.deduped });
  }

  return NextResponse.json({
    ok: true,
    generatedAt: result.generatedAt,
    oni: result.oni,
    quakeCount: result.quakeCount,
    pointsScored: result.points.length,
    dbEnabled: dbEnabled(),
    persisted,
    alertEnabled: alertEnabled(),
    alerts,
  });
}
