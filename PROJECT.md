# 🌍 Climate & Geo-Risk Monitor

เครื่องมือ **ติดตาม + พยากรณ์ + เตรียมรับมือ** สถานการณ์ภูมิอากาศ/ธรณีพิบัติ ที่เชื่อมโยงกับ
ความเสี่ยงของโปรเจกต์ — ครอบคลุม **เอลนีโญ (ENSO), แผ่นดินไหว, ความร้อน/แล้ง** พร้อม
**ปฏิทินเตรียมรับมือ 12 เดือน** สำหรับ 4 ภาคส่วน: เกษตร/น้ำ · การเงิน/ธุรกิจ · พลังงาน/โลจิสติกส์ · สุขภาพ/ครัวเรือน

> ปรัชญา: เรา **ไม่สร้างแบบจำลองพยากรณ์แข่งกับ NOAA/ECMWF** แต่ **รวบรวมพยากรณ์ทางการ →
> แปลงเป็นความเสี่ยงเฉพาะโปรเจกต์ → แจ้งเตือน + ออกบรีฟเตรียมตัว**

## สถานะ: เฟส 1–3 (ดู `DESIGN.md` สำหรับสถาปัตยกรรมเต็ม)

- **สถานะ ENSO สด** — ดึงค่า ONI จาก NOAA CPC (`/api/enso`) จัดประเภท เอลนีโญ/ลานีญา/เป็นกลาง
- **ฟีดแผ่นดินไหวสด** — USGS M4.5+ 30 วันล่าสุด (`/api/earthquakes`)
- **ความเสี่ยงรายจุดสด (เฟส 2)** — `/api/risk` คำนวณ Risk = Hazard × Exposure × Vulnerability
  ต่อ (จุด × ภาคส่วน) จาก Open-Meteo (อากาศ/ฝน/ลม/PM2.5) + ONI + USGS — หลายจุด, 6 ภาคส่วน
- **ปฏิทินเตรียมรับมือ 12 เดือน** — แยกตามภาคส่วน + ระดับความเสี่ยงรายช่วง
- **Cron อัตโนมัติ (เฟส 3)** — `/api/cron/ingest` (รายวัน) ดึง+บันทึก+แจ้งเตือน,
  `/api/cron/briefing` (รายสัปดาห์) สรุปบรีฟส่ง LINE
- **Verification Agent (เฟส 3)** — `/api/verify` ตรวจข่าว/โพสต์เทียบข้อมูลทางการสด
  (ใช้ Claude ถ้าตั้ง `ANTHROPIC_API_KEY`, ไม่งั้น fallback heuristic)
- **แจ้งเตือน LINE (เฟส 3)** — push เมื่อจุดใดถึงระดับเสี่ยงสูง/รุนแรง (มี dedupe)

## ตั้งค่า (ทั้งหมด optional — ไม่ตั้งก็ดีพลอย/รันได้)

ดู `.env.example`. สรุป:

| ตัวแปร | ถ้าไม่ตั้ง |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | ไม่บันทึกประวัติ (ยังคำนวณ/แสดงผลได้) |
| `CRON_SECRET` | endpoint `/api/cron/*` เปิดเรียกได้ (dev เท่านั้น) — **ควรตั้งบน prod** |
| `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_TARGET_ID` | ไม่ส่งแจ้งเตือน/บรีฟ |
| `ANTHROPIC_API_KEY` | `/api/verify` ใช้ heuristic แทน LLM |

**Cron** กำหนดใน `vercel.json` (region `sin1`): ingest รายวัน 07:00 ICT, briefing จันทร์ 08:00 ICT

## รันในเครื่อง

```bash
npm install
npm run dev
# เปิด http://localhost:3000
```

API routes ดึงข้อมูลสดฝั่ง server (มีค่าสำรองหากดึงไม่สำเร็จ) — **MVP ไม่ต้องตั้งค่า DB**

## Deploy (Vercel)

push แล้วเชื่อม repo กับ Vercel ได้เลย (ไม่มี env บังคับสำหรับ MVP)

## สถาปัตยกรรม

```
[1] Ingestion (API routes / cron)  →  [2] Database (Supabase — เฟส 2)
                                          ↓
[4] Dashboard (Next.js/Vercel)  ←  [3] Agents: ingest · verify · risk-score · brief · alert
```

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `app/page.tsx` | แดชบอร์ดหลัก |
| `app/api/enso/route.ts` | ดึง + จัดประเภทสถานะ ENSO จาก NOAA |
| `app/api/earthquakes/route.ts` | ดึงฟีดแผ่นดินไหว USGS |
| `lib/preparedness.ts` | ปฏิทินเตรียมตัว 12 เดือน + ผลตรวจสอบโพสต์ |
| `lib/sources.ts` | parser ENSO/แผ่นดินไหว + รายการแหล่งข้อมูล |
| `supabase/schema.sql` | schema ฐานข้อมูล (เฟส 2) |

## โรดแมป

- **เฟส 1:** MVP dashboard — ENSO + แผ่นดินไหวสด + ปฏิทินเตรียมตัว + fact-check ✅
- **เฟส 2:** ความเสี่ยงรายจุดสด H×E×V หลายจุด/6 ภาคส่วน + Open-Meteo + schema ✅
- **เฟส 3:** Cron ingestion + persistence + Verification Agent + แจ้งเตือน/บรีฟ LINE ✅
- **เฟส 4 (ถัดไป):** แหล่งข้อมูลไทย (TMD/ชลประทาน/Air4Thai) + provision Supabase จริง + แผนที่หลายจุด

## ข้อจำกัด

เครื่องมือนี้ช่วย **เตรียมตัว** ไม่ใช่คำพยากรณ์รับประกัน การตัดสินใจสำคัญต้องอ้างอิงประกาศทางการล่าสุดเสมอ
