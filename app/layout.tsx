import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Climate & Geo-Risk Monitor",
  description: "ติดตามเอลนีโญ แผ่นดินไหว ความร้อน/แล้ง + ปฏิทินเตรียมรับมือ 12 เดือน",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
