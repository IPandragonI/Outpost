"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  BookOpen,
  GraduationCap,
  House,
  LayoutGrid,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Swords,
  WifiOff,
  X,
} from "lucide-react";
import { useSettings } from "@/features/settings/settings-store";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOnline } from "@/hooks/useOnline";
import { useLocale, useT } from "@/lib/i18n/useT";
import { SettingsModal } from "./SettingsModal";

const NAV = [
  { href: "/", label: "nav.homeShort", icon: House },
  { href: "/analysis", label: "nav.analysis", icon: Swords },
  { href: "/games", label: "nav.library", icon: LayoutGrid },
  { href: "/openings", label: "nav.openings", icon: BookOpen },
  { href: "/learn", label: "nav.learn", icon: GraduationCap },
] as const;

const COLLAPSED_KEY = "outpost-sidebar-collapsed";

/** The collapsed state of the sidebar, kept in localStorage and shared by all readers. */
const collapsedListeners = new Set<() => void>();
/** Fallback when storage is blocked: the preference then lasts for this visit only. */
let memoryCollapsed = false;

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return memoryCollapsed;
  }
}
function writeCollapsed(value: boolean) {
  memoryCollapsed = value;
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Storage blocked: memoryCollapsed keeps it for this visit.
  }
  collapsedListeners.forEach((l) => l());
}
function useSidebarCollapsed(): [boolean, (value: boolean) => void] {
  const stored = useSyncExternalStore(
    (callback) => {
      collapsedListeners.add(callback);
      window.addEventListener("storage", callback);
      return () => {
        collapsedListeners.delete(callback);
        window.removeEventListener("storage", callback);
      };
    },
    readCollapsed,
    () => false,
  );
  return [stored, writeCollapsed];
}

/** The theme actually shown: the "system" setting follows the OS preference. */
function useDarkShown(): boolean {
  const theme = useSettings((s) => s.theme);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  return theme === "dark" || (theme === "system" && systemDark);
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

const ITEM =
  "flex min-h-11 items-center gap-3 rounded-field px-3 text-sm transition-colors lg:min-h-10";
const ITEM_IDLE = "text-base-content/70 hover:bg-base-300/60 hover:text-base-content";

/** A label that shows as a tooltip (to the right) when the sidebar is collapsed. */
function Tip({ text, on, children }: { text: string; on: boolean; children: ReactNode }) {
  return on ? (
    <div className="tooltip tooltip-right z-50 flex" data-tip={text}>
      {children}
    </div>
  ) : (
    <>{children}</>
  );
}

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav aria-label={t("nav.main")} className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Tip key={href} text={t(label)} on={collapsed}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? t(label) : undefined}
              className={`${ITEM} w-full ${collapsed ? "justify-center px-0" : ""} ${
                active ? "bg-base-300 font-medium text-base-content" : ITEM_IDLE
              }`}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{t(label)}</span>}
            </Link>
          </Tip>
        );
      })}
    </nav>
  );
}

