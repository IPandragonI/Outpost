"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CheckCircle2, CloudDownload, HardDrive, RotateCcw } from "lucide-react";
import { getEngineService } from "@/features/engine/browser-engine";
import { ANALYSIS_PRESETS } from "@/features/analysis/game-analysis";
import {
  downloadAsset,
  isCached,
  offlineAssets,
  requestPersistentStorage,
  serviceWorkerActive,
} from "@/features/offline/offline-assets";
import {
  useSettings,
  type AnimationSpeed,
  type Sensitivity,
} from "@/features/settings/settings-store";
import { describeStorageError } from "@/features/storage/database";
import {
  analysisCache,
  clearAllData,
  games,
  storageUsage,
  type StorageUsage,
} from "@/features/storage/repositories";
import { exportPgn } from "@/features/games/pgn-export";
import { downloadText } from "@/lib/download";
import { playSound } from "@/lib/sound";
import { useEngineStatus } from "@/hooks/useLiveAnalysis";
import { useOnline } from "@/hooks/useOnline";
import { useT } from "@/lib/i18n/useT";
import {
  BoardThemePicker,
  LanguageChoice,
  PieceSetPicker,
  ThemeChoice,
  Toggle,
} from "./AppearanceControls";

function Section({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = `s-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section className="panel flex flex-col gap-3 p-4" aria-labelledby={id}>
      <div>
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-base-content/60">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="min-w-48 flex-1">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-base-content/55">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

const SERVER_DEVICE = { cores: 4, isolated: true };
let clientDevice: { cores: number; isolated: boolean } | null = null;
const noSubscription = () => () => {};
const serverDeviceInfo = () => SERVER_DEVICE;
/** Cores and cross-origin isolation do not change while the page is open. */
function deviceInfo() {
  clientDevice ??= {
    cores: navigator.hardwareConcurrency || 4,
    isolated: self.crossOriginIsolated,
  };
  return clientDevice;
}

function formatBytes(bytes?: number) {
  if (bytes === undefined) return "?";
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

function OfflineSection() {
  const status = useEngineStatus();
  const online = useOnline();
  const flavor = status.state === "ready" ? status.config.flavor : "lite-single";
  const assets = offlineAssets(flavor);
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [swActive, setSwActive] = useState(false);
  const t = useT();

  const [checks, setChecks] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all(offlineAssets(flavor).map(async (a) => [a.id, await isCached(a)] as const)).then(
      (entries) => {
        if (!active) return;
        setCached(Object.fromEntries(entries));
        setSwActive(serviceWorkerActive());
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [flavor, checks]);

  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      for (const asset of assets) await downloadAsset(asset);
      await requestPersistentStorage();
      setChecks((n) => n + 1);
      setMessage(t("offline.downloaded"));
    } catch (error) {
      setMessage(t("offline.failed", { detail: error instanceof Error ? error.message : "" }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t("offline.title")} description={t("offline.description")}>
      {!swActive && <p className="text-sm text-warning">{t("offline.inactive")}</p>}
      <ul className="flex flex-col gap-1.5">
        {assets.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            {cached[a.id] ? (
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            ) : (
              <CloudDownload className="size-4 text-base-content/50" aria-hidden="true" />
            )}
            <span className="flex-1">
              {a.id === "engine"
                ? t(flavor === "lite-threaded" ? "offline.engineThreaded" : "offline.engineSingle")
                : t("offline.book")}
            </span>
            <span className="text-xs text-base-content/55">
              {cached[a.id]
                ? t("offline.available")
                : t("offline.notYet", {
                    size: t(a.id === "engine" ? "offline.sizeEngine" : "offline.sizeBook"),
                  })}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-sm"
          onClick={download}
          disabled={busy || !online || !swActive || assets.every((a) => cached[a.id])}
        >
          {busy ? t("offline.downloading") : t("offline.download")}
        </button>
        {!online && (
          <span className="text-xs text-base-content/55">{t("offline.youAreOffline")}</span>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </Section>
  );
}

function DataSection() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const t = useT();
  const reset = useSettings((s) => s.reset);

  const refresh = useCallback(() => {
    storageUsage().then(setUsage, (e: unknown) => setMessage(describeStorageError(e, t)));
  }, [t]);
  useEffect(refresh, [refresh]);

  const run = async (action: () => Promise<void>, done: string) => {
    try {
      await action();
      setMessage(done);
      refresh();
    } catch (e) {
      setMessage(describeStorageError(e, t));
    }
  };

  const exportAll = async () => {
    const list = await games.list();
    const pgn = list
      .map((g) => (g.pgn || exportPgn(g.tree, g.headers, g.result)).trim())
      .join("\n\n");
    downloadText(
      `outpost-games-${new Date().toISOString().slice(0, 10)}.pgn`,
      `${pgn}\n`,
      "application/x-chess-pgn",
    );
  };

  return (
    <Section title={t("data.title")} description={t("data.description")}>
      <div className="flex items-center gap-2 text-sm">
        <HardDrive className="size-4 text-base-content/55" aria-hidden="true" />
        {usage ? (
          <span>
            {t("data.usage", {
              games: usage.games,
              positions: usage.positions,
              repertoires: usage.repertoires,
              size: formatBytes(usage.usage),
            })}
            {usage.persisted ? ` · ${t("data.persisted")}` : ""}
          </span>
        ) : (
          <span>{t("data.measuring")}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void exportAll()}
          disabled={!usage?.games}
        >
          {t("data.exportAll")}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void run(() => analysisCache.clear(), t("data.cacheCleared"))}
          disabled={!usage?.positions}
        >
          {t("data.clearCache")}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            reset();
            setMessage(t("data.settingsReset"));
          }}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {t("data.resetSettings")}
        </button>
        <button
          type="button"
          className="btn btn-soft btn-error btn-sm"
          onClick={() => confirmDialog.current?.showModal()}
        >
          {t("data.deleteAll")}
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <dialog ref={confirmDialog} className="modal" aria-labelledby="clear-title">
        <div className="modal-box flex flex-col gap-3">
          <h3 id="clear-title" className="font-semibold">
            {t("data.deleteAllTitle")}
          </h3>
          <p className="text-sm text-base-content/75">{t("data.deleteAllBody")}</p>
          <div className="modal-action mt-0">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => confirmDialog.current?.close()}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-error"
              onClick={() => {
                confirmDialog.current?.close();
                void run(async () => {
                  await clearAllData();
                  reset();
                }, t("data.deleted"));
              }}
            >
              {t("data.deleteEverything")}
            </button>
          </div>
        </div>
      </dialog>
    </Section>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const status = useEngineStatus();
  const set = settings.set;
  const t = useT();
  const device = useSyncExternalStore(noSubscription, deviceInfo, serverDeviceInfo);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="text-xl font-semibold tracking-tight">{t("nav.settings")}</h1>

      <Section title={t("settings.appearance")}>
        <Row label={t("settings.language")}>
          <LanguageChoice />
        </Row>
        <Row label={t("settings.theme")}>
          <ThemeChoice />
        </Row>
        <Row label={t("settings.board")}>
          <BoardThemePicker className="max-w-xs justify-end" />
        </Row>
        {settings.boardTheme === "custom" && (
          <Row label={t("settings.customColors")}>
            <label className="flex items-center gap-1.5 text-xs">
              {t("settings.lightSquares")}
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded-field"
                value={settings.customLight}
                onChange={(e) => set({ customLight: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              {t("settings.darkSquares")}
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded-field"
                value={settings.customDark}
                onChange={(e) => set({ customDark: e.target.value })}
              />
            </label>
          </Row>
        )}
        <Row label={t("settings.pieces")}>
          <PieceSetPicker className="max-w-xs justify-end" />
        </Row>
        <Row label={t("settings.coordinates")}>
          <Toggle
            label={t("settings.coordinates")}
            checked={settings.showCoordinates}
            onChange={(v) => set({ showCoordinates: v })}
          />
        </Row>
        <Row label={t("settings.animations")}>
          <select
            className="select w-auto select-sm"
            value={settings.animationSpeed}
            disabled={!settings.animations}
            onChange={(e) => set({ animationSpeed: e.target.value as AnimationSpeed })}
            aria-label={t("settings.animationSpeed")}
          >
            {(["fast", "normal", "slow"] as const).map((speed) => (
              <option key={speed} value={speed}>
                {t(`settings.speed.${speed}`)}
              </option>
            ))}
          </select>
          <Toggle
            label={t("settings.animations")}
            checked={settings.animations}
            onChange={(v) => set({ animations: v })}
          />
        </Row>
        <Row label={t("settings.sound")} hint={t("settings.soundHint")}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            className="range w-28 range-xs"
            value={settings.soundVolume}
            disabled={!settings.sound}
            onChange={(e) => set({ soundVolume: Number(e.target.value) })}
            onPointerUp={() => playSound("move", settings.soundVolume)}
            aria-label={t("settings.volume")}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!settings.sound}
            onClick={() => playSound("check", settings.soundVolume)}
          >
            {t("settings.testSound")}
          </button>
          <Toggle
            label={t("settings.sound")}
            checked={settings.sound}
            onChange={(v) => set({ sound: v })}
          />
        </Row>
        <Row label={t("settings.badges")} hint={t("settings.badgesHint")}>
          <Toggle
            label={t("settings.badges")}
            checked={settings.boardBadges}
            onChange={(v) => set({ boardBadges: v })}
          />
        </Row>
        <Row label={t("settings.arrow")}>
          <Toggle
            label={t("settings.arrow")}
            checked={settings.bestMoveArrow}
            onChange={(v) => set({ bestMoveArrow: v })}
          />
        </Row>
      </Section>

      <Section title={t("settings.engine")} description={t("settings.engineDescription")}>
        <p className="text-xs text-base-content/60" aria-live="polite">
          {status.state === "ready"
            ? t("settings.engineStatus", {
                name: status.name,
                threads: status.config.threads,
                hash: status.config.hashMb,
              })
            : status.state === "error"
              ? t("settings.engineError", { detail: status.message })
              : status.state === "loading"
                ? t("settings.engineStarting")
                : t("settings.engineIdle")}
        </p>
        <Row label={t("settings.live")}>
          <Toggle
            label={t("settings.live")}
            checked={settings.liveEngine}
            onChange={(v) => set({ liveEngine: v })}
          />
        </Row>
        <Row label={t("settings.liveDepth")} hint={t("settings.liveDepthHint")}>
          <select
            className="select w-auto select-sm"
            value={settings.liveDepth}
            onChange={(e) => set({ liveDepth: Number(e.target.value) })}
            aria-label={t("settings.liveDepth")}
          >
            {[14, 18, 22, 26, 30].map((d) => (
              <option key={d} value={d}>
                {t("engine.depth", { n: d })}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t("settings.sensitivity")} hint={t("settings.sensitivityHint")}>
          <select
            className="select w-auto select-sm"
            value={settings.sensitivity}
            onChange={(e) => set({ sensitivity: e.target.value as Sensitivity })}
            aria-label={t("settings.sensitivity")}
          >
            {(["lenient", "standard", "strict"] as const).map((level) => (
              <option key={level} value={level}>
                {t(`settings.sensitivity.${level}`)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t("settings.gameAnalysis")}>
          <select
            className="select w-auto select-sm"
            value={settings.presetId}
            onChange={(e) => set({ presetId: e.target.value as typeof settings.presetId })}
            aria-label={t("settings.gameAnalysis")}
          >
            {ANALYSIS_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {t("preset.option", { name: t(`preset.${p.id}`), depth: p.limits.depth ?? 0 })}
              </option>
            ))}
          </select>
        </Row>
        <Row
          label={t("settings.threads")}
          hint={device.isolated ? t("settings.threadsHint") : t("settings.threadsUnavailable")}
        >
          <select
            className="select w-auto select-sm"
            value={settings.engineThreads ?? "auto"}
            onChange={(e) =>
              set({ engineThreads: e.target.value === "auto" ? null : Number(e.target.value) })
            }
            aria-label={t("settings.threads")}
          >
            <option value="auto">{t("settings.auto")}</option>
            {Array.from({ length: Math.min(device.cores, 8) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t("settings.hash")}>
          <select
            className="select w-auto select-sm"
            value={settings.engineHashMb ?? "auto"}
            onChange={(e) =>
              set({ engineHashMb: e.target.value === "auto" ? null : Number(e.target.value) })
            }
            aria-label={t("settings.hash")}
          >
            <option value="auto">{t("settings.auto")}</option>
            {[16, 32, 64, 128].map((n) => (
              <option key={n} value={n}>
                {n} MB
              </option>
            ))}
          </select>
        </Row>
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => getEngineService().restart()}
          >
            {t("settings.restartEngine")}
          </button>
        </div>
      </Section>

      <OfflineSection />
      <DataSection />

      <p className="text-center text-xs text-base-content/55">
        Outpost {process.env.NEXT_PUBLIC_APP_VERSION} ·{" "}
        <Link href="/about" className="link">
          {t("settings.about")}
        </Link>
      </p>
    </div>
  );
}
