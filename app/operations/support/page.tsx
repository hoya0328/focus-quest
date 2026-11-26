import type { Metadata } from "next";
import SupportInbox from "./SupportInbox";
import "../operations.css";
import "../../support.css";

export const metadata: Metadata = {
  title: "운영자 문의함 | Focus Quest",
  robots: { index: false, follow: false, noarchive: true },
  alternates: { canonical: "/operations/support" },
};

export default function SupportInboxPage() { return <SupportInbox />; }
