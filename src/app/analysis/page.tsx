import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalysisPage } from "@/components/analysis/AnalysisPage";

export const metadata: Metadata = { title: "Analyse" };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-base-content/60">…</div>}>
      <AnalysisPage />
    </Suspense>
  );
}
