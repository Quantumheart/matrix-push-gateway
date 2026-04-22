import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

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

import { router } from "../routes.js";
import { sendAlertPush, sendVoipPush } from "../apns.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

const CALL = "org.matrix.msc3401.call.member";

function body(type: string, content: Record<string, unknown> = {}) {
  return {
    notification: {
      event_id: "$e:ex",
      room_id:  "!r:ex",
      type,
      content,
      devices: [
        { app_id: "io.kohera",      pushkey: "tok-alert" },
        { app_id: "io.kohera.voip", pushkey: "tok-voip" },
      ],
    },
  };
}

describe("POST /_matrix/push/v1/notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fans non-call event to alert only (VoIP gated)", async () => {
    const res = await request(makeApp())
      .post("/_matrix/push/v1/notify")
      .send(body("m.room.encrypted"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rejected: [] });
    expect(sendAlertPush).toHaveBeenCalledOnce();
    expect(sendVoipPush).not.toHaveBeenCalled();
  });

  it("fans call.member to both transports", async () => {
    const res = await request(makeApp())
      .post("/_matrix/push/v1/notify")
      .send(body(CALL, { call_id: "c1", "io.kohera.is_video": true }));
    expect(res.status).toBe(200);
    expect(sendAlertPush).toHaveBeenCalledOnce();
    expect(sendVoipPush).toHaveBeenCalledOnce();
  });

  it("rejects malformed body with 400", async () => {
    const res = await request(makeApp())
      .post("/_matrix/push/v1/notify")
      .send({ nope: true });
    expect(res.status).toBe(400);
    expect(res.body.errcode).toBe("M_BAD_JSON");
  });
});
