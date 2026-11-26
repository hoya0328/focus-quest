import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./adventure-motion-v2.css";
import "./focus-quest-2026.css";
import {
  GOOGLE_SITE_VERIFICATION,
  PUBLIC_SERVICE_DESCRIPTION,
  PUBLIC_SERVICE_NAME,
  PUBLIC_SERVICE_TITLE,
  PUBLIC_SERVICE_URL,
} from "@/lib/service-config";
import VisitAnalytics from "@/app/components/VisitAnalytics";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SERVICE_URL),
  alternates: { canonical: "/" },
  title: PUBLIC_SERVICE_TITLE,
  description: PUBLIC_SERVICE_DESCRIPTION,
  openGraph: {
    type: "website", locale: "ko_KR", url: PUBLIC_SERVICE_URL,
    siteName: PUBLIC_SERVICE_NAME, title: PUBLIC_SERVICE_TITLE,
    description: PUBLIC_SERVICE_DESCRIPTION,
    images: [{ url: "/brand/focus-quest-512.png", width: 512, height: 512, alt: PUBLIC_SERVICE_NAME }],
  },
  twitter: {
    card: "summary", title: PUBLIC_SERVICE_TITLE,
    description: PUBLIC_SERVICE_DESCRIPTION, images: ["/brand/focus-quest-512.png"],
  },
  applicationName: PUBLIC_SERVICE_NAME,
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || GOOGLE_SITE_VERIFICATION,
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
    title: PUBLIC_SERVICE_NAME,
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
