import { NextRequest, NextResponse } from "next/server";
import { parseOni, parseQuakes } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── ดึงข้อมูลทางการสดเพื่อใช้ "ground" การตรวจสอบ ──
async function liveContext() {
  let oni: number | null = null;
  let quakes: { mag: number; place: string; time: number }[] = [];
  try {
    const r = await fetch("https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt", {
      next: { revalidate: 21600 },
    });
    if (r.ok) oni = parseOni(await r.text()).oni;
  } catch {}
  try {
    const r = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
      { next: { revalidate: 1800 } }
    );
    if (r.ok)
      quakes = parseQuakes(await r.json())
        .filter((q) => q.mag >= 6)
        .slice(0, 10)
        .map((q) => ({ mag: q.mag, place: q.place, time: q.time }));
  } catch {}
  return { oni, quakes };
}

interface VerifyItem {
  claim: string;
  verdict: "true" | "partly" | "false";
  note: string;
}
interface VerifyResult {
  score: number;
  summary: string;
  items: VerifyItem[];
  method: "llm" | "heuristic";
  groundedOn: { oni: number | null; bigQuakes: number };
}

// ── ตัวตรวจแบบ heuristic (fallback เมื่อไม่ตั้ง ANTHROPIC_API_KEY) ──
function heuristicVerify(text: string, ctx: { oni: number | null; quakes: any[] }): VerifyResult {
  const t = text.toLowerCase();
  const items: VerifyItem[] = [];

  if (/เอลนีโญ|el ?ni[nñ]o|ลานีญา|la ?ni[nñ]a|enso/i.test(text)) {
    const state = ctx.oni == null ? "ไม่ทราบ" : ctx.oni >= 0.5 ? "เอลนีโญ" : ctx.oni <= -0.5 ? "ลานีญา" : "เป็นกลาง";
    items.push({
      claim: "การกล่าวถึงสถานะ ENSO (เอลนีโญ/ลานีญา)",
      verdict: ctx.oni == null ? "partly" : "true",
      note: `ข้อมูลทางการล่าสุด: ONI = ${ctx.oni ?? "—"} → สถานะ ${state} (NOAA CPC)`,
    });
  }
  if (/4 ?เฟส|4 ?phase|สี่เฟส/i.test(text)) {
    items.push({
      claim: "เอลนีโญมี '4 เฟส'",
      verdict: "false",
      note: "ผิด — เอลนีโญไม่มี 4 เฟส มันคือการ 'ขยายความรุนแรง' ฤดูกาลปกติ (ฝนน้อย/ร้อน/แล้งมากขึ้น)",
    });
  }
  if (/(แผ่นดินไหว|earthquake).*(ร้อน|ภูมิอากาศ|climate|เอลนีโญ)|(ร้อน|climate|เอลนีโญ).*(แผ่นดินไหว|earthquake)/i.test(text)) {
    items.push({
      claim: "โยงแผ่นดินไหวเข้ากับความร้อน/ภูมิอากาศ",
      verdict: "false",
      note: "ผิด — แผ่นดินไหวเป็นธรณีแปรสัณฐาน ไม่เกี่ยวกับภูมิอากาศ การเกิดพร้อมกันเป็นความบังเอิญ",
    });
  }
  if (/ไต้ฝุ่น|typhoon|พายุ/i.test(text) && /มากที่สุด|มากสุด|record|ทุบสถิติ|ที่สุดเท่าที่/i.test(text)) {
    items.push({
      claim: "พายุ/ไต้ฝุ่นจะ 'มากที่สุดเท่าที่เคยมี'",
      verdict: "partly",
      note: "ระวังเกินจริง — ฤดูพายุอาจเหนือค่าเฉลี่ยได้ แต่คำว่า 'มากสุดเป็นประวัติการณ์' มักไม่มีหลักฐานรองรับ และเอลนีโญมักลดจำนวนพายุขึ้นฝั่งอาเซียน",
    });
  }
  if (items.length === 0) {
    items.push({
      claim: "เนื้อหาโดยรวม",
      verdict: "partly",
      note: "ตรวจอัตโนมัติแบบ heuristic ไม่พบรูปแบบที่รู้จัก — แนะนำตั้ง ANTHROPIC_API_KEY เพื่อตรวจเชิงลึกด้วย LLM",
    });
  }

  const weight = { true: 100, partly: 60, false: 15 };
  const score = Math.round(items.reduce((a, i) => a + weight[i.verdict], 0) / items.length);
  return {
    score,
    summary: "ผลตรวจแบบ heuristic (เทียบกับข้อมูลทางการสด) — เปิดใช้ LLM เพื่อความละเอียดสูงขึ้น",
    items,
    method: "heuristic",
    groundedOn: { oni: ctx.oni, bigQuakes: ctx.quakes.length },
  };
}

// ── ตัวตรวจด้วย Claude (เมื่อมี ANTHROPIC_API_KEY) ──
async function llmVerify(text: string, ctx: { oni: number; quakes: any[] }): Promise<VerifyResult | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  const system =
    "คุณเป็นผู้ตรวจสอบข้อเท็จจริงด้านภูมิอากาศ/ภัยพิบัติ ตอบเป็นภาษาไทย " +
    "แยก 'ข้อเท็จจริง' ออกจาก 'การตีความ/กลไกเชิงสาเหตุ' เสมอ ระวัง misinformation ที่พบบ่อย: " +
    "(1) เอลนีโญไม่มี '4 เฟส' (2) แผ่นดินไหวไม่เกี่ยวกับภูมิอากาศ (3) คำกล่าวเกินจริงแบบ 'มากสุดเป็นประวัติการณ์'. " +
    "ใช้ข้อมูลทางการสดที่ให้มาเป็นหลักอ้างอิง ตอบกลับเป็น JSON เท่านั้น";
  const user =
    `ข้อมูลทางการสด: ONI ล่าสุด = ${ctx.oni} (>=0.5 เอลนีโญ, <=-0.5 ลานีญา). ` +
    `แผ่นดินไหว M6+ ล่าสุด: ${ctx.quakes.map((q) => `M${q.mag} ${q.place}`).join("; ") || "ไม่มี"}.\n\n` +
    `ตรวจสอบโพสต์นี้ แยกเป็นข้ออ้าง (claims) แต่ละข้อ:\n"""${text.slice(0, 4000)}"""\n\n` +
    `ตอบ JSON: {"score": <0-100 ความน่าเชื่อถือรวม>, "summary": "<สรุปสั้น>", ` +
    `"items": [{"claim": "<ข้ออ้าง>", "verdict": "true|partly|false", "note": "<เหตุผล+อ้างอิง>"}]}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt: string = data?.content?.[0]?.text ?? "";
    const json = txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json);
    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      summary: String(parsed.summary ?? ""),
      items: Array.isArray(parsed.items) ? parsed.items.slice(0, 12) : [],
      method: "llm",
      groundedOn: { oni: ctx.oni, bigQuakes: ctx.quakes.length },
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text : "";
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!text.trim()) return NextResponse.json({ error: "empty text" }, { status: 400 });

  const ctx = await liveContext();
  const llm = await llmVerify(text, { oni: ctx.oni ?? 0, quakes: ctx.quakes });
  const result = llm ?? heuristicVerify(text, ctx);
  return NextResponse.json(result);
}
