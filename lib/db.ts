// ─────────────────────────────────────────────────────────────────────────────
// Supabase persistence (PostgREST) — ไม่มี dependency เพิ่ม ใช้ fetch ตรง
// Env-gated: ถ้าไม่ตั้ง SUPABASE_URL / SUPABASE_SERVICE_KEY จะ no-op (graceful)
// ตั้งค่าใน Vercel: Project → Settings → Environment Variables
// ─────────────────────────────────────────────────────────────────────────────

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

export function dbEnabled(): boolean {
  return Boolean(URL && KEY);
}

interface InsertResult {
  ok: boolean;
  skipped?: boolean;
  count?: number;
  error?: string;
}

// แทรกหลายแถวลงตาราง (PostgREST). prefer=resolution=merge-duplicates สำหรับ upsert
export async function insertRows(
  table: string,
  rows: Record<string, unknown>[],
  opts: { upsert?: boolean } = {}
): Promise<InsertResult> {
  if (!dbEnabled()) return { ok: true, skipped: true };
  if (rows.length === 0) return { ok: true, count: 0 };
  try {
    const prefer = ["return=minimal"];
    if (opts.upsert) prefer.push("resolution=merge-duplicates");
    const res = await fetch(`${URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: KEY!,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: prefer.join(","),
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const error = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${error.slice(0, 200)}` };
    }
    return { ok: true, count: rows.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// อ่านแถว (ใช้ตรวจ dedupe การแจ้งเตือน ฯลฯ)
export async function selectRows(
  table: string,
  query: string
): Promise<Record<string, unknown>[]> {
  if (!dbEnabled()) return [];
  try {
    const res = await fetch(`${URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

// บันทึก audit ทุกการดึงข้อมูล (DESIGN.md §6.3) — เงียบถ้า DB ปิด
export async function logSource(
  source: string,
  status: "ok" | "error" | "fallback",
  url?: string,
  payload?: unknown
): Promise<void> {
  await insertRows("sources_audit", [
    { source, status, url: url ?? null, payload: payload ?? null },
  ]);
}