function Utilities({ collapsed, onSettings }: { collapsed: boolean; onSettings: () => void }) {
  const t = useT();
  const locale = useLocale();
  const set = useSettings((s) => s.set);
  const dark = useDarkShown();
  const online = useOnline();
  const themeLabel = t(dark ? "nav.lightMode" : "nav.darkMode");
  const next = locale === "fr" ? "en" : "fr";
  const center = collapsed ? "justify-center px-0" : "";
  return (
    <div className="flex flex-col gap-0.5">
      {!online && (
        <Tip text={t("nav.offline")} on={collapsed}>
          <span
            className={`${ITEM} w-full text-base-content/75 ${center}`}
            title={t("nav.offlineHint")}
          >
            <WifiOff className="size-[18px] shrink-0" aria-hidden="true" />
            {!collapsed && <span>{t("nav.offline")}</span>}
          </span>
        </Tip>
      )}
      <Tip text={t("nav.settings")} on={collapsed}>
        <button
          type="button"
          className={`${ITEM} ${ITEM_IDLE} w-full ${center}`}
          onClick={onSettings}
          aria-haspopup="dialog"
          aria-label={collapsed ? t("nav.settings") : undefined}
        >
          <Settings className="size-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && <span>{t("nav.settings")}</span>}
        </button>
      </Tip>
      <Tip text={themeLabel} on={collapsed}>
        <button
          type="button"
          className={`${ITEM} ${ITEM_IDLE} w-full ${center}`}
          onClick={() => set({ theme: dark ? "light" : "dark" })}
          aria-label={themeLabel}
        >
          {dark ? (
            <Sun className="size-[18px] shrink-0" aria-hidden="true" />
          ) : (
            <Moon className="size-[18px] shrink-0" aria-hidden="true" />
          )}
          {!collapsed && <span className="truncate">{themeLabel}</span>}
        </button>
      </Tip>
      <Tip text={t("nav.switchLanguage")} on={collapsed}>
        <button
          type="button"
          className={`${ITEM} ${ITEM_IDLE} w-full ${center}`}
          onClick={() => set({ locale: next })}
          aria-label={t("nav.switchLanguage")}
          lang={next}
        >
          <span className="w-[18px] shrink-0 text-center font-mono text-xs font-medium">
            {next.toUpperCase()}
          </span>
          {!collapsed && <span className="truncate">{t("nav.switchLanguage")}</span>}
        </button>
      </Tip>
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  return (
    <Link
      href="/"
      className={`flex min-h-12 items-center gap-2 rounded-field px-2 ${collapsed ? "justify-center" : ""}`}
      aria-label={t("nav.home")}
    >
      <BrandMark />
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight">Outpost</span>}
    </Link>
  );
}

/**
 * Desktop: a compact sidebar on the left (icons only when collapsed, with tooltips).
 * Mobile: a top bar with a menu button that opens the same navigation as a slide-out
 * drawer, closed again by choosing a destination, Escape or the backdrop.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        menuRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const openSettings = () => {
    setDrawerOpen(false);
    setSettingsOpen(true);
  };

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-base-content/10 bg-base-200/85 py-2 transition-[width] duration-200 ease-out lg:flex ${
          collapsed ? "w-14 px-1.5" : "w-52 px-2"
        }`}
        aria-label={t("nav.sidebar")}
        data-testid="sidebar"
        data-collapsed={collapsed}
      >
        <Brand collapsed={collapsed} />
        <div className="mt-3 flex-1 overflow-y-auto">
          <NavLinks collapsed={collapsed} />
        </div>
        <Utilities collapsed={collapsed} onSettings={openSettings} />
        <Tip text={t("nav.expand")} on={collapsed}>
          <button
            type="button"
            className={`${ITEM} ${ITEM_IDLE} mt-1 w-full ${collapsed ? "justify-center px-0" : ""}`}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px] shrink-0" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="size-[18px] shrink-0" aria-hidden="true" />
                <span>{t("nav.collapse")}</span>
              </>
            )}
          </button>
        </Tip>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header
          className="sticky top-0 z-30 border-b border-base-content/10 bg-base-200/90 backdrop-blur lg:hidden"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div
            className="flex h-12 items-center gap-1 px-2"
            style={{
              paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
              paddingRight: "max(0.5rem, env(safe-area-inset-right))",
            }}
          >
            <button
              ref={menuRef}
              type="button"
              className="flex size-11 items-center justify-center rounded-field text-base-content/80 hover:bg-base-300/60"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("nav.openMenu")}
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <Link
              href="/"
              className="flex items-center gap-2 rounded-field px-1"
              aria-label={t("nav.home")}
            >
              <BrandMark />
              <span className="text-[15px] font-semibold tracking-tight">Outpost</span>
            </Link>
          </div>
        </header>

        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>

      {/* Mobile drawer: always mounted so it can slide; inert while closed. */}
      <div className="lg:hidden">
        <div
          className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
            drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
        <aside
          id="mobile-nav"
          inert={!drawerOpen}
          className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-base-content/10 bg-base-100 px-2 transition-transform duration-200 ease-out ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            paddingTop: "max(0.5rem, env(safe-area-inset-top))",
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
          }}
          aria-label={t("nav.sidebar")}
          data-testid="mobile-drawer"
        >
          <div className="flex items-center justify-between">
            <Brand collapsed={false} />
            <button
              ref={closeRef}
              type="button"
              className="flex size-11 items-center justify-center rounded-field text-base-content/70 hover:bg-base-300/60"
              onClick={() => {
                setDrawerOpen(false);
                menuRef.current?.focus();
              }}
              aria-label={t("nav.closeMenu")}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto">
            <NavLinks collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
          <Utilities collapsed={false} onSettings={openSettings} />
        </aside>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
