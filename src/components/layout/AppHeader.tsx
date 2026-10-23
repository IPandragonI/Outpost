"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, LayoutGrid, Settings, Swords, WifiOff } from "lucide-react";
import { useSettings } from "@/features/settings/settings-store";
import { useOnline } from "@/hooks/useOnline";
import { useLocale, useT } from "@/lib/i18n/useT";

const NAV = [
  { href: "/games", label: "nav.library", icon: LayoutGrid },
  { href: "/analysis", label: "nav.analysis", icon: Swords },
  { href: "/openings", label: "nav.openings", icon: BookOpen },
  { href: "/learn", label: "nav.learn", icon: GraduationCap },
  { href: "/settings", label: "nav.settings", icon: Settings },
] as const;

/** FR / EN switch, always one tap away. */
function LanguageSwitch() {
  const t = useT();
  const locale = useLocale();
  const set = useSettings((s) => s.set);
  const next = locale === "fr" ? "en" : "fr";
  return (
    <button
      type="button"
      onClick={() => set({ locale: next })}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-field px-2 font-mono text-xs font-medium text-base-content/70 hover:bg-base-300/60 hover:text-base-content sm:min-h-9"
      aria-label={t("nav.switchLanguage")}
      title={t("nav.switchLanguage")}
      lang={next}
    >
      {next.toUpperCase()}
    </button>
  );
}

export function BrandMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" className="fill-base-300" />
      <path
        className="fill-primary"
        d="M20 14h6v5h4v-5h4v5h4v-5h6v12l-4 4v12l4 4v4H20v-4l4-4V30l-4-4z"
      />
      <path className="fill-base-300" d="M28 33h8v9h-8z" />
    </svg>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const online = useOnline();
  const t = useT();

  return (
    <header
      className="sticky top-0 z-30 border-b border-base-content/10 bg-base-200/90 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-2 px-3 sm:px-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-field pr-2"
          aria-label={t("nav.home")}
        >
          <BrandMark />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Outpost</span>
        </Link>

        <nav aria-label={t("nav.main")} className="ml-auto flex items-center gap-0.5 sm:ml-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-field px-2.5 text-sm transition-colors sm:min-h-9 sm:px-3 ${
                  active
                    ? "bg-base-300 text-base-content"
                    : "text-base-content/65 hover:bg-base-300/60 hover:text-base-content"
                }`}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                <span className="sr-only md:not-sr-only">{t(label)}</span>
              </Link>
            );
          })}
        </nav>

        {!online && (
          <span
            className="ml-1 flex items-center gap-1.5 rounded-full bg-base-300 px-2.5 py-1 text-xs text-base-content/75"
            title={t("nav.offlineHint")}
          >
            <WifiOff className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t("nav.offline")}</span>
          </span>
        )}
        <LanguageSwitch />
      </div>
    </header>
  );
}
