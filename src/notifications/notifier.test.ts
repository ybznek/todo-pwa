import { describe, expect, it } from "vitest";
import { isNotificationSupported } from "./notifier";

describe("notifier", () => {
  it("detects Notification API support", () => {
    expect(typeof isNotificationSupported()).toBe("boolean");
  });
});
