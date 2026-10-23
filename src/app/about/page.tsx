import type { Metadata } from "next";
import { AboutContent } from "@/components/about/AboutContent";

export const metadata: Metadata = { title: "À propos" };

export default function AboutPage() {
  return <AboutContent />;
}
