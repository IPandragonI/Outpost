import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { playSound, soundForSan, soundsUnlocked } from "@/lib/sound";

describe("soundForSan", () => {
  it("tells the move types apart", () => {
    expect(soundForSan("e4")).toBe("move");
    expect(soundForSan("Nf3")).toBe("move");
    expect(soundForSan("exd5")).toBe("capture");
    expect(soundForSan("Qxf7")).toBe("capture");
    expect(soundForSan("O-O")).toBe("castle");
    expect(soundForSan("O-O-O")).toBe("castle");
    expect(soundForSan("Qh5+")).toBe("check");
    expect(soundForSan("Qxf7+")).toBe("check");
    expect(soundForSan("e8=Q")).toBe("promote");
    expect(soundForSan("exd8=Q+")).toBe("promote");
  });

  it("ends the game on checkmate and on a drawn position", () => {
    expect(soundForSan("Qxf7#")).toBe("end");
    // The move itself shows nothing special; the position after it is stalemate.
    expect(soundForSan("Qc7", "k7/2Q5/1K6/8/8/8/8/8 b - - 1 1")).toBe("end");
    // The same move in a position where Black can still move.
    expect(soundForSan("Qh3", "k7/8/1K6/8/8/7Q/8/8 b - - 1 1")).toBe("move");
  });
});

describe("playSound", () => {
  it("stays silent until the user has interacted with the page", () => {
    expect(soundsUnlocked()).toBe(false);
    expect(() => playSound("move", 1)).not.toThrow();
  });
});

describe("sound assets", () => {
  it("ships one file per sound", () => {
    const files = readdirSync(join(__dirname, "..", "public", "sounds"));
    for (const name of ["move", "capture", "castle", "check", "promote", "illegal", "game-end"]) {
      expect(files, name).toContain(`${name}.wav`);
    }
  });
});
