// ─────────────────────────────────────────────────────────────────────────────
// Alerting — LINE Messaging API push (LINE Notify ถูกยกเลิกแล้วปี 2025)
// Env-gated: LINE_CHANNEL_ACCESS_TOKEN + LINE_TARGET_ID (userId/groupId)
// Dedupe ผ่านตาราง alerts ใน Supabase (ถ้าเปิด) เพื่อกันสแปม
// ─────────────────────────────────────────────────────────────────────────────

import { insertRows, selectRows, dbEnabled } from "./db";

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const TARGET = process.env.LINE_TARGET_ID;

export function alertEnabled(): boolean {
  return Boolean(TOKEN && TARGET);
}

async function pushLine(text: string): Promise<boolean> {
  if (!alertEnabled()) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: TARGET,
        messages: [{ type: "text", text: text.slice(0, 4900) }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// กันยิงซ้ำ: เคยส่ง alert key เดียวกันใน cooldown ชั่วโมงหรือยัง
async function recentlyAlerted(dedupeKey: string, cooldownHours = 12): Promise<boolean> {
  if (!dbEnabled()) return false; // ไม่มี DB → ไม่ dedupe (ยอมเสี่ยงซ้ำ)
  const since = new Date(Date.now() - cooldownHours * 3600_000).toISOString();
  const rows = await selectRows(
    "alerts",
    `title=eq.${encodeURIComponent(dedupeKey)}&created_at=gte.${since}&select=id&limit=1`
  );
  return rows.length > 0;
}

export interface AlertInput {
  level: "high" | "severe" | "info";
  title: string; // ใช้เป็น dedupe key ด้วย
  body: string;
}

// ส่ง alert (ถ้ายังไม่เคยส่งในช่วง cooldown) + log ลง DB
export async function sendAlert(a: AlertInput): Promise<{ sent: boolean; deduped?: boolean }> {
  if (await recentlyAlerted(a.title)) return { sent: false, deduped: true };
  const sent = await pushLine(`${a.title}\n\n${a.body}`);
  await insertRows("alerts", [
    {
      level: a.level,
      title: a.title,
      body: a.body,
      channel: "line",
      sent_at: sent ? new Date().toISOString() : null,
    },
  ]);
  return { sent };
}

// ส่งบรีฟ (ไม่ dedupe) + log
export async function sendBriefing(title: string, body: string): Promise<boolean> {
  const sent = await pushLine(`${title}\n\n${body}`);
  await insertRows("alerts", [
    { level: "info", title, body, channel: "line", sent_at: sent ? new Date().toISOString() : null },
  ]);
  return sent;
}
