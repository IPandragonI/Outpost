import type { Metadata } from "next";
import { LibraryPage } from "@/components/library/LibraryPage";

export const metadata: Metadata = { title: "Parties" };

export default function Page() {
  return <LibraryPage />;
}
