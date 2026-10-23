import { ENGINE_FLAVORS, ENGINE_NAME, type EngineFlavor } from "./flavors";
import type { SearchLimits } from "./uci";
import { EngineError, UciEngine, type EngineTransport, type PositionAnalysis } from "./uci-engine";

/**
 * The app's Stockfish instances and their queue.
 *
 * - One primary engine (with the configured threads) serves "interactive" searches (the
 *   position on the board) first; they preempt background work on it, and a preempted
 *   search is put back in the queue, not lost.
 * - A few single-thread helper engines take only "background" searches (whole-game
 *   analysis), so the positions of a game are searched in parallel. Searching separate
 *   positions in parallel scales much better than giving one search more threads. Helpers
 *   start when background work is waiting and stop after a short idle time, so they do
 *   not hold memory while the user only browses.
 * - Cancelling a queued search removes it; cancelling a running one stops its engine and
 *   resolves with the partial result.
 * - A crashed engine is restarted once for the search it was running; the multi-threaded
 *   build falls back to the single-threaded one if it fails to start; helpers that cannot
 *   start are given up and their work goes to the primary engine.
 */

export type SearchPriority = "interactive" | "background";

export interface EngineConfig {
  flavor: EngineFlavor;
  threads: number;
  hashMb: number;
  /** Extra single-thread engines for background work (0: everything on the primary). */
  helpers?: number;
}

export type EngineStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; name: string; config: EngineConfig }
  | { state: "error"; message: string };

export interface SearchHandle {
  promise: Promise<PositionAnalysis>;
  cancel(): void;
}

interface Job {
  fen: string;
  limits: SearchLimits;
  priority: SearchPriority;
  onUpdate?: (analysis: PositionAnalysis) => void;
  /** Preferred engine for a background search (see `analyze`). */
  lane?: number;
  controller: AbortController;
  /** Set when an interactive search interrupted this background one. */
  preempted: boolean;
  /** Restarts already attempted after an engine crash. */
  retries: number;
  resolve(result: PositionAnalysis): void;
  reject(error: unknown): void;
}

