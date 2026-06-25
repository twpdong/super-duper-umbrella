// ─────────────────────────────────────────────────────────────────────────────
// Open-Meteo client — พยากรณ์อากาศ + คุณภาพอากาศ รายจุด (ฟรี ไม่ต้องใช้ API key)
// รองรับหลายพิกัดในคำขอเดียว (latitude=a,b,c) เหมาะกับ multi-point ของเรา
// ─────────────────────────────────────────────────────────────────────────────

export interface PointWeather {
  apparentMaxC: number | null; // อุณหภูมิรู้สึกได้สูงสุดใน 7 วัน
  maxDailyRainMm: number | null; // ฝนหนักสุดรายวันใน 7 วัน
  total16dRainMm: number | null; // ฝนรวม 16 วัน (ใช้ประเมินแล้ง)
  maxGustKmh: number | null; // ลมกระโชกสูงสุดใน 7 วัน
  maxPm25: number | null; // PM2.5 สูงสุด (3 วัน)
}

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function maxOf(arr: (number | null | undefined)[], n = arr.length): number | null {
  const vals = arr.slice(0, n).filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  return vals.length ? Math.max(...vals) : null;
}
function sumOf(arr: (number | null | undefined)[]): number | null {
  const vals = arr.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

// ดึงพยากรณ์ + คุณภาพอากาศของหลายจุดพร้อมกัน คืน array เรียงตามลำดับ points
export async function fetchWeatherForPoints(
  points: { lat: number; lon: number }[]
): Promise<PointWeather[]> {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.lat).join(",");
  const lons = points.map((p) => p.lon).join(",");

  const forecastQS = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    daily: "apparent_temperature_max,precipitation_sum,wind_gusts_10m_max",
    forecast_days: "16",
    timezone: "auto",
  });
  const aqQS = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    hourly: "pm2_5",
    forecast_days: "3",
    timezone: "auto",
  });

  const [fRes, aRes] = await Promise.allSettled([
    fetch(`${FORECAST_URL}?${forecastQS}`, { next: { revalidate: 3600 } }),
    fetch(`${AQ_URL}?${aqQS}`, { next: { revalidate: 3600 } }),
  ]);

  let forecasts: any[] = [];
  if (fRes.status === "fulfilled" && fRes.value.ok) {
    forecasts = asArray(await fRes.value.json());
  }
  let airq: any[] = [];
  if (aRes.status === "fulfilled" && aRes.value.ok) {
    airq = asArray(await aRes.value.json());
  }

  return points.map((_, i) => {
    const f = forecasts[i];
    const a = airq[i];
    const daily = f?.daily ?? {};
    const pm = a?.hourly?.pm2_5 ?? [];
    return {
      apparentMaxC: maxOf(daily.apparent_temperature_max ?? [], 7),
      maxDailyRainMm: maxOf(daily.precipitation_sum ?? [], 7),
      total16dRainMm: sumOf(daily.precipitation_sum ?? []),
      maxGustKmh: maxOf(daily.wind_gusts_10m_max ?? [], 7),
      maxPm25: maxOf(pm),
    };
  });
}
