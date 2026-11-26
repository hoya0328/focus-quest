import type { Metadata } from "next";
import OperationsDashboard from "./OperationsDashboard";
import "./operations.css";

export const metadata: Metadata = {
  title: "운영 통계 | Focus Quest",
  robots: { index: false, follow: false, noarchive: true },
  alternates: { canonical: "/operations" },
};

export default function OperationsPage() {
  return <OperationsDashboard />;
}
