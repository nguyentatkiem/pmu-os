import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

const font = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-vn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PMU OS — Trung tâm vận hành DOANH NGHIỆP PMU",
  description: "HR AI Command Center và Customer Care Center cho DOANH NGHIỆP PMU. Dữ liệu demo là mô phỏng.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#063C4C" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={font.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
