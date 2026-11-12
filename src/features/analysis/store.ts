"use client";

import { Chess } from "chess.js";
import { create } from "zustand";
import { getEngineService } from "@/features/engine/browser-engine";
import { isAbortError } from "@/features/engine/engine-service";
import type { PositionAnalysis } from "@/features/engine/uci-engine";
import type { PgnHeaders } from "@/features/games/pgn";
import {
  addMove,
  createTree,
  deleteSubtree,
  getNode,
  hasNode,
  lineEnd,
  mainline,
  mainlineAncestor,
  nextInLine,
  type GameTree,
  type NodeId,
} from "@/features/games/variation-tree";
import { storageProblem, type GameRecord, type UserMessage } from "@/features/storage/database";
import { analysisCache, games } from "@/features/storage/repositories";
import { parseUci, positionKey, START_FEN, uciOf } from "@/lib/chess/position";
import { loadOpeningBook } from "@/hooks/useOpeningBook";
import type { SearchLimits } from "@/features/engine/uci";
import { useSettings } from "@/features/settings/settings-store";
import { createCloudEval } from "@/features/engine/cloud-eval";
import { ANALYSIS_PRESETS, planLimits } from "./game-analysis";
import { analyzeGame, ANALYSIS_STRATEGY } from "./review-pipeline";
import { sideOf } from "./perspective";

/**
 * Search limits for each main-line position: book openings shallow (their moves are
 * labelled from theory), everything else at the preset depth. Without the opening book,
 * every position gets the preset.
 */
async function planGame(fens: readonly string[], preset: SearchLimits): Promise<SearchLimits[]> {
  const book = await loadOpeningBook().catch(() => null);
  if (!book) return fens.map(() => preset);
  const { lastBookIndex } = book.identify(fens);
  // Same rule as the review (useGameReview): the move reaching position k is a book move.
  return planLimits(fens.length, preset, (k) => k <= lastBookIndex && book.has(fens[k]!));
}

/** A line shown on the board without being added to the game (engine line, book line…). */
export interface LinePreview {
  /** Node the line starts from. */
  fromId: NodeId;
  /** Positions along the line: fens[0] is the starting position. */
  fens: string[];
  uci: string[];
  san: string[];
  /** 0 = starting position, n = after the n-th move. */
  step: number;
  label: string;
}

export interface AnalysisRun {
  state: "idle" | "running" | "done" | "cancelled" | "error";
  presetId: string | null;
  done: number;
  total: number;
  error?: string;
  /** The user stopped the run: it is resumed on request, never started again by itself. */
  userStopped?: boolean;
}

interface AnalysisState {
  gameId: string | null;
  title: string;
  headers: PgnHeaders;
  result: string;
  /** Original PGN text of an imported game. */
  pgn: string;
  tree: GameTree;
  currentId: NodeId;
  orientation: "white" | "black";
  preview: LinePreview | null;
  /** Results of whole-game analysis, by position key. */
  gamePositions: Record<string, PositionAnalysis>;
  /** Deepest result of the live engine per position key, kept while navigating. */
  livePositions: Record<string, PositionAnalysis>;
  run: AnalysisRun;
  /** The game was opened with analysis results already stored (see loadGame). */
  restored: boolean;
  saveError: UserMessage | null;
  loadError: UserMessage | null;
  loading: boolean;

  loadGame(id: string): Promise<void>;
  newBoard(fen?: string): void;
  goTo(id: NodeId): void;
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  flip(): void;
  setOrientation(orientation: "white" | "black"): void;
  returnToMainline(): void;
  /** Plays a move from the current position; returns false when illegal. */
  playMove(move: { from: string; to: string; promotion?: string } | string): boolean;
  /** Adds a UCI line after `fromId` as an explored variation and goes to its end. */
  playLine(fromId: NodeId, uci: readonly string[]): void;
  deleteVariation(id: NodeId): void;
  showPreview(fromId: NodeId, uci: readonly string[], label: string, step?: number): void;
  /**
   * Line actions for the position shown on the board: during a preview, the previewed
   * moves are kept as a variation first, so the line starts where the board is.
   */
  previewFromBoard(uci: readonly string[], label: string, step?: number): void;
  playFromBoard(uci: readonly string[]): void;
  previewStep(step: number): void;
  closePreview(): void;
  keepPreview(): void;
  recordLive(analysis: PositionAnalysis): void;
  startGameAnalysis(presetId: string): Promise<void>;
  /** Stops the running analysis; `byUser` marks a stop the user asked for. */
  cancelGameAnalysis(byUser?: boolean): void;
  restoreGameAnalysis(presetId: string, persisted: "partial" | "complete"): Promise<void>;
  setTitle(title: string): Promise<void>;
  /** Saves an unsaved board to the library. */
  saveAsNew(record: GameRecord): Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let runController: AbortController | null = null;

function lineFens(fromFen: string, uci: readonly string[]) {
  const chess = new Chess(fromFen);
  const fens = [chess.fen()];
  const sans: string[] = [];
  const ucis: string[] = [];
  for (const u of uci) {
    try {
      const move = chess.move(parseUci(u));
      fens.push(chess.fen());
      sans.push(move.san);
      ucis.push(uciOf(move));
    } catch {
      break;
    }
  }
  return { fens, sans, ucis };
}

const IDLE_RUN: AnalysisRun = { state: "idle", presetId: null, done: 0, total: 0 };

export const useAnalysis = create<AnalysisState>()((set, get) => {
  /** Persists explored variations of a saved game, debounced. */
  const scheduleSave = () => {
    const { gameId } = get();
    if (!gameId) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { gameId: id, tree } = get();
      if (!id) return;
      try {
        await games.saveTree(id, tree);
        set({ saveError: null });
      } catch (error) {
        set({ saveError: storageProblem(error) });
      }
    }, 600);
  };

