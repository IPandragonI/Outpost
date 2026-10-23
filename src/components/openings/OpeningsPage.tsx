"use client";

import { useSearchParams } from "next/navigation";
import { catalogOpening } from "@/features/openings/catalog";
import { OpeningDetail } from "./OpeningDetail";
import { OpeningsHome } from "./OpeningsHome";
import { OpeningsStudio } from "./OpeningsStudio";

/**
 * `/openings`: the grid of openings; `?o=<id>`: one opening's lines on a board;
 * `?view=studio`: the advanced tools (full theory explorer, repertoire, trainer).
 */
export function OpeningsPage() {
  const params = useSearchParams();
  if (params.get("view") === "studio") return <OpeningsStudio />;
  const opening = catalogOpening(params.get("o") ?? "");
  if (opening) return <OpeningDetail key={opening.id} opening={opening} />;
  return <OpeningsHome />;
}
