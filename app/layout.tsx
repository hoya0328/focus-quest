import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./adventure-motion-v2.css";
import "./focus-quest-2026.css";
import { PUBLIC_SERVICE_URL } from "@/lib/service-config";
import VisitAnalytics from "@/app/components/VisitAnalytics";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SERVICE_URL),
  alternates: { canonical: "/" },
  title: "Focus Quest | 픽셀 모험 집중 타이머",
  description: "픽셀 모험 친구와 한 칸씩 완성하는 반응형 포모도로 집중 타이머",
  openGraph: {
    type: "website", locale: "ko_KR", url: PUBLIC_SERVICE_URL,
    siteName: "Focus Quest", title: "Focus Quest | 픽셀 모험 집중 타이머",
    description: "모리·나루·보리와 함께 오늘의 집중을 한 칸씩 완성하세요.",
    images: [{ url: "/brand/focus-quest-512.png", width: 512, height: 512, alt: "Focus Quest" }],
  },
  twitter: { card: "summary", title: "Focus Quest | 픽셀 모험 집중 타이머", images: ["/brand/focus-quest-512.png"] },
  applicationName: "Focus Quest",
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION
      ? { "naver-site-verification": process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION }
      : {},
  },
  manifest: `${publicBasePath}/manifest.webmanifest`,
  icons: {
    icon: `${publicBasePath}/brand/focus-quest-mark.png`,
    shortcut: `${publicBasePath}/brand/focus-quest-mark.png`,
    apple: `${publicBasePath}/brand/focus-quest-mark.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Focus Quest",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#160f1f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}<VisitAnalytics /></body>
    </html>
  );
}