interface Slot {
  /** 0 is the primary engine; others are background helpers. */
  index: number;
  engine: UciEngine | null;
  starting: Promise<UciEngine> | null;
  running: Job | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export interface EngineEnvironment {
  /** Creates the transport for a flavor (a Web Worker in the browser). */
  createTransport(flavor: EngineFlavor): EngineTransport;
  /** Picks the build and resources for this device. */
  detectConfig(): EngineConfig;
  /** How long a build may take to answer before it is considered broken. */
  initTimeoutMs?: number;
  /** Idle time after which helper engines are stopped. */
  helperIdleMs?: number;
}

function abortError() {
  return new DOMException("Search cancelled", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export class EngineService {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private statusValue: EngineStatus = { state: "idle" };
  private listeners = new Set<(status: EngineStatus) => void>();
  private config: EngineConfig | null = null;
  private configOverride: Partial<EngineConfig> = {};
  /** Set once a helper failed to start: background work stays on the primary engine. */
  private helpersBroken = false;

  constructor(private readonly env: EngineEnvironment) {
    this.slots = [this.newSlot(0)];
  }

  private newSlot(index: number): Slot {
    return { index, engine: null, starting: null, running: null, idleTimer: null };
  }

  get status(): EngineStatus {
    return this.statusValue;
  }

  subscribe(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: EngineStatus) {
    this.statusValue = status;
    for (const listener of this.listeners) listener(status);
  }

  /** Engine description stored with analysis results, so they can be compared later. */
  get engineId(): string {
    return ENGINE_NAME;
  }

  private resolvedConfig(): EngineConfig {
    this.config ??= { ...this.env.detectConfig(), ...this.configOverride };
    return this.config;
  }

  /** How many background searches can run at once. */
  get parallelism(): number {
    return 1 + (this.helpersBroken ? 0 : (this.resolvedConfig().helpers ?? 0));
  }

  /** Applies user resource settings; the engines restart on their next search. */
  configure(override: Partial<EngineConfig>) {
    this.configOverride = override;
    this.config = null;
    this.helpersBroken = false;
    this.restart();
  }

  analyze(
    fen: string,
    limits: SearchLimits,
    options: {
      priority?: SearchPriority;
      onUpdate?: (analysis: PositionAnalysis) => void;
      /**
       * Background searches with the same lane go to the same engine when it is free, so
       * consecutive positions of a game reuse that engine's hash table (which makes each
       * search more informed, as when a game is analyzed move after move). A free engine
       * with nothing in its own lane takes work from another lane.
       */
      lane?: number;
    } = {},
  ): SearchHandle {
    const controller = new AbortController();
    let job!: Job;
    const promise = new Promise<PositionAnalysis>((resolve, reject) => {
      job = {
        fen,
        limits,
        priority: options.priority ?? "interactive",
        ...(options.onUpdate ? { onUpdate: options.onUpdate } : {}),
        ...(options.lane !== undefined ? { lane: options.lane } : {}),
        controller,
        preempted: false,
        retries: 0,
        resolve,
        reject,
      };
    });
    this.enqueue(job);
    return {
      promise,
      cancel: () => {
        const index = this.queue.indexOf(job);
        if (index !== -1) {
          this.queue.splice(index, 1);
          job.reject(abortError());
        } else if (this.slots.some((s) => s.running === job)) {
          job.controller.abort();
        }
      },
    };
  }

  /** Cancels every search of a priority (e.g. when the analyzed game is closed). */
  cancelAll(priority?: SearchPriority) {
    const kept: Job[] = [];
    for (const job of this.queue) {
      if (!priority || job.priority === priority) job.reject(abortError());
      else kept.push(job);
    }
    this.queue = kept;
    for (const slot of this.slots) {
      if (slot.running && (!priority || slot.running.priority === priority)) {
        slot.running.controller.abort();
      }
    }
  }

  private insertBeforeBackground(job: Job) {
    const firstBackground = this.queue.findIndex((j) => j.priority === "background");
    if (firstBackground === -1) this.queue.push(job);
    else this.queue.splice(firstBackground, 0, job);
  }

  private enqueue(job: Job) {
    if (job.priority === "interactive") {
      this.insertBeforeBackground(job);
      const primary = this.slots[0]!;
      if (primary.running?.priority === "background") {
        primary.running.preempted = true;
        primary.running.controller.abort();
      }
    } else {
      this.queue.push(job);
    }
    this.pump();
  }

  /** Next job for an engine: interactive first (primary only), then its own lane. */
  private takeJob(slot: Slot, engines: number): Job | null {
    let index = slot.index === 0 ? this.queue.findIndex((j) => j.priority === "interactive") : -1;
    if (index === -1) {
      index = this.queue.findIndex(
        (j) => j.priority === "background" && (j.lane ?? 0) % engines === slot.index,
      );
    }
    if (index === -1) index = this.queue.findIndex((j) => j.priority === "background");
    if (index === -1) return null;
    return this.queue.splice(index, 1)[0]!;
  }

  /** Gives waiting jobs to free engines: interactive ones to the primary only. */
  private pump() {
    const helperCount = this.helpersBroken ? 0 : (this.resolvedConfig().helpers ?? 0);
    while (this.slots.length < 1 + helperCount) this.slots.push(this.newSlot(this.slots.length));
    for (const slot of this.slots.slice(0, 1 + helperCount)) {
      if (slot.running) continue;
      const job = this.takeJob(slot, 1 + helperCount);
      if (job) void this.run(slot, job);
    }
  }

  private async run(slot: Slot, job: Job) {
    slot.running = job;
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.idleTimer = null;
    try {
      const engine = await this.ensureEngine(slot);
      if (job.controller.signal.aborted && !job.preempted) throw abortError();
      const result = await engine.search(job.fen, job.limits, job.onUpdate, job.controller.signal);
      if (job.preempted) {
        // Interrupted by an interactive search: run it again later from the start.
        this.requeuePreempted(job);
      } else {
        job.resolve(result);
      }
    } catch (error) {
      if (job.preempted && isAbortError(error)) {
        this.requeuePreempted(job);
      } else if (slot.index > 0 && !slot.engine && !isAbortError(error)) {
        // A helper could not start: keep going with the primary engine alone.
        this.helpersBroken = true;
        this.queue.unshift(job);
      } else if (error instanceof EngineError && job.retries < 1) {
        // The engine died: restart it and try this search once more.
        this.stopSlot(slot);
        job.retries++;
        this.queue.unshift(job);
      } else {
        job.reject(error);
      }
    } finally {
      slot.running = null;
      if (slot.index > 0) this.scheduleHelperStop(slot);
      this.pump();
    }
  }

  private scheduleHelperStop(slot: Slot) {
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.idleTimer = setTimeout(() => {
      if (!slot.running) this.stopSlot(slot);
    }, this.env.helperIdleMs ?? 20_000);
  }

  private requeuePreempted(job: Job) {
    job.preempted = false;
    job.controller = new AbortController();
    this.insertBeforeBackground(job);
  }

  private ensureEngine(slot: Slot): Promise<UciEngine> {
    if (slot.engine?.isAlive) return Promise.resolve(slot.engine);
    slot.starting ??= (slot.index === 0 ? this.startPrimary(slot) : this.startHelper(slot)).finally(
      () => {
        slot.starting = null;
      },
    );
    return slot.starting;
  }

  private async startPrimary(slot: Slot): Promise<UciEngine> {
    this.setStatus({ state: "loading" });
    const config = this.resolvedConfig();
    const attempts: EngineConfig[] = [config];
    if (ENGINE_FLAVORS[config.flavor].threaded) {
      attempts.push({ ...config, flavor: "lite-single", threads: 1 });
    }
    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        const engine = await UciEngine.create(this.env.createTransport(attempt.flavor), {
          threads: attempt.threads,
          hashMb: attempt.hashMb,
          label: ENGINE_NAME,
          ...(this.env.initTimeoutMs ? { initTimeoutMs: this.env.initTimeoutMs } : {}),
        });
        slot.engine = engine;
        this.config = attempt;
        this.setStatus({ state: "ready", name: engine.name, config: attempt });
        return engine;
      } catch (error) {
        lastError = error;
      }
    }
    const message =
      lastError instanceof Error ? lastError.message : "The engine could not be started.";
    this.setStatus({ state: "error", message });
    throw lastError instanceof Error ? lastError : new EngineError(message);
  }

  /** Helpers: same build as the primary, one thread, a smaller hash table each. */
  private async startHelper(slot: Slot): Promise<UciEngine> {
    const config = this.resolvedConfig();
    const engine = await UciEngine.create(this.env.createTransport(config.flavor), {
      threads: 1,
      hashMb: Math.max(16, Math.floor(config.hashMb / 2)),
      label: ENGINE_NAME,
      ...(this.env.initTimeoutMs ? { initTimeoutMs: this.env.initTimeoutMs } : {}),
    });
    slot.engine = engine;
    return engine;
  }

  private stopSlot(slot: Slot) {
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.idleTimer = null;
    slot.engine?.terminate();
    slot.engine = null;
  }

  /** Terminates every engine; the next search starts fresh ones. */
  restart() {
    for (const slot of this.slots) this.stopSlot(slot);
    if (this.statusValue.state === "ready") this.setStatus({ state: "idle" });
  }

  dispose() {
    this.cancelAll();
    this.restart();
  }
}