  const setTree = (tree: GameTree, currentId: NodeId) => {
    set({ tree, currentId, preview: null });
    scheduleSave();
  };

  return {
    gameId: null,
    title: "",
    headers: {},
    result: "*",
    pgn: "",
    tree: createTree(),
    currentId: "0",
    orientation: "white",
    preview: null,
    gamePositions: {},
    livePositions: {},
    run: IDLE_RUN,
    restored: false,
    saveError: null,
    loadError: null,
    loading: false,

    async loadGame(id) {
      if (get().gameId === id && !get().loadError) return;
      get().cancelGameAnalysis();
      set({ loading: true, loadError: null });
      try {
        const record = await games.get(id);
        if (!record) {
          set({ loading: false, loadError: { key: "analysis.gameMissing" } });
          return;
        }
        set({
          gameId: record.id,
          title: record.title,
          headers: record.headers,
          result: record.result,
          pgn: record.pgn,
          tree: record.tree,
          currentId: record.tree.rootId,
          // The player who analyzes their own game (the saved Chess.com account) is at the
          // bottom of the board.
          orientation:
            sideOf(record.headers, useSettings.getState().chessComUsername) === "b"
              ? "black"
              : "white",
          preview: null,
          gamePositions: {},
          livePositions: {},
          run: IDLE_RUN,
          restored: false,
        });
        // Stored results are looked up before the game is shown as loaded, so the screen
        // can tell "not analyzed" from "analysis found" when it decides to start one.
        if (record.analysis.presetId && record.analysis.state !== "none") {
          await get().restoreGameAnalysis(
            record.analysis.presetId,
            record.analysis.state === "complete" ? "complete" : "partial",
          );
        }
        if (get().gameId === id) set({ loading: false, restored: get().run.state !== "idle" });
      } catch (error) {
        set({ loading: false, loadError: storageProblem(error) });
      }
    },

    newBoard(fen = START_FEN) {
      get().cancelGameAnalysis();
      const tree = createTree(new Chess(fen).fen());
      set({
        gameId: null,
        title: "",
        headers: {},
        result: "*",
        pgn: "",
        tree,
        currentId: tree.rootId,
        preview: null,
        gamePositions: {},
        livePositions: {},
        run: IDLE_RUN,
        restored: false,
        loadError: null,
      });
    },

    goTo(id) {
      if (hasNode(get().tree, id)) set({ currentId: id, preview: null });
    },
    next() {
      const { preview, tree, currentId } = get();
      if (preview) return get().previewStep(preview.step + 1);
      const next = nextInLine(tree, currentId);
      if (next) set({ currentId: next });
    },
    prev() {
      const { preview, tree, currentId } = get();
      if (preview) return get().previewStep(preview.step - 1);
      const parent = getNode(tree, currentId).parentId;
      if (parent !== null) set({ currentId: parent });
    },
    first() {
      const { preview, tree } = get();
      if (preview) return get().previewStep(0);
      set({ currentId: tree.rootId });
    },
    last() {
      const { preview, tree, currentId } = get();
      if (preview) return get().previewStep(preview.uci.length);
      set({ currentId: lineEnd(tree, currentId) });
    },
    setOrientation(orientation) {
      set({ orientation });
    },
    flip() {
      set((s) => ({ orientation: s.orientation === "white" ? "black" : "white" }));
    },
    returnToMainline() {
      const { tree, currentId } = get();
      set({ currentId: mainlineAncestor(tree, currentId), preview: null });
    },

    playMove(input) {
      // Moving during a preview continues from the previewed position.
      if (get().preview) get().keepPreview();
      const { tree, currentId } = get();
      const chess = new Chess(getNode(tree, currentId).fen);
      let move;
      try {
        move = typeof input === "string" ? chess.move(parseUci(input)) : chess.move(input);
      } catch {
        return false;
      }
      // Without an imported game, moves played at the end of the main line enter the
      // game itself (manual entry); everything else is an explored variation, so an
      // imported game is never modified.
      const line = mainline(tree);
      const entering = !get().pgn && line[line.length - 1]!.id === currentId;
      const added = addMove(tree, currentId, {
        san: move.san,
        uci: uciOf(move),
        fen: chess.fen(),
        origin: entering ? "game" : "explore",
      });
      setTree(added.tree, added.id);
      return true;
    },

    playLine(fromId, uci) {
      let tree = get().tree;
      let current = fromId;
      const { fens, sans, ucis } = lineFens(getNode(tree, fromId).fen, uci);
      ucis.forEach((u, i) => {
        const added = addMove(tree, current, {
          san: sans[i]!,
          uci: u,
          fen: fens[i + 1]!,
          origin: "explore",
        });
        tree = added.tree;
        current = added.id;
      });
      setTree(tree, current);
    },

    deleteVariation(id) {
      const { tree, currentId, pgn } = get();
      const node = getNode(tree, id);
      // Game moves can only be taken back while entering a game on the board.
      if (node.parentId === null || (node.origin === "game" && pgn)) return;
      // Leave the variation first if the current position is inside it.
      let path = currentId;
      let inside = false;
      for (let n: NodeId | null = currentId; n !== null; n = getNode(tree, n).parentId) {
        if (n === id) inside = true;
      }
      if (inside) path = node.parentId;
      setTree(deleteSubtree(tree, id, { allowGameMoves: !pgn }), path);
    },

    showPreview(fromId, uci, label, step) {
      const from = getNode(get().tree, fromId);
      const { fens, sans, ucis } = lineFens(from.fen, uci);
      if (!ucis.length) return;
      set({
        preview: {
          fromId,
          fens,
          uci: ucis,
          san: sans,
          step: Math.max(0, Math.min(step ?? 1, ucis.length)),
          label,
        },
      });
    },
    previewFromBoard(uci, label, step = 1) {
      if (get().preview) get().keepPreview();
      get().showPreview(get().currentId, uci, label, step);
    },
    playFromBoard(uci) {
      if (get().preview) get().keepPreview();
      get().playLine(get().currentId, uci);
    },

    previewStep(step) {
      const { preview } = get();
      if (!preview) return;
      if (step < 0) {
        set({ preview: null });
        return;
      }
      set({ preview: { ...preview, step: Math.min(step, preview.uci.length) } });
    },
    closePreview() {
      set({ preview: null });
    },
    keepPreview() {
      const { preview } = get();
      if (!preview) return;
      if (preview.step === 0) {
        set({ preview: null, currentId: preview.fromId });
        return;
      }
      get().playLine(preview.fromId, preview.uci.slice(0, preview.step));
    },

    recordLive(analysis) {
      const key = positionKey(analysis.fen);
      const previous = get().livePositions[key];
      if (
        previous &&
        previous.depth > analysis.depth &&
        previous.limits.multiPv >= analysis.limits.multiPv
      ) {
        return;
      }
      set((s) => ({ livePositions: { ...s.livePositions, [key]: analysis } }));
    },

    async startGameAnalysis(presetId) {
      const preset = ANALYSIS_PRESETS.find((p) => p.id === presetId) ?? ANALYSIS_PRESETS[1]!;
      get().cancelGameAnalysis();
      const controller = new AbortController();
      runController = controller;
      const service = getEngineService();
      const line = mainline(get().tree);
      const fens = line.map((n) => n.fen);
      const ucis = line.slice(1).map((n) => n.uci ?? "");
      const gameId = get().gameId;
      set({
        run: { state: "running", presetId: preset.id, done: 0, total: fens.length },
        gamePositions: {},
      });

      const persistStatus = async (state: "partial" | "complete", analyzed: number) => {
        if (!gameId || get().gameId !== gameId) return;
        try {
          await games.update(gameId, {
            analysis: {
              state,
              presetId: preset.id,
              engine: service.engineId,
              analyzed,
              total: fens.length,
            },
          });
        } catch (error) {
          set({ saveError: storageProblem(error) });
        }
      };

      let analyzed = 0;
      try {
        const plan = await planGame(fens, preset.limits);
        if (runController !== controller) return;
        const results = await analyzeGame(
          fens,
          ucis,
          (fen, limits, signal, lane) => {
            const handle = service.analyze(fen, limits, { priority: "background", lane });
            signal.addEventListener("abort", handle.cancel);
            return handle.promise;
          },
          {
            plan,
            strategy: ANALYSIS_STRATEGY,
            engine: service.engineId,
            cache: analysisCache,
            signal: controller.signal,
            concurrency: service.parallelism,
            ...(useSettings.getState().cloudEval ? { remote: createCloudEval() } : {}),
            onPosition: (_, analysis) => {
              if (runController !== controller) return;
              analyzed++;
              set((s) => {
                const key = positionKey(analysis.fen);
                const existing = s.gamePositions[key];
                // A scan result never replaces a deeper one (a cloud evaluation, say).
                return existing && existing.depth > analysis.depth
                  ? {}
                  : { gamePositions: { ...s.gamePositions, [key]: analysis } };
              });
            },
            onProgress: (done, total) => {
              if (runController !== controller) return;
              set((s) => ({ run: { ...s.run, done, total } }));
            },
          },
        );
        if (runController !== controller) return;
        const complete = results.every(Boolean);
        set((s) => ({
          run: { ...s.run, state: complete ? "done" : "cancelled", ...(complete ? { done: fens.length } : {}) },
        }));
        await persistStatus(complete ? "complete" : "partial", results.filter(Boolean).length);
      } catch (error) {
        if (runController !== controller) return;
        if (isAbortError(error)) {
          set((s) => ({ run: { ...s.run, state: "cancelled" } }));
          await persistStatus("partial", analyzed);
        } else {
          set((s) => ({
            run: {
              ...s.run,
              state: "error",
              error: error instanceof Error ? error.message : "The analysis failed.",
            },
          }));
          if (analyzed) await persistStatus("partial", analyzed);
        }
      } finally {
        if (runController === controller) runController = null;
      }
    },

    cancelGameAnalysis(byUser = false) {
      if (runController) {
        runController.abort();
        runController = null;
        set((s) => ({
          run:
            s.run.state === "running"
              ? { ...s.run, state: "cancelled", userStopped: byUser || undefined }
              : s.run,
        }));
        if (byUser) {
          // Keep what was analyzed so far for a later resume.
          const { gameId, run } = get();
          if (gameId && run.presetId) {
            void games
              .update(gameId, {
                analysis: {
                  state: "partial",
                  presetId: run.presetId,
                  engine: getEngineService().engineId,
                  analyzed: run.done,
                  total: run.total,
                },
              })
              .catch((error: unknown) => set({ saveError: storageProblem(error) }));
          }
        }
      }
    },

    async restoreGameAnalysis(presetId, persisted) {
      const preset = ANALYSIS_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const service = getEngineService();
      const fens = mainline(get().tree).map((n) => n.fen);
      const plan = await planGame(fens, preset.limits);
      // Moves the scan settled were never searched at the preset's depth: their scan
      // result counts, when the analysis was completed.
      const scanDepth = ANALYSIS_STRATEGY.scanDepth || (preset.limits.depth ?? 0);
      const scanPlan = await planGame(fens, { ...preset.limits, depth: scanDepth });
      const found: Record<string, PositionAnalysis> = {};
      let deep = 0;
      for (const [i, fen] of fens.entries()) {
        const full = await analysisCache.get(fen, service.engineId, plan[i]!);
        const cached = full ?? (await analysisCache.get(fen, service.engineId, scanPlan[i]!));
        if (full) deep++;
        if (cached) found[positionKey(fen)] = cached;
      }
      const count = fens.filter((fen) => found[positionKey(fen)]).length;
      const complete = count === fens.length && (persisted === "complete" || deep === fens.length);
      set({
        gamePositions: found,
        run: {
          state: complete ? "done" : count ? "cancelled" : "idle",
          presetId,
          done: count,
          total: fens.length,
        },
      });
    },

    async setTitle(title) {
      const trimmed = title.trim();
      if (!trimmed) return;
      set({ title: trimmed });
      const id = get().gameId;
      if (!id) return;
      try {
        await games.rename(id, trimmed);
      } catch (error) {
        set({ saveError: storageProblem(error) });
      }
    },

    async saveAsNew(record) {
      await games.add([record]);
      set({ gameId: record.id, title: record.title, pgn: record.pgn, headers: record.headers });
    },
  };
});

/** Current node, or the previewed position while a line preview is shown. */
export function useBoardFen(): string {
  return useAnalysis((s) =>
    s.preview ? s.preview.fens[s.preview.step]! : getNode(s.tree, s.currentId).fen,
  );
}
