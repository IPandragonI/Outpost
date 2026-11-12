import { describe, expect, it } from "vitest";
import { sideOf } from "@/features/analysis/perspective";

describe("sideOf", () => {
  const headers = { White: "TestPlayer", Black: "Rival" };

  it("finds the side of the account, ignoring case", () => {
    expect(sideOf(headers, "testplayer")).toBe("w");
    expect(sideOf(headers, " RIVAL ")).toBe("b");
  });

  it("is null for a stranger or an empty name", () => {
    expect(sideOf(headers, "someone")).toBeNull();
    expect(sideOf(headers, "")).toBeNull();
  });
});
