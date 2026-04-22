import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildVoipNotification } from "../apns.js";
import type { Notification } from "../schema.js";

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    event_id: "$evt:example.org",
    room_id:  "!room:example.org",
    prio:     "high",
    devices:  [{ app_id: "io.kohera.voip", pushkey: "token" }],
    ...overrides,
  } as Notification;
}

describe("buildVoipNotification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("populates all CallKit fields from content", () => {
    const n = makeNotification({
      sender_display_name: "Alice",
      content: { call_id: "call-abc", "io.kohera.is_video": true },
    });
    const note = buildVoipNotification(n, "io.kohera.voip");

    expect(note.pushType).toBe("voip");
    expect(note.priority).toBe(10);
    expect(note.topic).toBe("io.kohera.voip");
    expect(note.payload).toMatchObject({
      event_id:            "$evt:example.org",
      event_type:          "org.matrix.msc3401.call.member",
      room_id:             "!room:example.org",
      call_id:             "call-abc",
      is_video:            true,
      sender_display_name: "Alice",
    });
  });

  it("appends .voip suffix when topic missing it", () => {
    const note = buildVoipNotification(makeNotification(), "io.kohera.app");
    expect(note.topic).toBe("io.kohera.app.voip");
  });

  it("defaults is_video to false when flag absent", () => {
    const n = makeNotification({ content: { call_id: "c1" } });
    const note = buildVoipNotification(n, "io.kohera.voip");
    expect((note.payload as Record<string, unknown>)["is_video"]).toBe(false);
  });

  it("warns and still builds when call_id missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const n = makeNotification({ content: {} });
    const note = buildVoipNotification(n, "io.kohera.voip");
    expect(warn).toHaveBeenCalledOnce();
    expect((note.payload as Record<string, unknown>)["call_id"]).toBeUndefined();
  });

  it("sets expiry ~30s in the future", () => {
    const before = Math.floor(Date.now() / 1000);
    const note = buildVoipNotification(makeNotification({
      content: { call_id: "c1" },
    }), "io.kohera.voip");
    const after = Math.floor(Date.now() / 1000);
    expect(note.expiry).toBeGreaterThanOrEqual(before + 30);
    expect(note.expiry).toBeLessThanOrEqual(after + 30);
  });
});
