import { Chess } from "chess.js";
import { sideToMove, type Color } from "@/lib/chess/position";
import { cp, mate, type Score } from "./evaluation";
import { goCommand, parseUciLine, type InfoLine, type SearchLimits } from "./uci";

/** Line-based connection to a UCI engine: a Web Worker in the browser, a process in tests. */
export interface EngineTransport {
  post(command: string): void;
  listen(handler: (line: string) => void): void;
  onError(handler: (error: Error) => void): void;
  terminate(): void;
}

export interface EngineLine {
  multipv: number;
  /** White point of view. */
  score: Score;
  depth: number;
  seldepth?: number;
  /** UCI moves, starting with this line's first move. */
  pv: string[];
}

export interface PositionAnalysis {
  fen: string;
  /** Best line first. Empty for positions without legal moves. */
  lines: EngineLine[];
  /** Score of the position (the best line's, or the result of a finished game). */
  score: Score;
  bestMove: string | null;
  /** Depth reached by the best line. */
  depth: number;
  nodes?: number;
  timeMs: number;
  limits: SearchLimits;
  engine: string;
  /** False when the search was stopped before reaching its limit. */
  complete: boolean;
  /**
   * Set when the search stopped short of `limits.depth` on purpose (a forced move, or a
   * search that had settled): the depth this result stands for, which is what cache
   * lookups compare against.
   */
  requestedDepth?: number;
  shortcut?: "forced" | "settled";
  /** Fetched from a cloud evaluation service rather than searched here. */
  source?: "cloud";
}

export interface EngineOptions {
  threads?: number;
  hashMb?: number;
  /** Fail when the engine does not answer `uci` / `isready` in time. */
  initTimeoutMs?: number;
  /**
   * Identity stamped on results (`PositionAnalysis.engine`), which decides whether a
   * cached result is comparable. Defaults to the name the engine reports over UCI; the
   * app sets it to the build it ships, so results are recognized across sessions even
   * before the engine has started.
   */
  label?: string;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

const UPDATE_INTERVAL_MS = 200;

/** A position with a single legal move is searched no deeper than this. */
export const FORCED_MOVE_DEPTH = 12;
/** Early stop: never before this depth (special labels and confidence need depth 12). */
export const SETTLE_MIN_DEPTH = 12;
/** Early stop: how many consecutive depths must agree. */
export const SETTLE_DEPTHS = 3;
/** Early stop: the score may move by this many centipawns over those depths. */
export const SETTLE_CP = 10;

export interface DepthResult {
  depth: number;
  move: string;
  score: Score;
}

/**
 * Whether a search has settled: over the last `SETTLE_DEPTHS` consecutive depths (the
 * latest at least `SETTLE_MIN_DEPTH`) the best move is the same and the score stayed
 * within `SETTLE_CP` centipawns (a mate must keep the same distance). Later depths of such
 * a search almost never change the verdict, and they cost most of the time.
 */
export function isSettled(history: ReadonlyMap<number, DepthResult>, depth: number): boolean {
  if (depth < SETTLE_MIN_DEPTH) return false;
  const recent: DepthResult[] = [];
  for (let d = depth; d > depth - SETTLE_DEPTHS; d--) {
    const entry = history.get(d);
    if (!entry) return false;
    recent.push(entry);
  }
  const first = recent[0]!;
  if (!recent.every((r) => r.move === first.move)) return false;
  if (first.score.kind === "mate") {
    return recent.every(
      (r) =>
        r.score.kind === "mate" &&
        r.score.winner === (first.score as { winner: Color }).winner &&
        r.score.moves === (first.score as { moves: number }).moves,
    );
  }
  const values = recent.map((r) => (r.score.kind === "cp" ? r.score.cp : NaN));
  if (values.some(Number.isNaN)) return false;
  return Math.max(...values) - Math.min(...values) <= SETTLE_CP;
}

/** Score of a position without legal moves, which engines report inconsistently. */
export function terminalScore(fen: string): Score | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return mate(0, chess.turn() === "w" ? "b" : "w");
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return cp(0);
  return null;
}

