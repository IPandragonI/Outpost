import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnPage } from "@/components/learn/LearnPage";

export const metadata: Metadata = { title: "Apprendre" };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-base-content/60">…</div>}>
      <LearnPage />
    </Suspense>
  );
}
