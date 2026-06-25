// ─────────────────────────────────────────────────────────────────────────────
// Watch points — จุดเฝ้าระวังหลายจุด (DESIGN.md §4)
// 3 ระดับ: global · regional (SEA) · local (ไทย)
// ผู้ใช้แก้ไข/เพิ่มจุดได้เอง (เก็บใน localStorage) — ชุดนี้คือค่าตั้งต้น
// ─────────────────────────────────────────────────────────────────────────────

import { RiskSectorKey } from "./risk";

export type Scope = "thailand" | "sea" | "global";

export interface WatchPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  scope: Scope;
  sectors: RiskSectorKey[];
  note?: string;
}

export const SCOPE_LABEL: Record<Scope, string> = {
  thailand: "🇹🇭 ไทย",
  sea: "🌏 อาเซียน",
  global: "🌐 โลก",
};

export const DEFAULT_WATCH_POINTS: WatchPoint[] = [
  // ── ไทย (หลัก) ──
  { id: "bkk", name: "กรุงเทพฯ", lat: 13.75, lon: 100.52, scope: "thailand",
    sectors: ["realestate", "finance", "logistics", "health"], note: "เมืองหลวง/น้ำท่วม/PM2.5" },
  { id: "cnx", name: "เชียงใหม่", lat: 18.79, lon: 98.98, scope: "thailand",
    sectors: ["health", "agri", "realestate"], note: "หมอกควัน/PM2.5 หน้าแล้ง" },
  { id: "kkc", name: "ขอนแก่น (อีสาน)", lat: 16.44, lon: 102.83, scope: "thailand",
    sectors: ["agri", "energy", "finance"], note: "แล้ง/เกษตรอีสาน" },
  { id: "hdy", name: "หาดใหญ่/สงขลา", lat: 7.01, lon: 100.47, scope: "thailand",
    sectors: ["logistics", "realestate", "agri"], note: "น้ำท่วมภาคใต้/ชายแดน" },
  { id: "ryg", name: "ระยอง (EEC)", lat: 12.68, lon: 101.28, scope: "thailand",
    sectors: ["logistics", "energy", "realestate"], note: "นิคมอุตสาหกรรม/ท่าเรือ" },
  // ── อาเซียน (ภูมิภาค) ──
  { id: "sgn", name: "โฮจิมินห์ (เวียดนาม)", lat: 10.82, lon: 106.63, scope: "sea",
    sectors: ["logistics", "agri", "finance"], note: "ซัพพลายเชน/สามเหลี่ยมปากแม่น้ำ" },
  { id: "mnl", name: "มะนิลา (ฟิลิปปินส์)", lat: 14.6, lon: 120.98, scope: "sea",
    sectors: ["logistics", "finance", "realestate"], note: "เส้นทางไต้ฝุ่นหลัก" },
  { id: "sin", name: "สิงคโปร์", lat: 1.35, lon: 103.82, scope: "sea",
    sectors: ["finance", "logistics"], note: "ศูนย์กลางการเงิน/ท่าเรือ" },
  // ── โลก (บริบทภาพใหญ่ / เลือกเปิดได้) ──
  { id: "tyo", name: "โตเกียว (ญี่ปุ่น)", lat: 35.68, lon: 139.69, scope: "global",
    sectors: ["finance", "logistics"], note: "แผ่นดินไหว/ซัพพลายเชนเอเชียตะวันออก" },
];