/**
 * Speaks UCI to one engine instance. Searches run one at a time, in call order; aborting
 * a search sends `stop` and resolves it with what was found so far (`complete: false`).
 */
export class UciEngine {
  name = "Unknown engine";
  /** Identity stamped on results (see EngineOptions.label). */
  label: string | null = null;
  private handlers = new Set<(line: string) => void>();
  private errorHandlers = new Set<(error: Error) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private multiPv = 1;
  private dead: Error | null = null;

  private constructor(private readonly transport: EngineTransport) {
    transport.listen((line) => {
      for (const handler of [...this.handlers]) handler(line);
    });
    transport.onError((error) => {
      this.dead = error;
      for (const handler of [...this.errorHandlers]) handler(error);
    });
  }

  static async create(transport: EngineTransport, options: EngineOptions = {}): Promise<UciEngine> {
    const engine = new UciEngine(transport);
    engine.label = options.label ?? null;
    const timeout = options.initTimeoutMs ?? 20_000;
    try {
      await engine.waitFor(
        "uci",
        (line) => {
          if (line.startsWith("id name ")) engine.name = line.slice("id name ".length).trim();
          return line.trim() === "uciok";
        },
        timeout,
      );
      if (options.threads && options.threads > 1) {
        transport.post(`setoption name Threads value ${options.threads}`);
      }
      if (options.hashMb) transport.post(`setoption name Hash value ${options.hashMb}`);
      await engine.waitFor("isready", (line) => line.trim() === "readyok", timeout);
    } catch (error) {
      transport.terminate();
      throw error;
    }
    return engine;
  }

  get isAlive(): boolean {
    return this.dead === null;
  }

