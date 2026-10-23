"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { MessageKey } from "@/lib/i18n/translate";
import { useLocale, useT } from "@/lib/i18n/useT";

const TITLES: Record<string, MessageKey> = {
  "/games": "nav.library",
  "/learn": "nav.learn",
  "/analysis": "nav.analysis",
  "/openings": "nav.openings",
  "/settings": "nav.settings",
  "/about": "about.title",
};

/**
 * Keeps <html lang> and the document title in step with the language setting (page
 * metadata is prerendered in French, the default).
 */
export function LocaleSync() {
  const locale = useLocale();
  const t = useT();
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = locale;
    const key = TITLES[pathname];
    document.title = key ? `${t(key)} · Outpost` : `Outpost — ${t("library.heading")}`;
  }, [locale, pathname, t]);
  return null;
}

export function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-content"
    >
      {t("nav.skip")}
    </a>
  );
}
