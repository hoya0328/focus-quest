import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./adventure-motion-v2.css";
import "./focus-quest-2026.css";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Focus Quest | 픽셀 모험 집중 타이머",
  description: "픽셀 모험 친구와 한 칸씩 완성하는 반응형 포모도로 집중 타이머",
  applicationName: "Focus Quest",
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
      <body>{children}</body>
    </html>
  );
}
