import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../apns.js", () => ({
  sendAlertPush: vi.fn(async (_n, d) => ({ pushkey: d.pushkey, ok: true })),
  sendVoipPush:  vi.fn(async (_n, d) => ({ pushkey: d.pushkey, ok: true })),
  shutdownApns:  vi.fn(),
}));
vi.mock("../dedup.js", () => ({
  isDuplicate: vi.fn(() => false),
}));
vi.mock("../ratelimit.js", () => ({
  consume: vi.fn(() => true),
}));

import { sendToDevice } from "../push.js";
import { sendAlertPush, sendVoipPush } from "../apns.js";
import { isDuplicate } from "../dedup.js";
import { consume } from "../ratelimit.js";
import type { Notification, Device } from "../schema.js";

const CALL = "org.matrix.msc3401.call.member";

function notif(type: string | null | undefined, device: Device): Notification {
  return {
    event_id: "$e:ex",
    room_id:  "!r:ex",
    prio:     "high",
    type:     type ?? null,
    content:  type === CALL ? { call_id: "c1", "io.kohera.is_video": false } : {},
    devices:  [device],
  } as Notification;
}

const voipDev:  Device = { app_id: "io.kohera.voip", pushkey: "tok-voip" };
const alertDev: Device = { app_id: "io.kohera",      pushkey: "tok-alert" };

describe("sendToDevice VoIP gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops VoIP for m.room.encrypted without calling transport", async () => {
    const res = await sendToDevice(notif("m.room.encrypted", voipDev), voipDev);
    expect(res).toEqual({ pushkey: "tok-voip", ok: true });
    expect(sendVoipPush).not.toHaveBeenCalled();
    expect(sendAlertPush).not.toHaveBeenCalled();
  });

  it("drops VoIP for missing type", async () => {
    const res = await sendToDevice(notif(null, voipDev), voipDev);
    expect(res.ok).toBe(true);
    expect(sendVoipPush).not.toHaveBeenCalled();
  });

  it("routes VoIP for call.member", async () => {
    await sendToDevice(notif(CALL, voipDev), voipDev);
    expect(sendVoipPush).toHaveBeenCalledOnce();
    expect(sendAlertPush).not.toHaveBeenCalled();
  });

  it("routes non-VoIP device to alert regardless of type", async () => {
    await sendToDevice(notif("m.room.message", alertDev), alertDev);
    expect(sendAlertPush).toHaveBeenCalledOnce();
    expect(sendVoipPush).not.toHaveBeenCalled();
  });

  it("gate fires before dedup (no dedup consult on drop)", async () => {
    await sendToDevice(notif("m.room.encrypted", voipDev), voipDev);
    expect(isDuplicate).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it("gate fires before rate-limit on drop", async () => {
    // Even if bucket would be full, drop is free.
    vi.mocked(consume).mockReturnValueOnce(false);
    const res = await sendToDevice(notif("m.room.encrypted", voipDev), voipDev);
    expect(res.ok).toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });
});
