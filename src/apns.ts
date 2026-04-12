import apn from "@parse/node-apn";
import { readFileSync } from "fs";
import type { Notification, Device } from "./schema.js";
import { getContentBody } from "./schema.js";
import { config } from "./config.js";
import type { SendResult } from "./push.js";

type ApnsResponses = Awaited<ReturnType<apn.Provider["send"]>>;

// ── Provider singleton ───────────────────────────────────────────────
// Initialized at module load so readFileSync runs once at startup, not
// on the first incoming request.

const _provider: apn.Provider | null = config.apns
  ? new apn.Provider({
      token: {
        key:    readFileSync(config.apns.keyPath),
        keyId:  config.apns.keyId,
        teamId: config.apns.teamId,
      },
      production: true,
    })
  : null;

// ── Payload builders ─────────────────────────────────────────────────

function buildBody(notification: Notification): string {
  const sender = notification.sender_display_name;
  const body   = getContentBody(notification);
  if (sender && body) return `${sender}: ${body}`;
  if (sender) return sender;
  return "New message";
}

function expiryTimestamp(): number {
  return Math.floor(Date.now() / 1000) + config.pushTtlSeconds;
}

function buildAlertNotification(notification: Notification, bundleId: string): apn.Notification {
  const note = new apn.Notification();
  note.pushType = "alert";
  note.topic    = bundleId;
  note.priority = 10;
  note.expiry   = expiryTimestamp();
  note.alert    = {
    title: notification.room_name ?? notification.room_id ?? "Message",
    body:  buildBody(notification),
  };
  note.badge   = notification.counts?.unread ?? 0;
  note.sound   = "default";
  note.payload = { room_id: notification.room_id };
  return note;
}

function buildVoipNotification(notification: Notification, bundleId: string): apn.Notification {
  const note = new apn.Notification();
  note.pushType = "voip";
  note.topic    = `${bundleId}.voip`;
  note.priority = 10;
  note.expiry   = expiryTimestamp();
  note.payload  = {
    event_id:            notification.event_id,
    room_id:             notification.room_id,
    sender_display_name: notification.sender_display_name,
  };
  return note;
}

// ── Result mapper ────────────────────────────────────────────────────

function mapApnsResponse(responses: ApnsResponses, pushkey: string): SendResult {
  if (responses.sent.length > 0) {
    return { pushkey, ok: true };
  }

  const failure = responses.failed[0];
  if (!failure) {
    return { pushkey, ok: false, error: "No sent or failed entries in APNs response" };
  }

  const reason = failure.response?.reason;
  const status = failure.status ? parseInt(failure.status, 10) : undefined;

  if (reason === "Unregistered") {
    return { pushkey, ok: false, statusCode: 410, error: reason };
  }

  return {
    pushkey,
    ok: false,
    statusCode: status,
    error: reason ?? failure.error?.message ?? "Unknown APNs error",
  };
}

// ── Send ─────────────────────────────────────────────────────────────

async function sendApnsPush(
  build: (notification: Notification, bundleId: string) => apn.Notification,
  notification: Notification,
  device: Device,
): Promise<SendResult> {
  if (!_provider || !config.apns) {
    return { pushkey: device.pushkey, ok: false, error: "APNs not configured" };
  }
  try {
    const note      = build(notification, config.apns.bundleId);
    const responses = await _provider.send(note, device.pushkey);
    return mapApnsResponse(responses, device.pushkey);
  } catch (err) {
    return { pushkey: device.pushkey, ok: false, error: String(err) };
  }
}

export function sendAlertPush(notification: Notification, device: Device): Promise<SendResult> {
  return sendApnsPush(buildAlertNotification, notification, device);
}

export function sendVoipPush(notification: Notification, device: Device): Promise<SendResult> {
  return sendApnsPush(buildVoipNotification, notification, device);
}
