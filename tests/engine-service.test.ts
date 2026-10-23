import { afterEach, describe, expect, it } from "vitest";
import {
  EngineService,
  isAbortError,
  type EngineEnvironment,
} from "@/features/engine/engine-service";
import type { EngineFlavor } from "@/features/engine/flavors";
import type { EngineTransport } from "@/features/engine/uci-engine";
import { START_FEN } from "@/lib/chess/position";
import { nodeEngineTransport, silentTransport } from "./helpers/node-engine";

const MATE_IN_ONE = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";

/** Real engine, with a hook to simulate a crash of the current instance. */
function crashableEnv(flavors: EngineFlavor[] = []) {
  const transports: (EngineTransport & { crash(): void })[] = [];
  const env: EngineEnvironment = {
    initTimeoutMs: 300,
    detectConfig: () => ({ flavor: "lite-single", threads: 1, hashMb: 16 }),
    createTransport: (flavor) => {
      flavors.push(flavor);
      const inner = nodeEngineTransport();
      let onError: (error: Error) => void = () => {};
      const transport = {
        ...inner,
        onError: (handler: (error: Error) => void) => {
          onError = handler;
        },
        crash: () => {
          inner.terminate();
          onError(new Error("simulated crash"));
        },
      };
      transports.push(transport);
      return transport;
    },
  };
  return { env, transports };
}

let service: EngineService | null = null;
afterEach(() => {
  service?.dispose();
  service = null;
});

describe("EngineService", () => {
  it("analyzes a position and reports its status", async () => {
    const statuses: string[] = [];
    service = new EngineService(crashableEnv().env);
    service.subscribe((s) => statuses.push(s.state));
    const result = await service.analyze(MATE_IN_ONE, { depth: 8, multiPv: 1 }).promise;
    expect(result.bestMove).toBe("e1e8");
    expect(statuses).toEqual(["loading", "ready"]);
    // Results carry the identity cache lookups use, not the UCI name: otherwise stored
    // analyses would never be found again.
    expect(result.engine).toBe(service.engineId);
  });

  it("runs an interactive search before queued background work and resumes it after", async () => {
    service = new EngineService(crashableEnv().env);
    const order: string[] = [];
    const background = service.analyze(
      START_FEN,
      { depth: 14, multiPv: 1 },
      { priority: "background" },
    );
    background.promise.then(() => order.push("background"));
    await new Promise((r) => setTimeout(r, 150));
    const interactive = service.analyze(MATE_IN_ONE, { depth: 6, multiPv: 1 });
    interactive.promise.then(() => order.push("interactive"));
    const [bg, it] = await Promise.all([background.promise, interactive.promise]);
    expect(order).toEqual(["interactive", "background"]);
    // The preempted search was run again in full, not returned half-done.
    expect(bg.complete).toBe(true);
    expect(bg.fen).toBe(START_FEN);
    expect(it.bestMove).toBe("e1e8");
  });

  it("cancels a queued search without running it", async () => {
    service = new EngineService(crashableEnv().env);
    const first = service.analyze(START_FEN, { depth: 10, multiPv: 1 });
    const second = service.analyze(MATE_IN_ONE, { depth: 10, multiPv: 1 });
    second.cancel();
    await expect(second.promise).rejects.toSatisfy(isAbortError);
    await expect(first.promise).resolves.toMatchObject({ complete: true });
  });

  it("stops the running search on cancel and resolves with the partial result", async () => {
    service = new EngineService(crashableEnv().env);
    const search = service.analyze(START_FEN, { multiPv: 1 });
    await new Promise((r) => setTimeout(r, 400));
    search.cancel();
    const result = await search.promise;
    expect(result.complete).toBe(false);
  });

  it("restarts a crashed engine and retries the running search", async () => {
    const { env, transports } = crashableEnv();
    service = new EngineService(env);
    await service.analyze(MATE_IN_ONE, { depth: 4, multiPv: 1 }).promise;
    const search = service.analyze(START_FEN, { movetimeMs: 1500, multiPv: 1 });
    await new Promise((r) => setTimeout(r, 200));
    transports[0]!.crash();
    const result = await search.promise;
    expect(result.complete).toBe(true);
    expect(transports).toHaveLength(2);
  });

  it("falls back to the single-threaded build when the threaded one does not start", async () => {
    const flavors: EngineFlavor[] = [];
    const { env } = crashableEnv(flavors);
    service = new EngineService({
      ...env,
      detectConfig: () => ({ flavor: "lite-threaded", threads: 2, hashMb: 16 }),
      createTransport: (flavor) =>
        flavor === "lite-threaded" ? silentTransport() : env.createTransport(flavor),
    });
    const result = await service.analyze(MATE_IN_ONE, { depth: 6, multiPv: 1 }).promise;
    expect(result.bestMove).toBe("e1e8");
    expect(service.status).toMatchObject({
      state: "ready",
      config: { flavor: "lite-single", threads: 1 },
    });
  });

  it("reports an engine that cannot start at all", async () => {
    service = new EngineService({
      initTimeoutMs: 50,
      detectConfig: () => ({ flavor: "lite-single", threads: 1, hashMb: 16 }),
      createTransport: () => silentTransport(),
    });
    await expect(service.analyze(START_FEN, { depth: 4, multiPv: 1 }).promise).rejects.toThrow();
    expect(service.status.state).toBe("error");
  });
});
