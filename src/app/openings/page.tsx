import type { Metadata } from "next";
import { Suspense } from "react";
import { OpeningsPage } from "@/components/openings/OpeningsPage";

export const metadata: Metadata = { title: "Ouvertures" };

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-base-content/60">…</div>}>
      <OpeningsPage />
    </Suspense>
  );
}
