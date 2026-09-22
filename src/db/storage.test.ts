import { describe, expect, it } from "vitest";
import { isNativeFileAccessAvailable, storageModeHint } from "./storage";

describe("storage", () => {
  it("detects native file access availability", () => {
    expect(typeof isNativeFileAccessAvailable()).toBe("boolean");
  });

  it("returns readable storage hints", () => {
    expect(storageModeHint("native")).toContain("Přímý zápis");
    expect(storageModeHint("fallback")).toContain("Stáhnout");
    expect(storageModeHint(null)).toContain("HTTPS");
  });
});
