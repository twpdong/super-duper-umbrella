"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_WATCH_POINTS,
  WatchPoint,
  Scope,
  SCOPE_LABEL,
} from "@/lib/watchpoints";
import {
  RISK_SECTORS,
  RiskSectorKey,
  HAZARDS,
  RISK_LABEL,
  levelFromScore,
} from "@/lib/risk";

const STORAGE_KEY = "watchpoints.v1";

interface SectorRiskOut {
  sector: RiskSectorKey;
  score: number;
  level: "low" | "moderate" | "high" | "severe";
  topHazards: { hazard: keyof typeof HAZARDS; contribution: number; detail: string }[];
}
interface PointRiskOut {
  id: string;
  name: string;
  overall: number;
  readings: { hazard: keyof typeof HAZARDS; severity: number; level: string; detail: string }[];
  sectors: SectorRiskOut[];
}

const ALL_SECTORS = Object.keys(RISK_SECTORS) as RiskSectorKey[];

function loadPoints(): WatchPoint[] {
  if (typeof window === "undefined") return DEFAULT_WATCH_POINTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WATCH_POINTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return DEFAULT_WATCH_POINTS;
}

export default function WatchPoints() {
  const [points, setPoints] = useState<WatchPoint[]>(DEFAULT_WATCH_POINTS);
  const [risk, setRisk] = useState<PointRiskOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  // โหลดจุดจาก localStorage หลัง mount (เลี่ยง hydration mismatch)
  useEffect(() => setPoints(loadPoints()), []);

  const persist = (next: WatchPoint[]) => {
    setPoints(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const compute = useCallback(async (pts: WatchPoint[]) => {
    setLoading(true);
    try {
      const res = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: pts }),
      });
      const data = await res.json();
      setRisk(data.points ?? []);
      setGeneratedAt(data.generatedAt ?? "");
    } catch {
      setRisk([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (points.length) compute(points);
  }, [points, compute]);

  const removePoint = (id: string) => persist(points.filter((p) => p.id !== id));
  const resetDefaults = () => persist(DEFAULT_WATCH_POINTS);

  const riskById = (id: string) => risk.find((r) => r.id === id);
  const sorted = [...points].sort(
    (a, b) => (riskById(b.id)?.overall ?? 0) - (riskById(a.id)?.overall ?? 0)
  );

  return (
    <>
      <h2 className="section-title">
        📍 ความเสี่ยงรายจุด (สด) — {points.length} จุด
        {loading && <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}> · กำลังคำนวณ…</span>}
      </h2>
      <p className="sub" style={{ color: "var(--muted)", fontSize: 13, marginTop: -6 }}>
        คะแนน 0–100 ต่อ (จุด × ภาคส่วน) คำนวณสดด้วย Risk = Hazard × Exposure × Vulnerability
        จาก Open-Meteo (อากาศ/ฝน/ลม/PM2.5) + ONI + USGS
        {generatedAt && ` · อัปเดต ${new Date(generatedAt).toLocaleString("th-TH")}`}
      </p>

      <div className="wp-actions">
        <button className="filter-btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "ปิดฟอร์ม" : "➕ เพิ่มจุด"}
        </button>
        <button className="filter-btn" onClick={() => compute(points)}>🔄 คำนวณใหม่</button>
        <button className="filter-btn" onClick={resetDefaults}>↺ คืนค่าตั้งต้น</button>
      </div>

      {showForm && <AddPointForm onAdd={(p) => { persist([...points, p]); setShowForm(false); }} />}

      <div className="grid cols-2">
        {sorted.map((p) => {
          const r = riskById(p.id);
          const overallLevel = levelFromScore(r?.overall ?? 0);
          return (
            <div key={p.id} className={`period ${overallLevel}`}>
              <div className="months">{SCOPE_LABEL[p.scope]} · {p.lat.toFixed(2)}, {p.lon.toFixed(2)}</div>
              <h3>
                {p.name}{" "}
                <span className={`badge ${overallLevel}`}>
                  รวม {r?.overall ?? "…"} · {RISK_LABEL[overallLevel]}
                </span>
                <button
                  className="wp-x"
                  title="ลบจุดนี้"
                  onClick={() => removePoint(p.id)}
                >
                  ✕
                </button>
              </h3>
              {p.note && <div className="meta">📝 {p.note}</div>}

              {/* ภัยสด */}
              <div className="wp-hazards">
                {r?.readings
                  ?.filter((h) => h.severity > 0.05)
                  .sort((a, b) => b.severity - a.severity)
                  .map((h) => (
                    <span key={h.hazard} className={`badge ${levelFromScore(h.severity * 100)}`} title={h.detail}>
                      {HAZARDS[h.hazard].icon} {HAZARDS[h.hazard].label} {Math.round(h.severity * 100)}
                    </span>
                  ))}
                {r && r.readings.filter((h) => h.severity > 0.05).length === 0 && (
                  <span className="muted" style={{ fontSize: 12.5 }}>ไม่มีภัยเด่นในช่วงพยากรณ์</span>
                )}
              </div>

              {/* ความเสี่ยงต่อภาคส่วน */}
              {p.sectors.map((sk) => {
                const sr = r?.sectors.find((s) => s.sector === sk);
                const lvl = levelFromScore(sr?.score ?? 0);
                return (
                  <div className="sector" key={sk}>
                    <div className="head" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="name">
                        {RISK_SECTORS[sk].icon} {RISK_SECTORS[sk].label}
                      </span>
                      <span className={`badge ${lvl}`}>{sr?.score ?? "…"} · {RISK_LABEL[lvl]}</span>
                    </div>
                    {sr && sr.topHazards.length > 0 && (
                      <div className="watch">
                        ⚠️ ขับเคลื่อนโดย:{" "}
                        {sr.topHazards.map((t) => HAZARDS[t.hazard].label).join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── ฟอร์มเพิ่มจุด ───────────────────────────────────────────────────────────
function AddPointForm({ onAdd }: { onAdd: (p: WatchPoint) => void }) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [scope, setScope] = useState<Scope>("thailand");
  const [sectors, setSectors] = useState<RiskSectorKey[]>(["agri"]);

  const toggle = (s: RiskSectorKey) =>
    setSectors((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const submit = () => {
    const la = Number(lat), lo = Number(lon);
    if (!name.trim() || Number.isNaN(la) || Number.isNaN(lo) || !sectors.length) return;
    onAdd({
      id: `u_${Date.now().toString(36)}`,
      name: name.trim(),
      lat: la,
      lon: lo,
      scope,
      sectors,
    });
  };

  return (
    <div className="card wp-form">
      <div className="wp-row">
        <input placeholder="ชื่อจุด เช่น โรงงานอยุธยา" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="ละติจูด เช่น 14.35" value={lat} onChange={(e) => setLat(e.target.value)} />
        <input placeholder="ลองจิจูด เช่น 100.58" value={lon} onChange={(e) => setLon(e.target.value)} />
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
          {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
            <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
          ))}
        </select>
      </div>
      <div className="wp-sectors">
        {ALL_SECTORS.map((s) => (
          <button
            key={s}
            className={`filter-btn ${sectors.includes(s) ? "active" : ""}`}
            onClick={() => toggle(s)}
          >
            {RISK_SECTORS[s].icon} {RISK_SECTORS[s].label}
          </button>
        ))}
      </div>
      <button className="filter-btn" style={{ marginTop: 10 }} onClick={submit}>บันทึกจุด</button>
    </div>
  );
}
