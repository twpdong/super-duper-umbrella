"use client";

import { useEffect, useState } from "react";
import {
  PREPAREDNESS_CALENDAR,
  POST_VERIFICATION,
  SECTORS,
  SectorKey,
  RiskLevel,
} from "@/lib/preparedness";
import { SOURCES, EnsoStatus, Quake } from "@/lib/sources";

const RISK_LABEL: Record<RiskLevel, string> = {
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  severe: "รุนแรง",
};

const VERDICT_LABEL: Record<string, string> = {
  true: "จริง",
  partly: "บางส่วน",
  false: "ผิด",
};

export default function Dashboard() {
  const [enso, setEnso] = useState<EnsoStatus | null>(null);
  const [quakes, setQuakes] = useState<Quake[]>([]);
  const [filter, setFilter] = useState<SectorKey | "all">("all");

  useEffect(() => {
    fetch("/api/enso").then((r) => r.json()).then(setEnso).catch(() => {});
    fetch("/api/earthquakes")
      .then((r) => r.json())
      .then((d) => setQuakes(d.quakes ?? []))
      .catch(() => {});
  }, []);

  const ensoStateLabel =
    enso?.state === "el-nino" ? "เอลนีโญ" : enso?.state === "la-nina" ? "ลานีญา" : "เป็นกลาง";
  const sectorKeys = Object.keys(SECTORS) as SectorKey[];
  const visibleSectors = filter === "all" ? sectorKeys : [filter];

  return (
    <div className="wrap">
      <header className="top">
        <h1>🌍 Climate &amp; Geo-Risk Monitor</h1>
        <p>
          ติดตามเอลนีโญ · แผ่นดินไหว · ความร้อน/แล้ง — พร้อมปฏิทินเตรียมรับมือ 12 เดือน
          (เกษตร · การเงิน · พลังงาน · สุขภาพ)
        </p>
      </header>

      {/* ── สถานะปัจจุบัน ── */}
      <div className="grid cols-3">
        <div className="card">
          <h2>สถานะ ENSO ปัจจุบัน</h2>
          <div className={`big enso-${enso?.state ?? "neutral"}`}>{enso ? ensoStateLabel : "…"}</div>
          <div className="sub">
            {enso
              ? `ONI = ${enso.oni?.toFixed(2)}°C (${enso.season} ${enso.year}) · ${enso.strength}`
              : "กำลังโหลด…"}
          </div>
          <div className="sub" style={{ marginTop: 6 }}>ที่มา: {enso?.source}</div>
        </div>

        <div className="card">
          <h2>แผ่นดินไหวสำคัญล่าสุด</h2>
          <div className="big">{quakes.length > 0 ? `M${quakes[0].mag.toFixed(1)}` : "…"}</div>
          <div className="sub">{quakes.length > 0 ? quakes[0].place : "กำลังโหลด…"}</div>
          <div className="sub" style={{ marginTop: 6 }}>ที่มา: USGS (M4.5+ 30 วันล่าสุด)</div>
        </div>

        <div className="card">
          <h2>ความแม่นยำของโพสต์ที่ตรวจสอบ</h2>
          <div className="score-ring">{POST_VERIFICATION.score}%</div>
          <div className="sub">เหตุการณ์จริง แต่กลไกบางส่วนคลาดเคลื่อน</div>
        </div>
      </div>

      {/* ── ปฏิทินเตรียมตัว 12 เดือน ── */}
      <h2 className="section-title">📅 ปฏิทินเตรียมรับมือ 12 เดือน (มิ.ย. 2026 → พ.ค. 2027)</h2>
      <div className="filters">
        <button
          className={`filter-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          ทุกภาคส่วน
        </button>
        {sectorKeys.map((k) => (
          <button
            key={k}
            className={`filter-btn ${filter === k ? "active" : ""}`}
            onClick={() => setFilter(k)}
          >
            {SECTORS[k].icon} {SECTORS[k].label}
          </button>
        ))}
      </div>

      <div className="grid cols-2">
        {PREPAREDNESS_CALENDAR.map((p) => (
          <div key={p.id} className={`period ${p.overall}`}>
            <div className="months">{p.months}</div>
            <h3>
              {p.title} <span className={`badge ${p.overall}`}>เสี่ยง{RISK_LABEL[p.overall]}</span>
            </h3>
            <div className="meta">🌊 เอลนีโญ: {p.ensoPhase}</div>
            <div className="meta">🗓️ ฤดูกาล: {p.season}</div>
            <div className="headline">👉 {p.headline}</div>

            {visibleSectors.map((sk) => {
              const s = p.sectors[sk];
              return (
                <div className="sector" key={sk}>
                  <div className="head">
                    <span className="name">
                      {SECTORS[sk].icon} {SECTORS[sk].label}
                    </span>
                    <span className={`badge ${s.risk}`}>{RISK_LABEL[s.risk]}</span>
                  </div>
                  <div className="watch">⚠️ เฝ้าระวัง: {s.watch}</div>
                  <ul>
                    {s.prepare.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── ตรวจสอบโพสต์ ── */}
      <h2 className="section-title">🔍 ผลตรวจสอบโพสต์ไวรัล</h2>
      <div className="card">
        <p className="sub" style={{ marginTop: 0 }}>{POST_VERIFICATION.summary}</p>
        {POST_VERIFICATION.items.map((it, i) => (
          <div className="verify-row" key={i}>
            <span className={`badge ${it.verdict}`} style={{ minWidth: 64, textAlign: "center" }}>
              {VERDICT_LABEL[it.verdict]}
            </span>
            <div>
              <div>{it.claim}</div>
              <div className="note">{it.note}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── ฟีดแผ่นดินไหว ── */}
      <h2 className="section-title">🌐 ฟีดแผ่นดินไหว (USGS M4.5+)</h2>
      <div className="card">
        {quakes.length === 0 && <div className="muted">กำลังโหลด หรือดึงข้อมูลไม่สำเร็จ…</div>}
        {quakes.map((q) => (
          <div className="quake-row" key={q.id}>
            <span className={`quake-mag ${q.mag >= 6 ? "strong" : ""}`}>{q.mag.toFixed(1)}</span>
            <div>
              <div>
                <a href={q.url} target="_blank" rel="noreferrer">
                  {q.place}
                </a>
              </div>
              <div className="muted">
                {new Date(q.time).toLocaleString("th-TH")} · ลึก{" "}
                {q.depth != null ? `${q.depth.toFixed(0)} กม.` : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── แหล่งข้อมูล ── */}
      <h2 className="section-title">🔗 แหล่งข้อมูล (ดึงอัตโนมัติ)</h2>
      <div className="card">
        {SOURCES.map((s) => (
          <div className="verify-row" key={s.key}>
            <span className="badge moderate" style={{ minWidth: 90, textAlign: "center" }}>
              {s.topic}
            </span>
            <div>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="disclaimer">
        ⚠️ เครื่องมือนี้ <b>รวบรวมและสรุป</b> พยากรณ์จากสถาบันทางการ (NOAA, USGS, IRI ฯลฯ)
        ไม่ได้สร้างแบบจำลองพยากรณ์เอง — ใช้เพื่อ "เตรียมตัว" ไม่ใช่คำพยากรณ์รับประกัน
        การตัดสินใจสำคัญควรอ้างอิงประกาศทางการล่าสุดเสมอ
      </div>

      <div className="foot">
        <div>Climate &amp; Geo-Risk Monitor — MVP · Next.js + Supabase + Vercel</div>
      </div>
    </div>
  );
}
