// ─────────────────────────────────────────────────────────────────────────────
// Risk engine — Risk = Hazard × Exposure × Vulnerability  (กรอบ UNDRR/IPCC)
// อ้างอิง DESIGN.md ส่วนที่ 7 (Hazard taxonomy) และ 9 (Risk scoring)
//
// - Hazard (H):   ความรุนแรงของภัย normalize 0..1 จากข้อมูล/พยากรณ์สด
// - Exposure (E): จุด/โปรเจกต์อยู่ในพื้นที่รับภัยแค่ไหน 0..1 (จากพิกัด/ชายฝั่ง/ลุ่มน้ำ)
// - Vulnerability(V): ภาคส่วนอ่อนไหวต่อภัยนั้นแค่ไหน 0..1 (เมทริกซ์ตายตัว)
//
// ผลลัพธ์: คะแนน 0..100 ต่อ (จุด × ภาคส่วน) พร้อม rationale อธิบายว่ามาจาก hazard ใด
// ─────────────────────────────────────────────────────────────────────────────

export type HazardKey =
  | "heat"
  | "drought"
  | "rain_flood"
  | "cyclone"
  | "earthquake"
  | "pm25";

export type RiskSectorKey =
  | "agri"
  | "finance"
  | "logistics"
  | "realestate"
  | "energy"
  | "health";

export type RiskLevel = "low" | "moderate" | "high" | "severe";

export const HAZARDS: Record<
  HazardKey,
  { label: string; icon: string; unit: string }
> = {
  heat: { label: "คลื่นความร้อน", icon: "🌡️", unit: "°C (รู้สึกได้)" },
  drought: { label: "แล้ง/ฝนน้อย", icon: "🏜️", unit: "มม./16 วัน" },
  rain_flood: { label: "ฝนหนัก/น้ำท่วม", icon: "🌊", unit: "มม./วัน" },
  cyclone: { label: "พายุ/ลมแรง", icon: "🌀", unit: "กม./ชม. (gust)" },
  earthquake: { label: "แผ่นดินไหว", icon: "🌐", unit: "M (ใกล้จุด)" },
  pm25: { label: "ฝุ่น PM2.5", icon: "😷", unit: "µg/m³" },
};

export const RISK_SECTORS: Record<RiskSectorKey, { label: string; icon: string }> = {
  agri: { label: "เกษตร / น้ำ / อาหาร", icon: "🌾" },
  finance: { label: "การเงิน / ลงทุน / ประกัน", icon: "📈" },
  logistics: { label: "โลจิสติกส์ / ซัพพลายเชน", icon: "🚚" },
  realestate: { label: "อสังหา / ก่อสร้าง / อีเวนต์", icon: "🏗️" },
  energy: { label: "พลังงาน", icon: "⚡" },
  health: { label: "สุขภาพ / ครัวเรือน", icon: "🏠" },
};

// เมทริกซ์ Vulnerability (V) 0..1 — DESIGN.md §9
// แถว = ภาคส่วน, คอลัมน์ = ภัย
export const VULNERABILITY: Record<RiskSectorKey, Record<HazardKey, number>> = {
  agri:       { drought: 1.0, heat: 0.8, rain_flood: 0.7, cyclone: 0.6, earthquake: 0.1, pm25: 0.2 },
  finance:    { drought: 0.6, heat: 0.4, rain_flood: 0.8, cyclone: 0.8, earthquake: 0.7, pm25: 0.2 },
  logistics:  { drought: 0.3, heat: 0.5, rain_flood: 0.9, cyclone: 0.9, earthquake: 0.5, pm25: 0.2 },
  realestate: { drought: 0.2, heat: 0.8, rain_flood: 0.8, cyclone: 0.8, earthquake: 0.7, pm25: 0.5 },
  energy:     { drought: 0.7, heat: 0.9, rain_flood: 0.5, cyclone: 0.6, earthquake: 0.3, pm25: 0.1 },
  health:     { drought: 0.3, heat: 1.0, rain_flood: 0.6, cyclone: 0.5, earthquake: 0.4, pm25: 1.0 },
};

// ─── Hazard severity: แปลงค่าวัด/พยากรณ์ดิบ → 0..1 ตามเกณฑ์ 4 ขั้น ──────────────
// คืน {severity, level, detail} เพื่อใช้ทั้งคำนวณและอธิบาย (explainable)

