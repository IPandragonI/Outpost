"use client";

import { useEffect } from "react";
import { useSettings } from "@/features/settings/settings-store";

const THEME_NAMES = { light: "outpost-light", dark: "outpost" } as const;

/** Mirrors the theme setting onto <html> and the theme-color meta tags. */
export function ThemeSync({ light, dark }: { light: string; dark: string }) {
  const theme = useSettings((s) => s.theme);
  const hydrated = useSettings((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme === "system") {
      delete root.dataset.theme;
      metas.forEach((m) => (m.content = m.media.includes("dark") ? dark : light));
    } else {
      root.dataset.theme = THEME_NAMES[theme];
      metas.forEach((m) => (m.content = theme === "dark" ? dark : light));
    }
  }, [theme, hydrated, light, dark]);

  return null;
}
