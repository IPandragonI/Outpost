import type { Metadata } from "next";
import { CoachPage } from "@/components/coach/CoachPage";

export const metadata: Metadata = { title: "Coach" };

export default function Page() {
  return <CoachPage />;
}