function lerp(v: number, lo: number, hi: number): number {
  if (hi === lo) return v >= hi ? 1 : 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export function levelFromScore(score: number): RiskLevel {
  if (score >= 75) return "severe";
  if (score >= 50) return "high";
  if (score >= 25) return "moderate";
  return "low";
}

export interface HazardReading {
  hazard: HazardKey;
  severity: number; // 0..1
  level: RiskLevel;
  value: number | null; // ค่าดิบที่ใช้
  detail: string; // ข้อความอธิบาย
}

// heat index (รู้สึกได้) สูงสุดใน 7 วันข้างหน้า — เกณฑ์อิงดัชนีความร้อน
export function heatSeverity(apparentMaxC: number | null): HazardReading {
  if (apparentMaxC == null)
    return { hazard: "heat", severity: 0, level: "low", value: null, detail: "ไม่มีข้อมูล" };
  // 32=ระวัง, 41=อันตราย, 54=อันตรายมาก
  const sev = lerp(apparentMaxC, 32, 50);
  return {
    hazard: "heat",
    severity: sev,
    level: levelFromScore(sev * 100),
    value: apparentMaxC,
    detail: `อุณหภูมิรู้สึกได้สูงสุด ~${apparentMaxC.toFixed(0)}°C ใน 7 วัน`,
  };
}

// ฝนหนักสุดรายวันใน 7 วัน (มม./วัน)
export function rainFloodSeverity(maxDailyMm: number | null): HazardReading {
  if (maxDailyMm == null)
    return { hazard: "rain_flood", severity: 0, level: "low", value: null, detail: "ไม่มีข้อมูล" };
  const sev = lerp(maxDailyMm, 35, 120); // 35=ฝนหนัก, 90+=หนักมาก/ท่วม
  return {
    hazard: "rain_flood",
    severity: sev,
    level: levelFromScore(sev * 100),
    value: maxDailyMm,
    detail: `ฝนหนักสุด ~${maxDailyMm.toFixed(0)} มม./วัน ใน 7 วัน`,
  };
}

// แล้ง: ฝนรวม 16 วันต่ำ + ปรับด้วยเอลนีโญ (oni>0 ⇒ แล้งง่ายขึ้นในไทย/SEA)
export function droughtSeverity(total16dMm: number | null, oni: number | null): HazardReading {
  if (total16dMm == null)
    return { hazard: "drought", severity: 0, level: "low", value: null, detail: "ไม่มีข้อมูล" };
  // ฝนรวม 16 วัน: 80มม.=ปกติ, 10มม.=แล้งจัด (กลับด้าน)
  let sev = 1 - lerp(total16dMm, 10, 80);
  const ensoBoost = oni && oni > 0 ? Math.min(0.25, oni * 0.12) : 0; // เอลนีโญดันขึ้น
  sev = Math.max(0, Math.min(1, sev + ensoBoost));
  return {
    hazard: "drought",
    severity: sev,
    level: levelFromScore(sev * 100),
    value: total16dMm,
    detail: `ฝนรวม 16 วัน ~${total16dMm.toFixed(0)} มม.${ensoBoost ? ` (+เอลนีโญ ONI ${oni!.toFixed(1)})` : ""}`,
  };
}

// พายุ/ลมแรง: ลมกระโชกสูงสุด (กม./ชม.)
export function cycloneSeverity(maxGustKmh: number | null): HazardReading {
  if (maxGustKmh == null)
    return { hazard: "cyclone", severity: 0, level: "low", value: null, detail: "ไม่มีข้อมูล" };
  const sev = lerp(maxGustKmh, 50, 120); // 62=พายุดีเปรสชัน, 88+=โซนร้อน/ไต้ฝุ่น
  return {
    hazard: "cyclone",
    severity: sev,
    level: levelFromScore(sev * 100),
    value: maxGustKmh,
    detail: `ลมกระโชกสูงสุด ~${maxGustKmh.toFixed(0)} กม./ชม. ใน 7 วัน`,
  };
}

// PM2.5 สูงสุด (µg/m³) — เกณฑ์อิง WHO/AQI
export function pm25Severity(maxPm25: number | null): HazardReading {
  if (maxPm25 == null)
    return { hazard: "pm25", severity: 0, level: "low", value: null, detail: "ไม่มีข้อมูล" };
  const sev = lerp(maxPm25, 25, 150); // 25=เริ่มกระทบ, 150=อันตราย
  return {
    hazard: "pm25",
    severity: sev,
    level: levelFromScore(sev * 100),
    value: maxPm25,
    detail: `PM2.5 สูงสุด ~${maxPm25.toFixed(0)} µg/m³`,
  };
}

// แผ่นดินไหว: แผ่นดินไหวแรงสุดที่ "ใกล้จุด" ในช่วงข้อมูล (M ปรับตามระยะทาง)
export function earthquakeSeverity(
  nearbyMaxMag: number | null,
  distanceKm: number | null
): HazardReading {
  if (nearbyMaxMag == null || distanceKm == null)
    return { hazard: "earthquake", severity: 0, level: "low", value: null, detail: "ไม่มีเหตุใกล้จุด" };
  // ลดทอนตามระยะ: ใกล้ <100กม. เต็ม, ไกล >700กม. แทบไม่กระทบ
  const proximity = 1 - lerp(distanceKm, 100, 700);
  const magPart = lerp(nearbyMaxMag, 4.5, 7.5);
  const sev = Math.max(0, Math.min(1, magPart * proximity));
  return {
    hazard: "earthquake",
    severity: sev,
    level: levelFromScore(sev * 100),
    value: nearbyMaxMag,
    detail: `M${nearbyMaxMag.toFixed(1)} ห่าง ~${distanceKm.toFixed(0)} กม.`,
  };
}

// ─── รวมเป็นคะแนนความเสี่ยงต่อ (จุด × ภาคส่วน) ────────────────────────────────
export interface SectorRisk {
  sector: RiskSectorKey;
  score: number; // 0..100
  level: RiskLevel;
  topHazards: { hazard: HazardKey; contribution: number; detail: string }[];
}

// score = 100 × (0.7·max(H·E·V) + 0.3·mean(H·E·V)) — ภัยเด่นเป็นตัวขับหลัก
export function scoreSector(
  sector: RiskSectorKey,
  readings: HazardReading[],
  exposure = 1
): SectorRisk {
  const contribs = readings.map((r) => {
    const v = VULNERABILITY[sector][r.hazard] ?? 0;
    return { hazard: r.hazard, contribution: r.severity * exposure * v, detail: r.detail };
  });
  const vals = contribs.map((c) => c.contribution);
  const max = vals.length ? Math.max(...vals) : 0;
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const score = Math.round(100 * (0.7 * max + 0.3 * mean));
  const topHazards = contribs
    .filter((c) => c.contribution > 0.05)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);
  return { sector, score, level: levelFromScore(score), topHazards };
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  severe: "รุนแรง",
};

// ระยะทาง great-circle (กม.) — ใช้จับคู่แผ่นดินไหวกับจุด
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