  /** Sends `command` and resolves once a line satisfies `done`. */
  private waitFor(command: string, done: (line: string) => boolean, timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new EngineError(`The engine did not answer "${command}" in time.`));
      }, timeoutMs);
      const onLine = (line: string) => {
        if (done(line)) {
          cleanup();
          resolve();
        }
      };
      const onError = (error: Error) => {
        cleanup();
        reject(new EngineError(`The engine stopped working: ${error.message}`));
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.handlers.delete(onLine);
        this.errorHandlers.delete(onError);
      };
      this.handlers.add(onLine);
      this.errorHandlers.add(onError);
      this.transport.post(command);
    });
  }

  /**
   * Searches `fen`. `onUpdate` receives the lines found so far, throttled. Rejects with
   * an AbortError when `signal` is aborted before the search starts.
   */
  search(
    fen: string,
    limits: SearchLimits,
    onUpdate?: (analysis: PositionAnalysis) => void,
    signal?: AbortSignal,
  ): Promise<PositionAnalysis> {
    const run = () => this.runSearch(fen, limits, onUpdate, signal);
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }

  private async runSearch(
    fen: string,
    limits: SearchLimits,
    onUpdate: ((analysis: PositionAnalysis) => void) | undefined,
    signal: AbortSignal | undefined,
  ): Promise<PositionAnalysis> {
    if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
    if (this.dead) throw new EngineError(`The engine stopped working: ${this.dead.message}`);
    const started = Date.now();

    const terminal = terminalScore(fen);
    if (terminal) {
      return {
        fen,
        lines: [],
        score: terminal,
        bestMove: null,
        depth: 0,
        timeMs: 0,
        limits,
        engine: this.label ?? this.name,
        complete: true,
      };
    }

    // A position with one legal move needs no deep search: its score is that of the move.
    const forced =
      limits.depth !== undefined &&
      limits.depth > FORCED_MOVE_DEPTH &&
      new Chess(fen).moves().length === 1;
    const searchLimits: SearchLimits = forced ? { ...limits, depth: FORCED_MOVE_DEPTH } : limits;
    let marker: Pick<PositionAnalysis, "requestedDepth" | "shortcut"> = forced
      ? { requestedDepth: limits.depth!, shortcut: "forced" }
      : {};
    const history = new Map<number, DepthResult>();

    if (limits.multiPv !== this.multiPv) {
      this.transport.post(`setoption name MultiPV value ${limits.multiPv}`);
      this.multiPv = limits.multiPv;
    }
    await this.waitFor("isready", (line) => line.trim() === "readyok", 10_000);

    const turn: Color = sideToMove(fen);
    const lines = new Map<number, InfoLine>();
    let lastUpdate = 0;
    let stopped = false;

    const snapshot = (complete: boolean, bestMove: string | null): PositionAnalysis => {
      const sorted = [...lines.values()]
        .sort((a, b) => a.multipv - b.multipv)
        .map<EngineLine>((l) => ({
          multipv: l.multipv,
          score: l.score,
          depth: l.depth,
          ...(l.seldepth !== undefined ? { seldepth: l.seldepth } : {}),
          pv: l.pv,
        }));
      const best = lines.get(1);
      return {
        fen,
        lines: sorted,
        score: best?.score ?? cp(0),
        bestMove: bestMove ?? best?.pv[0] ?? null,
        depth: best?.depth ?? 0,
        ...(best?.nodes !== undefined ? { nodes: best.nodes } : {}),
        timeMs: best?.timeMs ?? Date.now() - started,
        limits,
        engine: this.label ?? this.name,
        complete: complete || marker.shortcut === "settled",
        ...marker,
      };
    };

    return new Promise<PositionAnalysis>((resolve, reject) => {
      const onAbort = () => {
        if (stopped) return;
        stopped = true;
        this.transport.post("stop");
      };
      const onLine = (raw: string) => {
        const message = parseUciLine(raw, turn);
        if (message.type === "info") {
          const info = message.info;
          const previous = lines.get(info.multipv);
          // A bound is only a hint: keep the previous exact score of the same depth.
          if (info.bound && previous && !previous.bound && previous.depth >= info.depth) return;
          lines.set(info.multipv, info);
          if (
            limits.earlyStop &&
            limits.depth &&
            info.multipv === 1 &&
            !info.bound &&
            !stopped &&
            info.pv[0] !== undefined
          ) {
            history.set(info.depth, { depth: info.depth, move: info.pv[0], score: info.score });
            if (info.depth < limits.depth && isSettled(history, info.depth)) {
              marker = { requestedDepth: limits.depth, shortcut: "settled" };
              stopped = true;
              this.transport.post("stop");
            }
          }
          const now = Date.now();
          if (onUpdate && now - lastUpdate > UPDATE_INTERVAL_MS) {
            lastUpdate = now;
            onUpdate(snapshot(false, null));
          }
        } else if (message.type === "bestmove") {
          cleanup();
          // Lines deeper than multipv 1 can lag a depth behind; drop ones from older
          // iterations that would mix two searches' results.
          const best = lines.get(1);
          if (best) {
            for (const [k, line] of lines) {
              if (k > 1 && line.depth < best.depth - 1) lines.delete(k);
            }
          }
          resolve(snapshot(!stopped || marker.shortcut === "settled", message.move));
        }
      };
      const onError = (error: Error) => {
        cleanup();
        reject(new EngineError(`The engine stopped working: ${error.message}`));
      };
      const cleanup = () => {
        this.handlers.delete(onLine);
        this.errorHandlers.delete(onError);
        signal?.removeEventListener("abort", onAbort);
      };
      this.handlers.add(onLine);
      this.errorHandlers.add(onError);
      signal?.addEventListener("abort", onAbort);
      this.transport.post(`position fen ${fen}`);
      this.transport.post(goCommand(searchLimits));
      if (signal?.aborted) onAbort();
    });
  }

  /** Clears the engine's hash, e.g. between unrelated games. */
  newGame(): Promise<void> {
    const run = async () => {
      this.transport.post("ucinewgame");
      await this.waitFor("isready", (line) => line.trim() === "readyok", 10_000);
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }

  /** Stops the engine. A search still running rejects with an EngineError. */
  terminate(): void {
    const error = new EngineError("the engine was restarted");
    this.dead ??= error;
    for (const handler of [...this.errorHandlers]) handler(error);
    this.transport.terminate();
  }
}
